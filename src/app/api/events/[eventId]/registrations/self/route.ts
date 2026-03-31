import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  resolveEventDivisionSelection,
  validateRegistrantAgeForSelection,
} from '@/app/api/events/[eventId]/registrationDivisionUtils';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';
import { normalizeRequiredSignerType } from '@/lib/templateSignerTypes';

export const dynamic = 'force-dynamic';

const schema = z.object({
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).passthrough();

const isSignedStatus = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'signed' || normalized === 'completed';
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized));
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      minAge: true,
      maxAge: true,
      sportId: true,
      registrationByDivisionType: true,
      divisions: true,
      requiredTemplateIds: true,
      organizationId: true,
      userIds: true,
      waitListIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const user = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: { dateOfBirth: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  const divisionSelection = await resolveEventDivisionSelection({
    event,
    input: parsed.data,
  });
  if (!divisionSelection.ok) {
    return NextResponse.json({ error: divisionSelection.error ?? 'Invalid division selection' }, { status: 400 });
  }

  const ageCheck = validateRegistrantAgeForSelection({
    dateOfBirth: user.dateOfBirth,
    event,
    selection: divisionSelection.selection,
  });
  if (ageCheck.error === 'Invalid date of birth') {
    return NextResponse.json({ error: ageCheck.error }, { status: 400 });
  }
  if (ageCheck.error) {
    return NextResponse.json({ error: ageCheck.error }, { status: 403 });
  }
  const ageAtEvent = ageCheck.ageAtEvent;

  // Minors can request to join, but a linked parent/guardian must approve.
  if (ageAtEvent < 18) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        childId: session.userId,
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

    const existingRequest = await prisma.eventRegistrations.findFirst({
      where: {
        eventId,
        registrantId: session.userId,
        parentId: parentLink.parentId,
        registrantType: 'CHILD',
        status: {
          in: ['PENDINGCONSENT', 'ACTIVE'],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    if (existingRequest) {
      return NextResponse.json(
        {
          registration: withLegacyFields(existingRequest),
          requiresParentApproval: true,
          consent: {
            status: existingRequest.consentStatus ?? 'guardian_approval_required',
            parentId: parentLink.parentId,
          },
        },
        { status: 200 },
      );
    }

    const registration = await prisma.eventRegistrations.create({
      data: {
        id: crypto.randomUUID(),
        eventId,
        registrantId: session.userId,
        parentId: parentLink.parentId,
        registrantType: 'CHILD',
        status: 'PENDINGCONSENT',
        ageAtEvent,
        divisionId: divisionSelection.selection.divisionId,
        divisionTypeId: divisionSelection.selection.divisionTypeId,
        divisionTypeKey: divisionSelection.selection.divisionTypeKey,
        consentStatus: 'guardian_approval_required',
        createdBy: session.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        registration: withLegacyFields(registration),
        requiresParentApproval: true,
        consent: {
          status: 'guardian_approval_required',
          parentId: parentLink.parentId,
        },
      },
      { status: 200 },
    );
  }

  const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
    ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  let participantRequiredTemplateIds = requiredTemplateIds;
  let participantTemplates: Array<{
    id: string;
    requiredSignerType: string | null;
    signOnce: boolean | null;
  }> = [];
  if (requiredTemplateIds.length > 0) {
    const templates = await prisma.templateDocuments.findMany({
      where: { id: { in: requiredTemplateIds } },
      select: {
        id: true,
        requiredSignerType: true,
        signOnce: true,
      },
    });
    const templateById = new Map(templates.map((template) => [template.id, template]));
    participantRequiredTemplateIds = requiredTemplateIds.filter((templateId) => {
      const template = templateById.get(templateId);
      if (!template) {
        return false;
      }
      return normalizeRequiredSignerType(template.requiredSignerType) === 'PARTICIPANT';
    });
    participantTemplates = participantRequiredTemplateIds
      .map((templateId) => templateById.get(templateId))
      .filter((template): template is NonNullable<typeof template> => template !== undefined);
  }

  let hasAllParticipantSignatures = false;
  if (participantRequiredTemplateIds.length > 0) {
    const signOnceTemplateIds = participantTemplates
      .filter((template) => template.signOnce === true)
      .map((template) => template.id);
    const eventScopedTemplateIds = participantTemplates
      .filter((template) => template.signOnce !== true)
      .map((template) => template.id);

    const signedRows = (signOnceTemplateIds.length || eventScopedTemplateIds.length)
      ? await prisma.signedDocuments.findMany({
        where: {
          userId: session.userId,
          signerRole: 'participant',
          OR: [
            ...(signOnceTemplateIds.length
              ? [{ templateId: { in: signOnceTemplateIds } }]
              : []),
            ...(eventScopedTemplateIds.length
              ? [{ templateId: { in: eventScopedTemplateIds }, eventId }]
              : []),
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: {
          templateId: true,
          status: true,
        },
      })
      : [];

    const signedTemplateIds = new Set(
      signedRows
        .filter((row) => isSignedStatus(row.status))
        .map((row) => row.templateId),
    );
    hasAllParticipantSignatures = participantRequiredTemplateIds.every((templateId) => (
      signedTemplateIds.has(templateId)
    ));
  }

  const needsConsent = participantRequiredTemplateIds.length > 0 && !hasAllParticipantSignatures;
  const consentDispatch = needsConsent
    ? await dispatchRequiredEventDocuments({
      eventId,
      organizationId: event.organizationId ?? null,
      requiredTemplateIds: participantRequiredTemplateIds,
      participantUserId: session.userId,
    })
    : null;
  const consentStatus = participantRequiredTemplateIds.length === 0
    ? null
    : !needsConsent
      ? 'completed'
    : (consentDispatch?.errors.length ?? 0) > 0
      ? 'send_failed'
      : 'sent';

  const existingRegistration = await prisma.eventRegistrations.findFirst({
    where: {
      eventId,
      registrantId: session.userId,
      registrantType: 'SELF',
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      id: true,
      consentDocumentId: true,
      consentStatus: true,
    },
  });

  const now = new Date();
  const nextStatus = needsConsent ? 'PENDINGCONSENT' : 'ACTIVE';
  const nextConsentDocumentId = needsConsent
    ? (consentDispatch?.firstDocumentId ?? existingRegistration?.consentDocumentId ?? null)
    : (existingRegistration?.consentDocumentId ?? null);
  const nextConsentStatus = consentStatus ?? existingRegistration?.consentStatus ?? null;

  const registration = existingRegistration
    ? await prisma.eventRegistrations.update({
      where: { id: existingRegistration.id },
      data: {
        status: nextStatus,
        ageAtEvent,
        divisionId: divisionSelection.selection.divisionId,
        divisionTypeId: divisionSelection.selection.divisionTypeId,
        divisionTypeKey: divisionSelection.selection.divisionTypeKey,
        consentDocumentId: nextConsentDocumentId,
        consentStatus: nextConsentStatus,
        updatedAt: now,
      },
    })
    : await prisma.eventRegistrations.create({
      data: {
        id: crypto.randomUUID(),
        eventId,
        registrantId: session.userId,
        registrantType: 'SELF',
        status: nextStatus,
        ageAtEvent,
        divisionId: divisionSelection.selection.divisionId,
        divisionTypeId: divisionSelection.selection.divisionTypeId,
        divisionTypeKey: divisionSelection.selection.divisionTypeKey,
        consentDocumentId: nextConsentDocumentId,
        consentStatus: nextConsentStatus,
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      },
    });

  await prisma.invites?.deleteMany?.({
    where: {
      type: 'EVENT',
      eventId,
      userId: session.userId,
    },
  });

  if (nextStatus === 'ACTIVE') {
    const currentUserIds = normalizeIdList(event.userIds);
    const currentWaitListIds = normalizeIdList(event.waitListIds);
    const nextUserIds = currentUserIds.includes(session.userId)
      ? currentUserIds
      : [...currentUserIds, session.userId];
    const nextWaitListIds = currentWaitListIds.filter((value) => value !== session.userId);
    const membershipChanged = nextUserIds.length !== currentUserIds.length
      || nextWaitListIds.length !== currentWaitListIds.length;

    if (membershipChanged) {
      await prisma.events.update({
        where: { id: eventId },
        data: {
          userIds: nextUserIds,
          waitListIds: nextWaitListIds,
          updatedAt: now,
        },
      });
    }
  }

  return NextResponse.json({
    registration: withLegacyFields(registration),
    warnings: consentDispatch?.errors.length ? consentDispatch.errors : undefined,
  }, { status: 200 });
}
