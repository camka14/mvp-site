import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { parseDivisionAgeBracketFromId } from '@/lib/divisionTypes';
import {
  resolveEventDivisionSelection,
  type ResolvedDivisionSelection,
  validateRegistrantAgeForSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';
import {
  dispatchRequiredEventDocuments,
  type DispatchRequiredEventDocumentsResult,
} from '@/lib/eventConsentDispatch';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  buildEventParticipantSnapshot,
  syncDivisionTeamMembershipFromRegistrations,
  upsertEventRegistration,
  type RegistrationLifecycleStatus,
} from '@/server/events/eventRegistrations';
import {
  isWeeklyOccurrenceJoinClosed,
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
  type ResolvedWeeklyOccurrence,
} from '@/server/events/weeklyOccurrences';
import { resolveEventRegistrationPriceCents } from '@/server/paidRegistrationGate';
import {
  syncCanonicalTeamRoster,
  applyCanonicalTeamRegistrationMetadata,
} from '@/server/teams/teamMembership';
import {
  assertPublicWidgetEvent,
  ensureGuestChildUserData,
  ensureGuestParentChildLink,
  ensureGuestParentIdentity,
  normalizeGuestEmail,
  normalizeGuestText,
  normalizeRequiredTemplateIds,
  parseGuestDateOfBirth,
  signGuestRegistrationToken,
} from '@/server/publicGuestRegistration';
import {
  loadAndBuildRegistrationAnswerSnapshot,
  upsertRegistrationQuestionResponse,
} from '@/server/registrationQuestions';
import { sendEventRegistrationHostNotification } from '@/server/registrationHostNotifications';

export const dynamic = 'force-dynamic';

const parentSchema = z.object({
  email: z.string().trim().email('Parent email is required.'),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  dateOfBirth: z.string().trim().optional(),
}).strict();

const childSchema = z.object({
  firstName: z.string().trim().min(1, 'Child first name is required.'),
  lastName: z.string().trim().min(1, 'Child last name is required.'),
  email: z.string().trim().optional(),
  dateOfBirth: z.string().trim().min(1, 'Child date of birth is required.'),
  relationship: z.string().trim().optional(),
}).strict();

const rosterPlayerSchema = z.object({
  firstName: z.string().trim().min(1, 'Player first name is required.'),
  lastName: z.string().trim().min(1, 'Player last name is required.'),
  email: z.string().trim().optional(),
  dateOfBirth: z.string().trim().optional(),
  relationship: z.string().trim().optional(),
  guardianFirstName: z.string().trim().optional(),
  guardianLastName: z.string().trim().optional(),
  guardianEmail: z.string().trim().optional(),
  guardianRelationship: z.string().trim().optional(),
  jerseyNumber: z.string().trim().optional(),
  position: z.string().trim().optional(),
  isCaptain: z.boolean().optional(),
}).strict();

const adultStaffSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().trim().optional(),
}).strict();

const teamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required.'),
  teamSize: z.coerce.number().int().min(2).max(100).optional(),
  players: z.array(rosterPlayerSchema).max(100).optional(),
  includeParentAsPlayer: z.boolean().optional(),
  includeCreatorAsManager: z.boolean().optional(),
  includeParentAsManager: z.boolean().optional(),
  manager: adultStaffSchema.optional(),
  headCoach: adultStaffSchema.optional(),
  assistantCoaches: z.array(adultStaffSchema).max(10).optional(),
}).strict();

const payloadSchema = z.object({
  mode: z.enum(['team', 'free_agent']),
  parent: parentSchema,
  child: childSchema.optional(),
  team: teamSchema.optional(),
  divisionId: z.string().trim().optional(),
  divisionTypeId: z.string().trim().optional(),
  divisionTypeKey: z.string().trim().optional(),
  slotId: z.string().trim().optional(),
  occurrenceDate: z.string().trim().optional(),
  answers: z.any().optional(),
}).strict();

type RouteContext = {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
};

const normalizeOptionalId = (value: unknown): string | null => normalizeGuestText(value);

const responseError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const getNumberOrNull = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const requiresGuardianForSelection = (
  event: Record<string, any>,
  selection: ResolvedDivisionSelection,
): boolean => {
  const bracket = parseDivisionAgeBracketFromId(selection.divisionTypeId ?? selection.divisionTypeKey);
  if (bracket) {
    return bracket.age < 18 && bracket.kind !== 'MINIMUM';
  }
  const maxAge = getNumberOrNull(event.maxAge);
  return maxAge !== null && maxAge < 18;
};

const buildEventTeamStaffAssignmentId = (eventTeamId: string, role: string, userId: string): string => `${eventTeamId}__${role}__${userId}`;

const hasAdultStaffInput = (input: z.infer<typeof adultStaffSchema> | null | undefined): boolean => (
  Boolean(
    input
    && (
      normalizeGuestText(input.firstName)
      || normalizeGuestText(input.lastName)
      || normalizeGuestText(input.email)
    ),
  )
);

