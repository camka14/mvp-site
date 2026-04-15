import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  resolveEventDivisionSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';
import { canManageEvent } from '@/server/accessControl';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';
import {
  buildEventParticipantSnapshot,
  deleteEventRegistration,
  findEventRegistration,
  syncDivisionTeamMembershipFromRegistrations,
  upsertEventRegistration,
} from '@/server/events/eventRegistrations';
import {
  claimOrCreateEventTeamSnapshot,
  findRegisteredEventTeamForCanonical,
  loadCanonicalTeamById,
} from '@/server/teams/teamMembership';
import {
  isWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from '@/server/events/weeklyOccurrences';
import { getRefundPolicy } from '@/lib/refundPolicy';
import {
  applyRefundAttempts,
  createStripeRefundAttempts,
  resolveRefundablePaymentsForRequest,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';

export const dynamic = 'force-dynamic';
const HIDDEN_EVENT_STATES = new Set(['UNPUBLISHED', 'PRIVATE', 'DRAFT']);

const payloadSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  team: z.record(z.string(), z.any()).optional(),
  teamId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
  refundMode: z.enum(['auto', 'request']).optional(),
  refundReason: z.string().optional(),
}).strict();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  return legacy;
};

const extractId = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.$id === 'string') return value.$id;
    if (typeof value.id === 'string') return value.id;
  }
  return undefined;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const normalizeUserIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};
const normalizeRequiredTemplateIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return ensureUnique(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  );
};
const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};
const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};
const isSlotProvisionedTeam = (team: { kind?: unknown; captainId?: unknown; parentTeamId?: unknown }): boolean => (
  String(team.kind ?? '').trim().toUpperCase() === 'PLACEHOLDER'
  || String(team.captainId ?? '').trim().length === 0
  || normalizeId(team.parentTeamId) !== null
);
const normalizeSportKey = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return ensureUnique(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );
};