const ensureOptionalGuestAdultIdentity = async (
  tx: any,
  input: z.infer<typeof adultStaffSchema> | null | undefined,
  now: Date,
  label: string,
): Promise<{ userId: string } | null> => {
  if (!hasAdultStaffInput(input)) {
    return null;
  }
  const email = normalizeGuestEmail(input?.email);
  if (!email) {
    throw Object.assign(new Error(`${label} email is required when ${label.toLowerCase()} details are provided.`), { status: 400 });
  }
  return ensureGuestParentIdentity(tx, {
    email,
    firstName: input?.firstName ?? null,
    lastName: input?.lastName ?? null,
    dateOfBirth: null,
  }, now);
};

type RequiredTemplateRecord = {
  id: string;
  requiredSignerType?: string | null;
  signOnce?: boolean | null;
};

type PendingEventDocumentDispatch = {
  registrationId: string;
  aggregateTeamRegistrationId?: string | null;
  eventId: string;
  organizationId: string | null;
  requiredTemplateIds: string[];
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
};

type AppliedEventDocumentDispatch = PendingEventDocumentDispatch & {
  consent: DispatchRequiredEventDocumentsResult;
};

const loadRequiredEventTemplates = async (requiredTemplateIds: string[]): Promise<Map<string, RequiredTemplateRecord>> => {
  if (!requiredTemplateIds.length) {
    return new Map();
  }
  const templates = await (prisma as any).templateDocuments.findMany({
    where: { id: { in: requiredTemplateIds } },
    select: {
      id: true,
      requiredSignerType: true,
      signOnce: true,
    },
  });
  return new Map(
    templates.map((template: RequiredTemplateRecord) => [String(template.id), template]),
  );
};

const filterRequiredTemplateIdsForRegistrantType = (
  requiredTemplateIds: string[],
  templatesById: Map<string, RequiredTemplateRecord>,
  registrantType: 'SELF' | 'CHILD',
): string[] => requiredTemplateIds.filter((templateId) => {
  const template = templatesById.get(templateId);
  if (!template) {
    return false;
  }
  const signerType = normalizeRequiredSignerType(template.requiredSignerType);
  return registrantType === 'CHILD'
    ? signerType !== 'PARTICIPANT'
    : signerType === 'PARTICIPANT';
});

const buildConsentStatus = (
  requiredTemplateIds: string[],
  consent: DispatchRequiredEventDocumentsResult | null | undefined,
): string | null => {
  if (!requiredTemplateIds.length) {
    return null;
  }
  if (!consent) {
    return 'pending_send';
  }
  if (consent.missingChildEmail) {
    return 'child_email_required';
  }
  if (consent.errors.length > 0) {
    return 'send_failed';
  }
  return consent.sentDocumentIds.length > 0 ? 'sent' : 'pending_signature';
};