const divisionMatchesTarget = (
  row: { id?: string | null; key?: string | null },
  targetDivisionId: string | null,
): boolean => {
  const normalizedTarget = normalizeDivisionToken(targetDivisionId);
  if (!normalizedTarget) {
    return false;
  }
  const aliases = new Set<string>();
  const rowId = normalizeDivisionToken(row.id);
  const rowKey = normalizeDivisionToken(row.key);
  if (rowId) {
    aliases.add(rowId);
    const token = extractDivisionTokenFromId(rowId);
    if (token) {
      aliases.add(token);
    }
  }
  if (rowKey) {
    aliases.add(rowKey);
  }
  return aliases.has(normalizedTarget);
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const refundRequestSelect = {
  id: true,
  eventId: true,
  userId: true,
  hostId: true,
  teamId: true,
  organizationId: true,
  reason: true,
  status: true,
} as const;

const divisionAliases = (divisionId: string | null): Set<string> => {
  const aliases = new Set<string>();
  const normalized = normalizeDivisionToken(divisionId);
  if (normalized) {
    aliases.add(normalized);
  }
  if (divisionId) {
    const token = extractDivisionTokenFromId(divisionId);
    const normalizedToken = normalizeDivisionToken(token);
    if (normalizedToken) {
      aliases.add(normalizedToken);
    }
  }
  return aliases;
};

const teamDivisionMatchesSelection = (
  teamDivision: string | null,
  targetDivisionId: string | null,
): boolean => {
  const targetAliases = divisionAliases(targetDivisionId);
  if (!targetAliases.size) {
    return true;
  }
  const teamAliases = divisionAliases(teamDivision);
  for (const alias of teamAliases) {
    if (targetAliases.has(alias)) {
      return true;
    }
  }
  return false;
};

const syncDivisionTeamMembership = async (params: {
  event: {
    id: string;
    singleDivision: boolean | null;
    divisions: string[] | null;
  };
  teamId: string;
  mode: 'add' | 'remove';
  targetDivisionId: string | null;
}, client: PrismaLike = prisma) => {
  const eventDivisionIds = normalizeUserIdList(params.event.divisions);
  if (!eventDivisionIds.length) {
    return;
  }
  const rows = await client.divisions.findMany({
    where: {
      eventId: params.event.id,
      OR: [
        { id: { in: eventDivisionIds } },
        { key: { in: eventDivisionIds } },
      ],
    },
    select: {
      id: true,
      key: true,
      teamIds: true,
      kind: true,
    },
  });

  const shouldAssignToDivision = params.mode === 'add' && !Boolean(params.event.singleDivision);
  for (const row of rows) {
    const isPlayoff = typeof row.kind === 'string' && row.kind.toUpperCase() === 'PLAYOFF';
    if (isPlayoff) {
      continue;
    }
    const currentTeamIds = normalizeDivisionTeamIds(row.teamIds).filter((teamId) => teamId !== params.teamId);
    const shouldIncludeTeam = shouldAssignToDivision && divisionMatchesTarget(row, params.targetDivisionId);
    const nextTeamIds = shouldIncludeTeam ? ensureUnique([...currentTeamIds, params.teamId]) : currentTeamIds;
    await client.divisions.update({
      where: { id: row.id },
      data: {
        teamIds: nextTeamIds,
        updatedAt: new Date(),
      },
    });
  }
};

const canManageLinkedChildParticipant = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const hasRefundablePaidTeamEventPayments = async (
  params: {
    eventId: string;
    teamOwnerIds?: string[];
    participantUserIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<boolean> => {
  const teamOwnerIds = normalizeUserIdList(params.teamOwnerIds ?? []);
  const participantUserIds = normalizeUserIdList(params.participantUserIds ?? []);

  const ownerFilters: Prisma.BillsWhereInput[] = [];
  if (teamOwnerIds.length > 0) {
    ownerFilters.push({
      ownerType: 'TEAM',
      ownerId: { in: teamOwnerIds },
    });
  }
  if (participantUserIds.length > 0) {
    ownerFilters.push({
      ownerType: 'USER',
      ownerId: { in: participantUserIds },
    });
  }
  if (!ownerFilters.length) {
    return false;
  }

  const bills = await client.bills.findMany({
    where: {
      eventId: params.eventId,
      OR: ownerFilters,
    },
    select: {
      id: true,
    },
  });
  if (!bills.length) {
    return false;
  }

  const billPayments = await client.billPayments.findMany({
    where: {
      billId: { in: bills.map((bill) => bill.id) },
      status: 'PAID',
    },
    select: {
      amountCents: true,
      refundedAmountCents: true,
    },
  });

  return billPayments.some((payment) => {
    const amountCents = Number.isFinite(Number(payment.amountCents))
      ? Math.max(0, Number(payment.amountCents))
      : 0;
    const refundedAmountCents = Number.isFinite(Number(payment.refundedAmountCents))
      ? Math.max(0, Number(payment.refundedAmountCents))
      : 0;
    return amountCents > refundedAmountCents;
  });
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      state: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamSignup: true,
      singleDivision: true,
      maxParticipants: true,
      eventType: true,
      parentEvent: true,
      timeSlotIds: true,
      divisions: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const eventState = String(event.state ?? '').toUpperCase();
  const canManageCurrentEvent = await canManageEvent(session, event);
  if (HIDDEN_EVENT_STATES.has(eventState) && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const slotId = normalizeId(req.nextUrl.searchParams.get('slotId'));
  const occurrenceDate = normalizeId(req.nextUrl.searchParams.get('occurrenceDate'));
  const manageModeRequested = req.nextUrl.searchParams.get('manage') === 'true';
  if (manageModeRequested && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (isWeeklyParentEvent(event) && (!slotId || !occurrenceDate)) {
    return NextResponse.json({
      event: withLegacyEvent(event),
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: manageModeRequested
        ? {
          teams: [],
          users: [],
          children: [],
          waitlist: [],
          freeAgents: [],
        }
        : undefined,
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      occurrence: null,
      weeklySelectionRequired: true,
    }, { status: 200 });
  }
  if (!isWeeklyParentEvent(event) && (slotId || occurrenceDate)) {
    return NextResponse.json({ error: 'Weekly occurrence selection is only valid for weekly events.' }, { status: 400 });
  }
  if (isWeeklyParentEvent(event)) {
    const resolvedOccurrence = await resolveWeeklyOccurrence({
      event,
      occurrence: {
        slotId,
        occurrenceDate,
      },
    });
    if (!resolvedOccurrence.ok) {
      return NextResponse.json({ error: resolvedOccurrence.error }, { status: 400 });
    }
  }

  try {
    const snapshot = await buildEventParticipantSnapshot({
      event,
      occurrence: slotId && occurrenceDate ? { slotId, occurrenceDate } : null,
      includeRegistrations: manageModeRequested,
    });
    return NextResponse.json({
      event: withLegacyEvent(event),
      participants: snapshot.participants,
      registrations: snapshot.registrations,
      teams: snapshot.teams.map((team) => withLegacyFields(team)),
      users: snapshot.users.map((user) => withLegacyFields(user)),
      participantCount: snapshot.participantCount,
      participantCapacity: snapshot.participantCapacity,
      occurrence: snapshot.occurrence,
      weeklySelectionRequired: false,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load participants.' },
      { status: 400 },
    );
  }
}

const ensureTeamRefundRequest = async (
  params: {
    eventId: string;
    hostId: string;
    organizationId: string | null;
    teamId: string;
    requestedByUserId: string;
    reason: string;
    teamOwnerIds?: string[];
    participantUserIds?: string[];
  },
  client: PrismaLike = prisma,
): Promise<void> => {
  const hasRefundablePayments = await hasRefundablePaidTeamEventPayments({
    eventId: params.eventId,
    teamOwnerIds: params.teamOwnerIds,
    participantUserIds: params.participantUserIds,
  }, client);
  if (!hasRefundablePayments) {
    return;
  }

  const existing = await client.refundRequests.findFirst({
    where: {
      eventId: params.eventId,
      teamId: params.teamId,
      status: 'WAITING',
    },
    select: { id: true },
  });
  if (existing?.id) {
    return;
  }
  const now = new Date();
  await client.refundRequests.create({
    data: {
      id: crypto.randomUUID(),
      eventId: params.eventId,
      userId: params.requestedByUserId,
      hostId: params.hostId,
      organizationId: params.organizationId,
      teamId: params.teamId,
      reason: params.reason,
      status: 'WAITING',
      createdAt: now,
      updatedAt: now,
    },
  });
};

async function updateParticipants(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  const canManageCurrentEvent = await canManageEvent(session, event);
  const eventState = String(event.state ?? '').toUpperCase();
  if (HIDDEN_EVENT_STATES.has(eventState) && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parsed.data.userId ?? extractId(parsed.data.user);
  const teamId = parsed.data.teamId ?? extractId(parsed.data.team);
  if ((userId && teamId) || (!userId && !teamId)) {
    return NextResponse.json(
      { error: 'Specify exactly one participant target via userId or teamId.' },
      { status: 400 },
    );
  }

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const weeklyOccurrence = isWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
    })
    : null;
  if (weeklyOccurrence && !weeklyOccurrence.ok) {
    return NextResponse.json({ error: weeklyOccurrence.error }, { status: 400 });
  }
  if (isWeeklyParentEvent(event) && (!parsed.data.slotId || !parsed.data.occurrenceDate)) {
    return NextResponse.json(
      { error: 'Weekly events require slotId and occurrenceDate for participant changes.' },
      { status: 400 },
    );
  }
  if (!isWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json(
      { error: 'Weekly occurrence selection is only valid for weekly events.' },
      { status: 400 },
    );
  }
  const resolvedOccurrence = weeklyOccurrence?.ok ? weeklyOccurrence.value : null;
  if (mode === 'add' && resolvedOccurrence && isWeeklyOccurrenceJoinClosed(resolvedOccurrence)) {
    return NextResponse.json({ error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR }, { status: 409 });
  }

  if (mode === 'add' && userId && !teamId && event.teamSignup) {
    return NextResponse.json(
      { error: 'Individual joins for team events must use the free-agent route.' },
      { status: 403 },
    );
  }

  if (userId && !session.isAdmin && session.userId !== userId && !canManageCurrentEvent) {
    const canManageChild = await canManageLinkedChildParticipant({
      parentId: session.userId,
      childId: userId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const divisionSelectionResult = mode === 'add'
    ? await resolveEventDivisionSelection({
      event,
      input: parsed.data,
    })
    : null;

  if (mode === 'add' && divisionSelectionResult && !divisionSelectionResult.ok) {
    return NextResponse.json({ error: divisionSelectionResult.error ?? 'Invalid division selection' }, { status: 400 });
  }
  const divisionSelection = mode === 'add' && divisionSelectionResult?.ok
    ? divisionSelectionResult.selection
    : { divisionId: null, divisionTypeId: null, divisionTypeKey: null };

  const requiredTemplateIds = normalizeRequiredTemplateIds(event.requiredTemplateIds);
  const warnings: string[] = [];
  const refundPolicy = getRefundPolicy(event);
  const requestedRefundMode = mode === 'remove' && teamId
    ? (parsed.data.refundMode ?? 'request')
    : undefined;
  if (requestedRefundMode === 'auto' && !refundPolicy.canAutoRefund) {
    return NextResponse.json(
      { error: 'Automatic refund is not available for this event.' },
      { status: 400 },
    );
  }

  if (mode === 'add' && userId) {
    const registrant = await prisma.userData.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    });
    if (!registrant) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const ageAtEvent = calculateAgeOnDate(registrant.dateOfBirth, event.start);
    if (!Number.isFinite(ageAtEvent)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }

    if (ageAtEvent < 18) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          childId: userId,
          status: 'ACTIVE',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          parentId: true,
        },
      });
      if (!parentLink?.parentId) {
        return NextResponse.json(
          { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
          { status: 403 },
        );
      }

      const requestRegistration = await upsertEventRegistration({
        eventId: event.id,
        registrantType: 'CHILD',
        registrantId: userId,
        parentId: parentLink.parentId,
        rosterRole: 'PARTICIPANT',
        status: 'STARTED',
        ageAtEvent,
        divisionId: divisionSelection.divisionId,
        divisionTypeId: divisionSelection.divisionTypeId,
        divisionTypeKey: divisionSelection.divisionTypeKey,
        consentStatus: 'guardian_approval_required',
        createdBy: session.userId,
        occurrence: resolvedOccurrence,
      });

      await prisma.invites?.deleteMany?.({
        where: {
          type: 'EVENT',
          eventId: event.id,
          userId: session.userId,
        },
      });

      return NextResponse.json({
        event: withLegacyEvent(event),
        registration: withLegacyFields(requestRegistration),
        requiresParentApproval: true,
      }, { status: 200 });
    }
  }

  let teamForRegistration:
    | {
      id: string;
      division: string | null;
      divisionTypeId: string | null;
      sport: string | null;
      playerIds: string[];
      managerId: string | null;
    }
    | null = null;
  let teamRefundReason = normalizeId(parsed.data.refundReason) ?? 'team_refund_requested';
  let teamRefundOwnerIds: string[] = [];
  let teamRefundParticipantUserIds: string[] = [];
  let canonicalTeamRow: Record<string, any> | null = null;

  if (teamId) {
    const team = await loadCanonicalTeamById(teamId, prisma);

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    const registeredEventTeam = await findRegisteredEventTeamForCanonical({
      eventId: event.id,
      canonicalTeamId: teamId,
    }, prisma);
    const isTeamManager = normalizeId((team as any).managerId) === session.userId
      || normalizeId((team as any).captainId) === session.userId;
    if (!session.isAdmin && !isTeamManager && !canManageCurrentEvent) {
      return NextResponse.json(
        { error: 'Only the team manager can register or withdraw this team.' },
        { status: 403 },
      );
    }
    teamRefundReason = (!isTeamManager && canManageCurrentEvent)
      ? 'team_unregistered_by_host'
      : 'team_refund_requested';
    teamRefundOwnerIds = ensureUnique(
      [
        normalizeId(registeredEventTeam?.id) ?? '',
        team.id,
      ].filter(Boolean),
    );
    teamRefundParticipantUserIds = ensureUnique(
      [
        ...normalizeUserIdList((team as any).playerIds),
        ...normalizeUserIdList([(team as any).captainId, (team as any).managerId, (team as any).headCoachId]),
      ],
    );
    if (mode === 'add') {
      canonicalTeamRow = team as Record<string, any>;
      teamForRegistration = {
        ...(team as any),
        playerIds: normalizeUserIdList((team as any).playerIds),
      };
    }
  }

  if (teamForRegistration && mode === 'add') {
    const team = teamForRegistration;
    const normalizedEventSport = normalizeSportKey(event.sportId);
    const normalizedTeamSport = normalizeSportKey(team.sport);
    if (normalizedEventSport && normalizedTeamSport !== normalizedEventSport) {
      return NextResponse.json(
        { error: 'This team does not match the event sport.' },
        { status: 403 },
      );
    }
  }

  if (mode === 'add' && teamForRegistration && requiredTemplateIds.length > 0 && teamForRegistration.playerIds.length > 0) {
    const [childProfiles, childEmails, activeLinks] = await Promise.all([
      prisma.userData.findMany({
        where: { id: { in: teamForRegistration.playerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      }),
      prisma.sensitiveUserData.findMany({
        where: { userId: { in: teamForRegistration.playerIds } },
        select: {
          userId: true,
          email: true,
        },
      }),
      prisma.parentChildLinks.findMany({
        where: {
          childId: { in: teamForRegistration.playerIds },
          status: 'ACTIVE',
        },
        select: {
          childId: true,
        },
      }),
    ]);

    const childEmailById = new Map(childEmails.map((row) => [row.userId, normalizeEmail(row.email)]));
    const childIds = new Set(activeLinks.map((row) => row.childId));

    childProfiles.forEach((child) => {
      if (!childIds.has(child.id)) {
        return;
      }
      const ageAtEvent = calculateAgeOnDate(child.dateOfBirth, event.start);
      if (!Number.isFinite(ageAtEvent) || ageAtEvent >= 13) {
        return;
      }
      const childEmail = childEmailById.get(child.id);
      if (childEmail) {
        return;
      }
      const name = `${(child.firstName ?? '').trim()} ${(child.lastName ?? '').trim()}`.trim() || child.id;
      warnings.push(`Under-13 player ${name} is missing an email and cannot complete child signature steps until an email is added.`);
    });
  }

  if (teamId) {
    const registeredEventTeam = await findRegisteredEventTeamForCanonical({
      eventId: event.id,
      canonicalTeamId: teamId,
    }, prisma);
    const existingRegistration = registeredEventTeam
      ? await findEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: registeredEventTeam.id,
        occurrence: resolvedOccurrence,
      })
      : await findEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: teamId,
        occurrence: resolvedOccurrence,
      });

    if (
      mode === 'add'
      && existingRegistration
      && ['STARTED', 'ACTIVE'].includes(String(existingRegistration.status ?? ''))
      && !canManageCurrentEvent
    ) {
      return NextResponse.json({ error: 'Team is already registered for this event.' }, { status: 409 });
    }

    if (mode === 'add') {
      await prisma.$transaction(async (tx) => {
        await claimOrCreateEventTeamSnapshot({
          tx,
          eventId: event.id,
          canonicalTeamId: teamId,
          createdBy: session.userId,
          canonicalTeam: canonicalTeamRow,
          divisionId: divisionSelection.divisionId,
          divisionTypeId: divisionSelection.divisionTypeId,
          divisionTypeKey: divisionSelection.divisionTypeKey,
          occurrence: resolvedOccurrence,
        });
        await syncDivisionTeamMembershipFromRegistrations(event, tx);
      });
      const refreshedEvent = await prisma.events.findUnique({ where: { id: event.id } });
      return NextResponse.json({
        event: withLegacyEvent(refreshedEvent ?? event),
        warnings: warnings.length ? warnings : undefined,
      }, { status: 200 });
    }

    if (!existingRegistration) {
      return NextResponse.json({ error: 'Team is not registered for this event.' }, { status: 404 });
    }

    const now = new Date();
    let autoRefundRequest: RefundRequestRow | null = null;
    let existingAutoRefundRequest: RefundRequestRow | null = null;
    let autoRefundAttempts: StripeRefundAttempt[] = [];

    if (requestedRefundMode === 'auto') {
      existingAutoRefundRequest = await prisma.refundRequests.findFirst({
        where: {
          eventId: event.id,
          teamId,
          status: { in: ['WAITING', 'APPROVED'] },
        },
        orderBy: { updatedAt: 'desc' },
        select: refundRequestSelect,
      }) as RefundRequestRow | null;
      autoRefundRequest = existingAutoRefundRequest
        ? { ...existingAutoRefundRequest, reason: teamRefundReason }
        : {
          id: crypto.randomUUID(),
          eventId: event.id,
          userId: session.userId,
          hostId: event.hostId,
          teamId,
          organizationId: event.organizationId ?? null,
          reason: teamRefundReason,
          status: 'APPROVED',
        };

      try {
        const refundablePayments = await resolveRefundablePaymentsForRequest(prisma, autoRefundRequest);
        autoRefundAttempts = await createStripeRefundAttempts({
          request: autoRefundRequest,
          payments: refundablePayments,
          approvedByUserId: session.userId,
        });
      } catch (error) {
        console.error('Automatic team refund failed during withdrawal', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to create refund.' },
          { status: 502 },
        );
      }

      if (!autoRefundAttempts.length && existingAutoRefundRequest?.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'No refundable payment found for automatic refund.' },
          { status: 400 },
        );
      }
    }

    const updatedEvent = await prisma.$transaction(async (tx) => {
      await deleteEventRegistration({
        eventId: event.id,
        registrantType: 'TEAM',
        registrantId: normalizeId(existingRegistration.eventTeamId) ?? normalizeId(existingRegistration.registrantId) ?? teamId,
        occurrence: resolvedOccurrence,
      }, tx);

      const existingEventTeamId = normalizeId(existingRegistration.eventTeamId);
      if (existingEventTeamId) {
        await tx.eventRegistrations.updateMany({
          where: {
            eventTeamId: existingEventTeamId,
            registrantType: { not: 'TEAM' },
            status: { in: ['STARTED', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });
        await tx.eventTeamStaffAssignments?.updateMany?.({
          where: {
            eventTeamId: existingEventTeamId,
            status: 'ACTIVE',
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });
      }

      await syncDivisionTeamMembershipFromRegistrations(event, tx);
      const touchedEvent = await tx.events.update({
        where: { id: event.id },
        data: { updatedAt: now },
      });

      if (requestedRefundMode === 'auto' && autoRefundRequest) {
        if (existingAutoRefundRequest) {
          await tx.refundRequests.update({
            where: { id: existingAutoRefundRequest.id },
            data: {
              status: 'APPROVED',
              updatedAt: now,
            },
          });
        } else {
          await tx.refundRequests.create({
            data: {
              id: autoRefundRequest.id,
              eventId: autoRefundRequest.eventId,
              userId: autoRefundRequest.userId,
              hostId: autoRefundRequest.hostId,
              teamId: autoRefundRequest.teamId,
              organizationId: autoRefundRequest.organizationId,
              reason: autoRefundRequest.reason,
              status: 'APPROVED',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        await applyRefundAttempts(tx, autoRefundAttempts, now);
      } else {
        await ensureTeamRefundRequest({
          eventId: event.id,
          hostId: event.hostId,
          organizationId: event.organizationId ?? null,
          teamId: normalizeId(existingRegistration.eventTeamId) ?? teamId,
          requestedByUserId: session.userId,
          reason: teamRefundReason,
          teamOwnerIds: teamRefundOwnerIds,
          participantUserIds: teamRefundParticipantUserIds,
        }, tx);
      }

      return touchedEvent;
    });

    return NextResponse.json({
      event: withLegacyEvent(updatedEvent),
      warnings: warnings.length ? warnings : undefined,
    }, { status: 200 });
  }

  const registrant = await prisma.userData.findUnique({
    where: { id: userId! },
    select: { dateOfBirth: true },
  });
  if (!registrant) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const ageAtEvent = calculateAgeOnDate(registrant.dateOfBirth, event.start);
  if (!Number.isFinite(ageAtEvent)) {
    return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
  }

  const canManageLinkedChild = session.userId !== userId && !canManageCurrentEvent
    ? await canManageLinkedChildParticipant({
      parentId: session.userId,
      childId: userId!,
    })
    : false;
  const registrantType = canManageLinkedChild ? 'CHILD' : 'SELF';
  const parentId = canManageLinkedChild ? session.userId : null;

  if (mode === 'add') {
    const existingSelf = await findEventRegistration({
      eventId: event.id,
      registrantType: 'SELF',
      registrantId: userId!,
      occurrence: resolvedOccurrence,
    });
    const existingChild = await findEventRegistration({
      eventId: event.id,
      registrantType: 'CHILD',
      registrantId: userId!,
      occurrence: resolvedOccurrence,
    });
    const activeExisting = [existingSelf, existingChild].find((row) => (
      Boolean(row) && ['STARTED', 'ACTIVE'].includes(String(row?.status ?? ''))
    ));
    if (activeExisting) {
      return NextResponse.json({ error: 'User is already registered for this event.' }, { status: 409 });
    }

    let consentDocumentId: string | null = null;
    let consentStatus: string | null = null;

    if (requiredTemplateIds.length > 0) {
      if (registrantType === 'CHILD' && parentId) {
        const childSensitive = await prisma.sensitiveUserData.findFirst({
          where: { userId: userId! },
          select: { email: true },
        });
        const childEmail = normalizeEmail(childSensitive?.email);
        const consentDispatch = await dispatchRequiredEventDocuments({
          eventId: event.id,
          organizationId: event.organizationId ?? null,
          requiredTemplateIds,
          parentUserId: parentId,
          childUserId: userId!,
        });
        consentDocumentId = consentDispatch.firstDocumentId ?? null;
        consentStatus = !childEmail
          ? 'child_email_required'
          : (consentDispatch.errors.length > 0 ? 'send_failed' : 'sent');
        warnings.push(...consentDispatch.errors);
      } else {
        const consentDispatch = await dispatchRequiredEventDocuments({
          eventId: event.id,
          organizationId: event.organizationId ?? null,
          requiredTemplateIds,
          participantUserId: userId!,
        });
        consentDocumentId = consentDispatch.firstDocumentId ?? null;
        consentStatus = consentDispatch.errors.length > 0 ? 'send_failed' : 'sent';
        warnings.push(...consentDispatch.errors);
      }
    }

    const registration = await upsertEventRegistration({
      eventId: event.id,
      registrantType,
      registrantId: userId!,
      parentId,
      rosterRole: 'PARTICIPANT',
      status: requiredTemplateIds.length > 0 ? 'STARTED' : 'ACTIVE',
      ageAtEvent,
      divisionId: divisionSelection.divisionId,
      divisionTypeId: divisionSelection.divisionTypeId,
      divisionTypeKey: divisionSelection.divisionTypeKey,
      consentDocumentId,
      consentStatus,
      createdBy: session.userId,
      occurrence: resolvedOccurrence,
    });

    await prisma.invites?.deleteMany?.({
      where: {
        type: 'EVENT',
        eventId: event.id,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      event: withLegacyEvent(event),
      registration: withLegacyFields(registration),
      warnings: warnings.length ? warnings : undefined,
    }, { status: 200 });
  }

  const updatedEvent = await prisma.$transaction(async (tx) => {
    await tx.eventRegistrations.deleteMany({
      where: {
        eventId: event.id,
        registrantId: userId!,
        registrantType: { in: ['SELF', 'CHILD'] },
        ...(resolvedOccurrence
          ? {
            slotId: resolvedOccurrence.slotId,
            occurrenceDate: resolvedOccurrence.occurrenceDate,
          }
          : {
            slotId: null,
            occurrenceDate: null,
          }),
      },
    });
    return tx.events.update({
      where: { id: event.id },
      data: { updatedAt: new Date() },
    });
  });

  await prisma.invites?.deleteMany?.({
    where: {
      type: 'EVENT',
      eventId: event.id,
      userId: session.userId,
    },
  });

  return NextResponse.json({
    event: withLegacyEvent(updatedEvent),
    warnings: warnings.length ? warnings : undefined,
  }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateParticipants(req, params, 'remove');
}