const isSignedDocumentStatus = (value: unknown): boolean => {
  const normalized = normalizeGuestText(value)?.toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const hasSignedDocumentForSigner = async (params: {
  client: any;
  eventId: string;
  template: RequiredTemplateRecord;
  userId: string | null | undefined;
  signerRole: 'participant' | 'parent_guardian' | 'child';
  hostId?: string | null;
}): Promise<boolean> => {
  const userId = normalizeGuestText(params.userId);
  if (!userId) {
    return false;
  }
  const rows = await params.client.signedDocuments.findMany({
    where: {
      templateId: params.template.id,
      userId,
      signerRole: params.signerRole,
      hostId: normalizeGuestText(params.hostId) ?? null,
      ...(params.template.signOnce ? {} : { eventId: params.eventId }),
    },
    select: {
      status: true,
    },
    take: 20,
  });
  return rows.some((row: { status?: unknown }) => isSignedDocumentStatus(row.status));
};

const filterUnsignedTemplateIds = async (params: {
  client: any;
  eventId: string;
  templateIds: string[];
  templatesById: Map<string, RequiredTemplateRecord>;
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
}): Promise<string[]> => {
  const unsignedTemplateIds: string[] = [];
  for (const templateId of params.templateIds) {
    const template = params.templatesById.get(templateId);
    if (!template) {
      continue;
    }
    const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
    const signedChecks: Array<Promise<boolean>> = [];
    if (requiredSignerType === 'PARTICIPANT') {
      signedChecks.push(hasSignedDocumentForSigner({
        client: params.client,
        eventId: params.eventId,
        template,
        userId: params.participantUserId,
        signerRole: 'participant',
        hostId: null,
      }));
    } else if (requiredSignerType === 'PARENT_GUARDIAN') {
      signedChecks.push(hasSignedDocumentForSigner({
        client: params.client,
        eventId: params.eventId,
        template,
        userId: params.parentUserId,
        signerRole: 'parent_guardian',
        hostId: params.childUserId ?? null,
      }));
    } else if (requiredSignerType === 'CHILD') {
      signedChecks.push(hasSignedDocumentForSigner({
        client: params.client,
        eventId: params.eventId,
        template,
        userId: params.childUserId,
        signerRole: 'child',
        hostId: params.childUserId ?? null,
      }));
    } else if (requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
      signedChecks.push(hasSignedDocumentForSigner({
        client: params.client,
        eventId: params.eventId,
        template,
        userId: params.parentUserId,
        signerRole: 'parent_guardian',
        hostId: params.childUserId ?? null,
      }));
      signedChecks.push(hasSignedDocumentForSigner({
        client: params.client,
        eventId: params.eventId,
        template,
        userId: params.childUserId,
        signerRole: 'child',
        hostId: params.childUserId ?? null,
      }));
    }

    if (!signedChecks.length) {
      unsignedTemplateIds.push(templateId);
      continue;
    }
    const signedResults = await Promise.all(signedChecks);
    if (!signedResults.every(Boolean)) {
      unsignedTemplateIds.push(templateId);
    }
  }
  return unsignedTemplateIds;
};

const resolveOccurrenceForPayload = async (
  event: Record<string, any>,
  payload: z.infer<typeof payloadSchema>,
): Promise<{ ok: true; occurrence: ResolvedWeeklyOccurrence | null } | { ok: false; error: string; status?: number }> => {
  if (!isWeeklyParentEvent(event as any)) {
    return { ok: true, occurrence: null };
  }

  const slotId = normalizeOptionalId(payload.slotId);
  const occurrenceDate = normalizeOptionalId(payload.occurrenceDate);
  if (!slotId || !occurrenceDate) {
    return { ok: false, error: 'slotId and occurrenceDate are required for weekly event registration.' };
  }

  const occurrenceResult = await resolveWeeklyOccurrence({
    event: event as any,
    occurrence: { slotId, occurrenceDate },
  }, prisma);
  if (!occurrenceResult.ok) {
    return { ok: false, error: occurrenceResult.error };
  }
  if (isWeeklyOccurrenceJoinClosed(occurrenceResult.value)) {
    return { ok: false, error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR, status: 403 };
  }
  return { ok: true, occurrence: occurrenceResult.value };
};

const buildRegistrationStatus = (params: {
  priceCents: number;
  requiredTemplateIds: string[];
  consentErrors?: string[];
}): RegistrationLifecycleStatus => {
  if (params.consentErrors?.length) {
    return 'STARTED';
  }
  return params.priceCents > 0 || params.requiredTemplateIds.length > 0 ? 'STARTED' : 'ACTIVE';
};

const saveEventAnswers = async (params: {
  tx: any;
  eventId: string;
  registrationId: string;
  responderUserId: string;
  registrantUserId: string;
  registrantType: string;
  answers: unknown;
}) => {
  const answersSnapshot = await loadAndBuildRegistrationAnswerSnapshot({
    scopeType: 'EVENT',
    scopeId: params.eventId,
    answers: params.answers,
    client: params.tx,
  });
  if (!answersSnapshot.length) {
    return;
  }
  await upsertRegistrationQuestionResponse({
    scopeType: 'EVENT',
    scopeId: params.eventId,
    subjectType: 'EVENT_REGISTRATION',
    subjectId: params.registrationId,
    responderUserId: params.responderUserId,
    registrantUserId: params.registrantUserId,
    registrantType: params.registrantType,
    answersSnapshot,
    client: params.tx,
  });
};

const dispatchConsent = async (params: {
  eventId: string;
  organizationId: string | null;
  requiredTemplateIds: string[];
  participantUserId?: string | null;
  parentUserId?: string | null;
  childUserId?: string | null;
}) => {
  if (!params.requiredTemplateIds.length) {
    return null;
  }
  return dispatchRequiredEventDocuments(params);
};

const dispatchAndPersistConsent = async (
  tasks: PendingEventDocumentDispatch[],
): Promise<AppliedEventDocumentDispatch[]> => {
  const applied: AppliedEventDocumentDispatch[] = [];
  if (!tasks.length) {
    return applied;
  }

  for (const task of tasks) {
    const consent = await dispatchConsent({
      eventId: task.eventId,
      organizationId: task.organizationId,
      requiredTemplateIds: task.requiredTemplateIds,
      participantUserId: task.participantUserId,
      parentUserId: task.parentUserId,
      childUserId: task.childUserId,
    }) ?? {
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    };
    applied.push({ ...task, consent });
    await (prisma as any).eventRegistrations.update({
      where: { id: task.registrationId },
      data: {
        consentDocumentId: consent.firstDocumentId,
        consentStatus: buildConsentStatus(task.requiredTemplateIds, consent),
        updatedAt: new Date(),
      },
    });
  }

  const aggregateTeamRegistrationIds = Array.from(new Set(
    tasks
      .map((task) => normalizeOptionalId(task.aggregateTeamRegistrationId))
      .filter((registrationId): registrationId is string => Boolean(registrationId)),
  ));
  await Promise.all(aggregateTeamRegistrationIds.map(async (registrationId) => {
    const teamDispatches = applied.filter((row) => row.aggregateTeamRegistrationId === registrationId);
    const missingChildEmail = teamDispatches.some((row) => row.consent.missingChildEmail);
    const hasErrors = teamDispatches.some((row) => row.consent.errors.length > 0);
    const firstDocumentId = teamDispatches
      .map((row) => row.consent.firstDocumentId)
      .find((documentId): documentId is string => Boolean(documentId)) ?? null;
    await (prisma as any).eventRegistrations.update({
      where: { id: registrationId },
      data: {
        consentDocumentId: firstDocumentId,
        consentStatus: missingChildEmail ? 'child_email_required' : hasErrors ? 'send_failed' : 'sent',
        updatedAt: new Date(),
      },
    });
  }));

  return applied;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? 'Invalid guest registration request.',
      details: parsed.error.flatten(),
    }, { status: 400 });
  }

  const payload = parsed.data;
  const parentEmail = normalizeGuestEmail(payload.parent.email);
  if (!parentEmail) {
    return responseError('Email is required.');
  }

  const contextResult = await assertPublicWidgetEvent(params.slug, params.eventId);
  if (!contextResult) {
    return responseError('Public widget event not found.', 404);
  }

  const { organization, event } = contextResult;
  if (payload.mode === 'free_agent' && !event.teamSignup) {
    return responseError('Free-agent signup is only available for team registration events.', 403);
  }
  if (payload.mode === 'team' && !event.teamSignup) {
    return responseError('Team registration is not available for this event.', 403);
  }
  if (payload.mode === 'team' && !payload.team) {
    return responseError('Team details are required.');
  }

  const occurrenceResult = await resolveOccurrenceForPayload(event, payload);
  if (!occurrenceResult.ok) {
    return responseError(occurrenceResult.error, occurrenceResult.status ?? 400);
  }
  const occurrence = occurrenceResult.occurrence;

  const divisionSelection = await resolveEventDivisionSelection({
    event: event as any,
    input: {
      divisionId: normalizeOptionalId(payload.divisionId),
      divisionTypeId: normalizeOptionalId(payload.divisionTypeId),
      divisionTypeKey: normalizeOptionalId(payload.divisionTypeKey),
    },
  });
  if (!divisionSelection.ok) {
    return responseError(divisionSelection.error ?? 'Invalid division selection.');
  }
  const requiresGuardian = requiresGuardianForSelection(event as any, divisionSelection.selection);

  const priceCents = await resolveEventRegistrationPriceCents({
    event,
    selection: divisionSelection.selection,
    client: prisma,
  });
  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  const requiredTemplatesById = await loadRequiredEventTemplates(requiredTemplateIds);
  const parentDob = parseGuestDateOfBirth(payload.parent.dateOfBirth);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const pendingDocumentDispatches: PendingEventDocumentDispatch[] = [];
      const parent = await ensureGuestParentIdentity(tx, {
        email: parentEmail,
        firstName: payload.parent.firstName ?? null,
        lastName: payload.parent.lastName ?? null,
        dateOfBirth: parentDob,
      }, now);

      if (payload.mode === 'free_agent') {
        let registrantId = parent.userId;
        let parentId: string | null = null;
        let registrantType: 'SELF' | 'CHILD' = 'SELF';
        let ageAtEvent: number | null = null;
        let child: { userId: string } | null = null;

        if (requiresGuardian) {
          const childPayload = payload.child;
          if (!childPayload) {
            throw Object.assign(new Error('Player information is required for this division.'), { status: 400 });
          }
          const childDob = parseGuestDateOfBirth(childPayload.dateOfBirth);
          if (!childDob) {
            throw Object.assign(new Error('Player date of birth is required.'), { status: 400 });
          }
          const childAgeCheck = validateRegistrantAgeForSelection({
            dateOfBirth: childDob,
            event: event as any,
            selection: divisionSelection.selection,
          });
          if (childAgeCheck.error) {
            throw Object.assign(new Error(childAgeCheck.error), { status: childAgeCheck.error === 'Invalid date of birth' ? 400 : 403 });
          }
          const childEmail = normalizeGuestEmail(childPayload.email);
          child = childEmail
            ? await ensureGuestParentIdentity(tx, {
              email: childEmail,
              firstName: childPayload.firstName,
              lastName: childPayload.lastName,
              dateOfBirth: childDob,
            }, now)
            : await ensureGuestChildUserData(tx, {
              firstName: childPayload.firstName,
              lastName: childPayload.lastName,
              dateOfBirth: childDob,
            }, now);
          await ensureGuestParentChildLink(tx, {
            parentId: parent.userId,
            childId: child.userId,
            relationship: childPayload.relationship ?? null,
          }, now);
          registrantId = child.userId;
          parentId = parent.userId;
          registrantType = 'CHILD';
          ageAtEvent = childAgeCheck.ageAtEvent;
        } else {
          const parentProfile = await tx.userData.findUnique({
            where: { id: parent.userId },
            select: { dateOfBirth: true },
          });
          const parentDateOfBirth = parentDob ?? parentProfile?.dateOfBirth ?? null;
          if (parentDateOfBirth) {
            const ageCheck = validateRegistrantAgeForSelection({
              dateOfBirth: parentDateOfBirth,
              event: event as any,
              selection: divisionSelection.selection,
            });
            if (ageCheck.error) {
              throw Object.assign(new Error(ageCheck.error), { status: ageCheck.error === 'Invalid date of birth' ? 400 : 403 });
            }
            ageAtEvent = ageCheck.ageAtEvent;
          }
        }

        const eligibleTemplateIds = await filterUnsignedTemplateIds({
          client: tx,
          eventId: event.id,
          templateIds: filterRequiredTemplateIdsForRegistrantType(
            requiredTemplateIds,
            requiredTemplatesById,
            registrantType,
          ),
          templatesById: requiredTemplatesById,
          participantUserId: registrantType === 'SELF' ? registrantId : null,
          parentUserId: registrantType === 'CHILD' ? parent.userId : null,
          childUserId: registrantType === 'CHILD' ? registrantId : null,
        });
        const status = buildRegistrationStatus({
          priceCents,
          requiredTemplateIds: eligibleTemplateIds,
        });
        const registration = await upsertEventRegistration({
          eventId: event.id,
          registrantType,
          registrantId,
          parentId,
          rosterRole: 'FREE_AGENT',
          status,
          ageAtEvent,
          divisionId: divisionSelection.selection.divisionId,
          divisionTypeId: divisionSelection.selection.divisionTypeId,
          divisionTypeKey: divisionSelection.selection.divisionTypeKey,
          consentDocumentId: null,
          consentStatus: buildConsentStatus(eligibleTemplateIds, null),
          createdBy: parent.userId,
          occurrence,
        }, tx);

        if (eligibleTemplateIds.length) {
          pendingDocumentDispatches.push({
            registrationId: registration.id,
            eventId: event.id,
            organizationId: organization.id,
            requiredTemplateIds: eligibleTemplateIds,
            participantUserId: registrantType === 'SELF' ? parent.userId : null,
            parentUserId: registrantType === 'CHILD' ? parent.userId : null,
            childUserId: registrantType === 'CHILD' ? registrantId : null,
          });
        }

        await saveEventAnswers({
          tx,
          eventId: event.id,
          registrationId: registration.id,
          responderUserId: parent.userId,
          registrantUserId: registrantId,
          registrantType,
          answers: payload.answers,
        });

        return {
          mode: payload.mode,
          parent,
          child,
          team: null,
          registration,
          consent: null,
          pendingDocumentDispatches,
          requiresInlineSigning: eligibleTemplateIds.length > 0,
          eventTeamId: null,
          registrantId,
        };
      }

      const teamPayload = payload.team as NonNullable<typeof payload.team>;
      const rosterInputs = teamPayload.players ?? [];
      const childRows: Array<{
        userId: string;
        parentId: string | null;
        registrantType: 'SELF' | 'CHILD';
        jerseyNumber?: string | null;
        position?: string | null;
        isCaptain?: boolean;
        ageAtEvent?: number | null;
        requiredTemplateIds: string[];
      }> = [];

      for (const [index, player] of rosterInputs.entries()) {
        const childDob = parseGuestDateOfBirth(player.dateOfBirth);
        const playerEmail = normalizeGuestEmail(player.email);
        const guardianEmail = normalizeGuestEmail(player.guardianEmail);
        let rosterUser: { userId: string };
        let parentId: string | null = null;
        let registrantType: 'SELF' | 'CHILD' = 'SELF';
        let ageAtEvent: number | null = null;

        if (requiresGuardian) {
          if (!childDob) {
            throw Object.assign(new Error('Player date of birth is required.'), { status: 400 });
          }
          if (!guardianEmail) {
            throw Object.assign(new Error('Parent/guardian email is required for this division.'), { status: 400 });
          }
          const guardianFirstName = normalizeGuestText(player.guardianFirstName);
          const guardianLastName = normalizeGuestText(player.guardianLastName);
          if (!guardianFirstName || !guardianLastName) {
            throw Object.assign(new Error('Parent/guardian first and last name are required for this division.'), { status: 400 });
          }
          const ageCheck = validateRegistrantAgeForSelection({
            dateOfBirth: childDob,
            event: event as any,
            selection: divisionSelection.selection,
          });
          if (ageCheck.error) {
            throw Object.assign(new Error(ageCheck.error), { status: ageCheck.error === 'Invalid date of birth' ? 400 : 403 });
          }
          const guardian = await ensureGuestParentIdentity(tx, {
            email: guardianEmail,
            firstName: guardianFirstName,
            lastName: guardianLastName,
            dateOfBirth: null,
          }, now);
          rosterUser = playerEmail
            ? await ensureGuestParentIdentity(tx, {
              email: playerEmail,
              firstName: player.firstName,
              lastName: player.lastName,
              dateOfBirth: childDob,
            }, now)
            : await ensureGuestChildUserData(tx, {
              firstName: player.firstName,
              lastName: player.lastName,
              dateOfBirth: childDob,
            }, now);
          await ensureGuestParentChildLink(tx, {
            parentId: guardian.userId,
            childId: rosterUser.userId,
            relationship: player.guardianRelationship ?? player.relationship ?? null,
          }, now);
          parentId = guardian.userId;
          registrantType = 'CHILD';
          ageAtEvent = ageCheck.ageAtEvent;
        } else {
          if (!playerEmail) {
            throw Object.assign(new Error('Player email is required for adult division team registrations.'), { status: 400 });
          }
          if (childDob) {
            const ageCheck = validateRegistrantAgeForSelection({
              dateOfBirth: childDob,
              event: event as any,
              selection: divisionSelection.selection,
            });
            if (ageCheck.error) {
              throw Object.assign(new Error(ageCheck.error), { status: ageCheck.error === 'Invalid date of birth' ? 400 : 403 });
            }
            ageAtEvent = ageCheck.ageAtEvent;
          }
          rosterUser = await ensureGuestParentIdentity(tx, {
            email: playerEmail,
            firstName: player.firstName,
            lastName: player.lastName,
            dateOfBirth: childDob,
          }, now);
        }

        const playerRequiredTemplateIds = await filterUnsignedTemplateIds({
          client: tx,
          eventId: event.id,
          templateIds: filterRequiredTemplateIdsForRegistrantType(
            requiredTemplateIds,
            requiredTemplatesById,
            registrantType,
          ),
          templatesById: requiredTemplatesById,
          participantUserId: registrantType === 'SELF' ? rosterUser.userId : null,
          parentUserId: registrantType === 'CHILD' ? parentId : null,
          childUserId: registrantType === 'CHILD' ? rosterUser.userId : null,
        });
        childRows.push({
          userId: rosterUser.userId,
          parentId,
          registrantType,
          jerseyNumber: normalizeOptionalId(player.jerseyNumber),
          position: normalizeOptionalId(player.position),
          isCaptain: player.isCaptain === true || (index === 0 && !rosterInputs.some((row) => row.isCaptain === true)),
          ageAtEvent,
          requiredTemplateIds: playerRequiredTemplateIds,
        });
      }

      const includeParentAsPlayer = teamPayload.includeParentAsPlayer === true || childRows.length === 0;
      const parentAsPlayerRequiredTemplateIds = includeParentAsPlayer
        ? await filterUnsignedTemplateIds({
          client: tx,
          eventId: event.id,
          templateIds: filterRequiredTemplateIdsForRegistrantType(
            requiredTemplateIds,
            requiredTemplatesById,
            'SELF',
          ),
          templatesById: requiredTemplatesById,
          participantUserId: parent.userId,
        })
        : [];
      const teamRequiredTemplateIds = Array.from(new Set([
        ...childRows.flatMap((row) => row.requiredTemplateIds),
        ...parentAsPlayerRequiredTemplateIds,
      ]));
      const playerIds = [
        ...childRows.map((row) => row.userId),
        ...(includeParentAsPlayer ? [parent.userId] : []),
      ];
      const captainId = childRows.find((row) => row.isCaptain)?.userId
        ?? (includeParentAsPlayer ? parent.userId : playerIds[0])
        ?? parent.userId;
      const includeCreatorAsManager = teamPayload.includeCreatorAsManager ?? teamPayload.includeParentAsManager ?? true;
      const manager = includeCreatorAsManager === false
        ? await ensureOptionalGuestAdultIdentity(tx, teamPayload.manager, now, 'Manager')
        : null;
      const headCoach = await ensureOptionalGuestAdultIdentity(tx, teamPayload.headCoach, now, 'Head coach');
      const assistantCoaches = await Promise.all(
        (teamPayload.assistantCoaches ?? []).map((coach, coachIndex) => (
          ensureOptionalGuestAdultIdentity(tx, coach, now, `Assistant coach ${coachIndex + 1}`)
        )),
      );
      const managerId = manager?.userId ?? parent.userId;
      const headCoachId = headCoach?.userId ?? null;
      const assistantCoachIds = Array.from(new Set(
        assistantCoaches
          .map((coach) => coach?.userId ?? null)
          .filter((userId): userId is string => Boolean(userId))
          .filter((userId) => userId !== managerId && userId !== headCoachId),
      ));
      const teamId = crypto.randomUUID();
      await tx.canonicalTeams.create({
        data: {
          id: teamId,
          createdAt: now,
          updatedAt: now,
          name: teamPayload.name,
          division: divisionSelection.selection.divisionName ?? 'Open',
          divisionTypeId: divisionSelection.selection.divisionTypeId,
          sport: event.sportId ?? null,
          teamSize: teamPayload.teamSize ?? Math.max(2, playerIds.length),
          profileImageId: null,
          organizationId: null,
          createdBy: parent.userId,
          openRegistration: false,
          joinPolicy: 'CLOSED',
          registrationPriceCents: 0,
          requiredTemplateIds: [],
          visibility: 'ADMIN_ONLY',
        },
      });
      await syncCanonicalTeamRoster({
        teamId,
        captainId,
        playerIds,
        pendingPlayerIds: [],
        managerId,
        headCoachId,
        assistantCoachIds,
        actingUserId: parent.userId,
        now,
      }, tx);
      await applyCanonicalTeamRegistrationMetadata({
        client: tx,
        teamId,
        playerRegistrations: [
          ...childRows.map((row) => ({
            userId: row.userId,
            parentId: row.parentId,
            registrantType: row.registrantType,
            rosterRole: 'PARTICIPANT',
            jerseyNumber: row.jerseyNumber,
            position: row.position,
            consentStatus: buildConsentStatus(row.requiredTemplateIds, null),
            createdBy: parent.userId,
          })),
          ...(includeParentAsPlayer
            ? [{
              userId: parent.userId,
              parentId: null,
              registrantType: 'SELF',
              rosterRole: 'PARTICIPANT',
              consentStatus: buildConsentStatus(parentAsPlayerRequiredTemplateIds, null),
              createdBy: parent.userId,
            }]
            : []),
        ],
        now,
      });

      const status = buildRegistrationStatus({ priceCents, requiredTemplateIds: teamRequiredTemplateIds });
      const eventTeamId = crypto.randomUUID();
      const teamSize = teamPayload.teamSize ?? Math.max(2, playerIds.length);
      await tx.teams.create({
        data: {
          id: eventTeamId,
          createdAt: now,
          updatedAt: now,
          eventId: event.id,
          kind: 'REGISTERED',
          playerIds,
          playerRegistrationIds: [],
          division: divisionSelection.selection.divisionId,
          divisionTypeId: divisionSelection.selection.divisionTypeId,
          wins: null,
          losses: null,
          name: teamPayload.name,
          captainId,
          managerId,
          headCoachId,
          coachIds: assistantCoachIds,
          staffAssignmentIds: [],
          parentTeamId: teamId,
          pending: [],
          teamSize,
          profileImageId: null,
          sport: event.sportId ?? null,
        },
      });

      const registration = await upsertEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: eventTeamId,
        parentId: teamId,
        rosterRole: 'PARTICIPANT',
        status,
        eventTeamId,
        divisionId: divisionSelection.selection.divisionId,
        divisionTypeId: divisionSelection.selection.divisionTypeId,
        divisionTypeKey: divisionSelection.selection.divisionTypeKey,
        consentDocumentId: null,
        consentStatus: buildConsentStatus(teamRequiredTemplateIds, null),
        createdBy: parent.userId,
        occurrence,
      }, tx);

      const playerRegistrations = await Promise.all([
        ...childRows.map(async (row) => {
          const playerRegistration = await upsertEventRegistration({
            eventId: event.id,
            registrantType: row.registrantType,
            registrantId: row.userId,
            parentId: row.parentId,
            rosterRole: 'PARTICIPANT',
            status: row.requiredTemplateIds.length ? 'STARTED' : 'ACTIVE',
            eventTeamId,
            sourceTeamRegistrationId: `${teamId}__${row.userId}`,
            ageAtEvent: row.ageAtEvent ?? null,
            divisionId: divisionSelection.selection.divisionId,
            divisionTypeId: divisionSelection.selection.divisionTypeId,
            divisionTypeKey: divisionSelection.selection.divisionTypeKey,
            jerseyNumber: row.jerseyNumber,
            position: row.position,
            isCaptain: row.isCaptain === true,
            consentDocumentId: null,
            consentStatus: buildConsentStatus(row.requiredTemplateIds, null),
            createdBy: parent.userId,
            occurrence,
          }, tx);
          if (row.requiredTemplateIds.length) {
            pendingDocumentDispatches.push({
              registrationId: playerRegistration.id,
              aggregateTeamRegistrationId: registration.id,
              eventId: event.id,
              organizationId: organization.id,
              requiredTemplateIds: row.requiredTemplateIds,
              participantUserId: row.registrantType === 'SELF' ? row.userId : null,
              parentUserId: row.registrantType === 'CHILD' ? row.parentId : null,
              childUserId: row.registrantType === 'CHILD' ? row.userId : null,
            });
          }
          return playerRegistration;
        }),
        ...(includeParentAsPlayer
          ? [(async () => {
            const creatorPlayerRegistration = await upsertEventRegistration({
              eventId: event.id,
              registrantType: 'SELF',
              registrantId: parent.userId,
              parentId: null,
              rosterRole: 'PARTICIPANT',
              status: parentAsPlayerRequiredTemplateIds.length ? 'STARTED' : 'ACTIVE',
              eventTeamId,
              sourceTeamRegistrationId: `${teamId}__${parent.userId}`,
              divisionId: divisionSelection.selection.divisionId,
              divisionTypeId: divisionSelection.selection.divisionTypeId,
              divisionTypeKey: divisionSelection.selection.divisionTypeKey,
              isCaptain: captainId === parent.userId,
              consentDocumentId: null,
              consentStatus: buildConsentStatus(parentAsPlayerRequiredTemplateIds, null),
              createdBy: parent.userId,
              occurrence,
            }, tx);
            if (parentAsPlayerRequiredTemplateIds.length) {
              pendingDocumentDispatches.push({
                registrationId: creatorPlayerRegistration.id,
                aggregateTeamRegistrationId: registration.id,
                eventId: event.id,
                organizationId: organization.id,
                requiredTemplateIds: parentAsPlayerRequiredTemplateIds,
                participantUserId: parent.userId,
                parentUserId: null,
                childUserId: null,
              });
            }
            return creatorPlayerRegistration;
          })()]
          : []),
      ]);
      const activeStaffAssignments = tx.teamStaffAssignments?.findMany
        ? await tx.teamStaffAssignments.findMany({
          where: {
            teamId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            userId: true,
            role: true,
          },
        })
        : [];
      const eventStaffAssignments = tx.eventTeamStaffAssignments?.upsert
        ? await Promise.all(activeStaffAssignments.map((row: { id: string; userId: string; role: string }) => {
          const role = String(row.role ?? '').toUpperCase() as 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';
          return tx.eventTeamStaffAssignments.upsert({
            where: {
              eventTeamId_userId_role: {
                eventTeamId,
                userId: row.userId,
                role,
              },
            },
            create: {
              id: buildEventTeamStaffAssignmentId(eventTeamId, role, row.userId),
              createdAt: now,
              updatedAt: now,
              eventTeamId,
              userId: row.userId,
              role,
              status: 'ACTIVE',
              sourceStaffAssignmentId: row.id,
            },
            update: {
              updatedAt: now,
              status: 'ACTIVE',
              sourceStaffAssignmentId: row.id,
            },
          });
        }))
        : [];

      if (playerRegistrations.length || eventStaffAssignments.length) {
        await tx.teams.update({
          where: { id: eventTeamId },
          data: {
            playerRegistrationIds: playerRegistrations.map((row) => row.id),
            staffAssignmentIds: eventStaffAssignments.map((row) => row.id),
            updatedAt: now,
          },
        });
      }

      await saveEventAnswers({
        tx,
        eventId: event.id,
        registrationId: registration.id,
        responderUserId: parent.userId,
        registrantUserId: parent.userId,
        registrantType: 'TEAM',
        answers: payload.answers,
      });

      return {
        mode: payload.mode,
        parent,
        child: null,
        children: [],
        team: { id: teamId, eventTeamId, name: teamPayload.name },
        registration,
        consent: null,
        pendingDocumentDispatches,
        requiresInlineSigning: false,
        eventTeamId,
        registrantId: eventTeamId,
      };
    });

    const documentDispatches = await dispatchAndPersistConsent((result as any).pendingDocumentDispatches ?? []);
    await syncDivisionTeamMembershipFromRegistrations(event as any, prisma);
    const snapshot = await buildEventParticipantSnapshot({
      event: event as any,
      occurrence,
      includeRegistrations: true,
    }, prisma);
    const refreshedRegistration = await (prisma as any).eventRegistrations.findUnique({
      where: { id: result.registration.id },
    }) ?? result.registration;
    if (String(refreshedRegistration.status ?? '').toUpperCase() === 'ACTIVE') {
      await sendEventRegistrationHostNotification({
        eventId: event.id,
        registrationId: refreshedRegistration.id,
      });
    }
    const primaryConsent = documentDispatches.find((dispatch) => dispatch.registrationId === result.registration.id)?.consent
      ?? result.consent
      ?? null;

    const registrationToken = signGuestRegistrationToken({
      organizationId: organization.id,
      eventId: event.id,
      registrationId: result.registration.id,
      parentUserId: result.parent.userId,
      registrantId: result.registrantId,
      teamId: result.team?.id ?? null,
      eventTeamId: result.eventTeamId,
    });

    return NextResponse.json({
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      },
      event: {
        id: event.id,
        name: event.name ?? null,
      },
      mode: result.mode,
      parent: {
        userId: result.parent.userId,
        email: result.parent.email,
        authUserExisted: result.parent.authUserExisted,
      },
      child: result.child,
      children: (result as any).children ?? undefined,
      team: result.team,
      registration: withLegacyFields(refreshedRegistration),
      priceCents,
      requiresPayment: priceCents > 0,
      requiredTemplateIds,
      requiresSigning: Boolean((result as any).requiresInlineSigning),
      documentDispatches: documentDispatches.map((dispatch) => ({
        registrationId: dispatch.registrationId,
        documentId: dispatch.consent.firstDocumentId,
        sentDocumentIds: dispatch.consent.sentDocumentIds,
        status: buildConsentStatus(dispatch.requiredTemplateIds, dispatch.consent),
        missingChildEmail: dispatch.consent.missingChildEmail,
        errors: dispatch.consent.errors,
      })),
      consent: primaryConsent
        ? {
          documentId: primaryConsent.firstDocumentId,
          status: primaryConsent.missingChildEmail
            ? 'child_email_required'
            : primaryConsent.errors.length
              ? 'send_failed'
              : 'sent',
          missingChildEmail: primaryConsent.missingChildEmail,
          errors: primaryConsent.errors,
        }
        : undefined,
      registrationToken,
      participants: snapshot.participants,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Guest registration failed.';
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? Number((error as { status: number }).status)
      : 500;
    if (status >= 500) {
      console.error('Public guest registration failed', error);
    }
    return responseError(message, status);
  }
}
