import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  getRequiredSignerTypeLabel,
  getSignerContextLabel,
  normalizeRequiredSignerType,
  type SignerContext,
} from '@/lib/templateSignerTypes';

export const dynamic = 'force-dynamic';

type ProfileDocumentCard = {
  id: string;
  status: 'UNSIGNED' | 'SIGNED';
  eventId?: string;
  eventName?: string;
  organizationId?: string;
  organizationName: string;
  templateId: string;
  title: string;
  type: 'PDF' | 'TEXT';
  requiredSignerType: string;
  requiredSignerLabel: string;
  signerContext: SignerContext;
  signerContextLabel: string;
  childUserId?: string;
  childEmail?: string;
  consentStatus?: string;
  requiresChildEmail?: boolean;
  statusNote?: string;
  signedAt?: string;
  signedDocumentRecordId?: string;
  viewUrl?: string;
  content?: string;
};

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeTemplateType = (value: unknown): 'PDF' | 'TEXT' => {
  return typeof value === 'string' && value.toUpperCase() === 'TEXT' ? 'TEXT' : 'PDF';
};

const isSignedStatus = (value: unknown): boolean => {
  const status = normalizeText(value)?.toLowerCase();
  return status === 'signed' || status === 'completed';
};

const toTimestamp = (value?: string | Date | null): number => {
  if (!value) return 0;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
};

const getDisplayOrganizationName = (params: {
  eventOrganizationId?: string | null;
  templateOrganizationId?: string | null;
  organizationsById: Map<string, string>;
}): { organizationId?: string; organizationName: string } => {
  const eventOrganizationId = normalizeText(params.eventOrganizationId ?? undefined);
  if (eventOrganizationId) {
    return {
      organizationId: eventOrganizationId,
      organizationName: params.organizationsById.get(eventOrganizationId) ?? 'Organization',
    };
  }

  const templateOrganizationId = normalizeText(params.templateOrganizationId ?? undefined);
  if (templateOrganizationId) {
    return {
      organizationId: templateOrganizationId,
      organizationName: params.organizationsById.get(templateOrganizationId) ?? 'Organization',
    };
  }

  return { organizationName: 'Independent Event' };
};

const normalizeSignerContextValue = (value: unknown): SignerContext | undefined => {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === 'participant') return 'participant';
  if (normalized === 'parent_guardian' || normalized === 'parentguardian') return 'parent_guardian';
  if (normalized === 'child') return 'child';
  return undefined;
};

const buildTemplateScopeKey = (params: {
  templateId: string;
  signerContext: SignerContext;
  childUserId?: string;
}): string => {
  return `${params.templateId}::${params.signerContext}::${params.childUserId ?? 'self'}`;
};

const buildEventScopeKey = (params: {
  eventId: string;
  templateId: string;
  signerContext: SignerContext;
  childUserId?: string;
}): string => {
  return `${params.eventId}::${buildTemplateScopeKey({
    templateId: params.templateId,
    signerContext: params.signerContext,
    childUserId: params.childUserId,
  })}`;
};

const isSignerContextVisibleForViewer = (params: {
  viewerUserId: string;
  signerContext: SignerContext;
  childUserId?: string;
  signerUserId?: string;
}): boolean => {
  const childUserId = normalizeText(params.childUserId);
  const signerUserId = normalizeText(params.signerUserId);

  if (params.signerContext === 'participant') {
    return signerUserId ? signerUserId === params.viewerUserId : true;
  }

  if (!childUserId) {
    return false;
  }

  if (params.signerContext === 'child') {
    return childUserId === params.viewerUserId;
  }

  if (params.signerContext === 'parent_guardian') {
    if (childUserId === params.viewerUserId) {
      return false;
    }
    return signerUserId ? signerUserId === params.viewerUserId : true;
  }

  return false;
};

export async function GET(_req: NextRequest) {
  const session = await requireSession(_req);
  const userId = session.userId;

  const [profile, registrations, linkedChildren, parentLinksForSelf, selfSensitive] = await Promise.all([
    prisma.userData.findUnique({
      where: { id: userId },
      select: { teamIds: true },
    }),
    prisma.eventRegistrations.findMany({
      where: {
        OR: [
          { registrantId: userId },
          { parentId: userId },
        ],
      },
      select: {
        id: true,
        eventId: true,
        parentId: true,
        registrantId: true,
        registrantType: true,
        status: true,
        consentStatus: true,
      },
    }),
    prisma.parentChildLinks.findMany({
      where: {
        parentId: userId,
        status: 'ACTIVE',
      },
      select: {
        childId: true,
      },
    }),
    prisma.parentChildLinks.findMany({
      where: {
        childId: userId,
        status: 'ACTIVE',
      },
      select: {
        parentId: true,
      },
      take: 1,
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: {
        email: true,
      },
    }),
  ]);

  const teamIds = Array.isArray(profile?.teamIds)
    ? profile.teamIds.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
  const linkedChildIds = Array.from(new Set(
    linkedChildren
      .map((link) => normalizeText(link.childId))
      .filter((value): value is string => Boolean(value)),
  ));
  const linkedChildProfiles = linkedChildIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: linkedChildIds } },
      select: {
        id: true,
        teamIds: true,
      },
    })
    : [];
  const linkedChildTeamIds = Array.from(new Set(
    linkedChildProfiles.flatMap((child) =>
      Array.isArray(child.teamIds)
        ? child.teamIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
    ),
  ));
  const selfEmail = normalizeText(selfSensitive?.email);
  const userIsLinkedChild = parentLinksForSelf.length > 0;
  const registrationChildIds = registrations
    .filter((registration) =>
      normalizeText(registration.parentId) === userId
      && normalizeText(registration.registrantType)?.toUpperCase() === 'CHILD',
    )
    .map((registration) => normalizeText(registration.registrantId))
    .filter((value): value is string => Boolean(value));
  const signatureUserIds = Array.from(new Set(
    [userId, ...linkedChildIds, ...registrationChildIds]
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value)),
  ));
  const signedDocuments = signatureUserIds.length
    ? await prisma.signedDocuments.findMany({
      where: { userId: { in: signatureUserIds } },
      orderBy: { createdAt: 'desc' },
      take: 1_000,
      select: {
        id: true,
        signedDocumentId: true,
        templateId: true,
        eventId: true,
        userId: true,
        hostId: true,
        signerRole: true,
        status: true,
        signedAt: true,
        createdAt: true,
      },
    })
    : [];

  const registrationEventIds = Array.from(new Set(
    registrations
      .map((registration) => normalizeText(registration.eventId))
      .filter((value): value is string => Boolean(value)),
  ));

  const signedEventIds = Array.from(new Set(
    signedDocuments
      .map((document) => normalizeText(document.eventId))
      .filter((value): value is string => Boolean(value)),
  ));

  const discoverableEvents = await prisma.events.findMany({
    where: {
      OR: [
        { userIds: { has: userId } },
        ...(teamIds.length ? [{ teamIds: { hasSome: teamIds } }] : []),
        { freeAgentIds: { has: userId } },
        ...(registrationEventIds.length ? [{ id: { in: registrationEventIds } }] : []),
        ...(signedEventIds.length ? [{ id: { in: signedEventIds } }] : []),
        ...(linkedChildTeamIds.length ? [{ teamIds: { hasSome: linkedChildTeamIds } }] : []),
        ...(linkedChildIds.length ? [{ freeAgentIds: { hasSome: linkedChildIds } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      start: true,
      organizationId: true,
      requiredTemplateIds: true,
      userIds: true,
      teamIds: true,
      freeAgentIds: true,
    },
  });

  const eventById = new Map(discoverableEvents.map((event) => [event.id, event]));

  const requiredTemplateIds = Array.from(new Set(
    discoverableEvents.flatMap((event) =>
      Array.isArray(event.requiredTemplateIds)
        ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
    ),
  ));

  const signedTemplateIds = Array.from(new Set(
    signedDocuments
      .map((document) => normalizeText(document.templateId))
      .filter((value): value is string => Boolean(value)),
  ));

  const templateIdsToLoad = Array.from(new Set([...requiredTemplateIds, ...signedTemplateIds]));

  const templates = templateIdsToLoad.length
    ? await prisma.templateDocuments.findMany({
      where: { id: { in: templateIdsToLoad } },
      select: {
        id: true,
        organizationId: true,
        title: true,
        type: true,
        signOnce: true,
        requiredSignerType: true,
        content: true,
      },
    })
    : [];

  const templateById = new Map(templates.map((template) => [template.id, template]));

  const childRegistrationRows = registrations.filter(
    (registration) =>
      normalizeText(registration.parentId) === userId
      && normalizeText(registration.registrantType)?.toUpperCase() === 'CHILD'
      && Boolean(normalizeText(registration.eventId)),
  );
  const childIds = Array.from(new Set(
    [
      ...linkedChildIds,
      ...childRegistrationRows
        .map((registration) => normalizeText(registration.registrantId))
        .filter((value): value is string => Boolean(value)),
      ...(userIsLinkedChild ? [userId] : []),
    ],
  ));
  const childEmails = childIds.length
    ? await prisma.sensitiveUserData.findMany({
      where: { userId: { in: childIds } },
      select: {
        userId: true,
        email: true,
      },
    })
    : [];
  const childEmailById = new Map(
    childEmails.map((row) => [row.userId, normalizeText(row.email) ?? '']),
  );
  const childTeamIdsById = new Map(
    linkedChildProfiles.map((child) => [
      child.id,
      Array.isArray(child.teamIds)
        ? child.teamIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
    ]),
  );
  const childRegistrationByEventAndChild = new Map<string, { consentStatus?: string; registrationStatus?: string }>();
  const childAssociationsByEvent = new Map<string, Array<{
    childUserId: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
    requiresChildEmail: boolean;
    statusNote?: string;
  }>>();
  const childAssociationKeys = new Set<string>();

  const addChildAssociation = (params: {
    eventId: string;
    childUserId: string;
    childEmail?: string;
    consentStatus?: string;
    registrationStatus?: string;
  }) => {
    const associationKey = `${params.eventId}:${params.childUserId}`;
    if (childAssociationKeys.has(associationKey)) {
      return;
    }
    childAssociationKeys.add(associationKey);

    const normalizedConsentStatus = normalizeText(params.consentStatus) ?? undefined;
    const normalizedRegistrationStatus = normalizeText(params.registrationStatus) ?? undefined;
    const requiresChildEmail = !params.childEmail;
    const statusNote = requiresChildEmail
      ? 'Child email is required before child signer links can be sent.'
      : undefined;

    const next = childAssociationsByEvent.get(params.eventId) ?? [];
    next.push({
      childUserId: params.childUserId,
      childEmail: params.childEmail,
      consentStatus: normalizedConsentStatus,
      registrationStatus: normalizedRegistrationStatus,
      requiresChildEmail,
      statusNote,
    });
    childAssociationsByEvent.set(params.eventId, next);
  };

  childRegistrationRows.forEach((registration) => {
    const eventId = normalizeText(registration.eventId);
    const childUserId = normalizeText(registration.registrantId);
    if (!eventId || !childUserId) return;
    childRegistrationByEventAndChild.set(`${eventId}:${childUserId}`, {
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
    addChildAssociation({
      eventId,
      childUserId,
      childEmail: childEmailById.get(childUserId) || undefined,
      consentStatus: normalizeText(registration.consentStatus),
      registrationStatus: normalizeText(registration.status),
    });
  });

  discoverableEvents.forEach((event) => {
    const eventTeamIds = Array.isArray(event.teamIds)
      ? event.teamIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    const eventFreeAgentIds = Array.isArray(event.freeAgentIds)
      ? event.freeAgentIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    const eventUserIds = Array.isArray(event.userIds)
      ? event.userIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];

    linkedChildIds.forEach((childUserId) => {
      const childTeamIds = childTeamIdsById.get(childUserId) ?? [];
      const isOnTeam = childTeamIds.some((teamId) => eventTeamIds.includes(teamId));
      const isFreeAgent = eventFreeAgentIds.includes(childUserId);
      if (!isOnTeam && !isFreeAgent) {
        return;
      }
      const registrationMeta = childRegistrationByEventAndChild.get(`${event.id}:${childUserId}`);
      addChildAssociation({
        eventId: event.id,
        childUserId,
        childEmail: childEmailById.get(childUserId) || undefined,
        consentStatus: registrationMeta?.consentStatus,
        registrationStatus: registrationMeta?.registrationStatus,
      });
    });

    if (userIsLinkedChild) {
      const isOnTeam = teamIds.some((teamId) => eventTeamIds.includes(teamId));
      const isParticipant = eventUserIds.includes(userId);
      const isFreeAgent = eventFreeAgentIds.includes(userId);
      if (isOnTeam || isParticipant || isFreeAgent) {
        const registrationMeta = childRegistrationByEventAndChild.get(`${event.id}:${userId}`);
        addChildAssociation({
          eventId: event.id,
          childUserId: userId,
          childEmail: selfEmail ?? undefined,
          consentStatus: registrationMeta?.consentStatus,
          registrationStatus: registrationMeta?.registrationStatus,
        });
      }
    }
  });

  const organizationIds = Array.from(new Set([
    ...discoverableEvents
      .map((event) => normalizeText(event.organizationId))
      .filter((value): value is string => Boolean(value)),
    ...templates
      .map((template) => normalizeText(template.organizationId))
      .filter((value): value is string => Boolean(value)),
  ]));

  const organizations = organizationIds.length
    ? await prisma.organizations.findMany({
      where: { id: { in: organizationIds } },
      select: {
        id: true,
        name: true,
      },
    })
    : [];
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, normalizeText(organization.name) ?? 'Organization']),
  );
  const discoverableEventsSorted = [...discoverableEvents].sort(
    (left, right) => toTimestamp(right.start) - toTimestamp(left.start),
  );

  const signedByTemplateScope = new Map<string, { id: string; signedAt?: string; createdAt?: Date; status?: string | null }>();
  const signedByEventScope = new Map<string, { id: string; signedAt?: string; createdAt?: Date; status?: string | null }>();

  signedDocuments.forEach((document) => {
    if (!isSignedStatus(document.status)) {
      return;
    }
    const templateId = normalizeText(document.templateId);
    if (!templateId) {
      return;
    }

    const signerContext = normalizeSignerContextValue(document.signerRole)
      ?? ((document.userId === userId && document.hostId) ? 'parent_guardian' : 'participant');
    const childUserId = signerContext === 'participant' ? undefined : normalizeText(document.hostId);
    const signerUserId = normalizeText(document.userId);
    if (!isSignerContextVisibleForViewer({
      viewerUserId: userId,
      signerContext,
      childUserId,
      signerUserId,
    })) {
      return;
    }
    const currentTime = toTimestamp(document.signedAt ?? document.createdAt ?? null);
    const templateScopeKey = buildTemplateScopeKey({
      templateId,
      signerContext,
      childUserId,
    });
    const existingByTemplate = signedByTemplateScope.get(templateScopeKey);
    const existingByTemplateTime = toTimestamp(existingByTemplate?.signedAt ?? existingByTemplate?.createdAt ?? null);
    if (!existingByTemplate || currentTime > existingByTemplateTime) {
      signedByTemplateScope.set(templateScopeKey, {
        id: document.id,
        signedAt: normalizeText(document.signedAt) ?? undefined,
        createdAt: document.createdAt ?? undefined,
        status: document.status,
      });
    }

    const eventId = normalizeText(document.eventId);
    if (!eventId) {
      return;
    }
    const eventScopeKey = buildEventScopeKey({
      eventId,
      templateId,
      signerContext,
      childUserId,
    });
    const existingByEvent = signedByEventScope.get(eventScopeKey);
    const existingByEventTime = toTimestamp(existingByEvent?.signedAt ?? existingByEvent?.createdAt ?? null);
    if (!existingByEvent || currentTime > existingByEventTime) {
      signedByEventScope.set(eventScopeKey, {
        id: document.id,
        signedAt: normalizeText(document.signedAt) ?? undefined,
        createdAt: document.createdAt ?? undefined,
        status: document.status,
      });
    }
  });

  const unsignedCards: ProfileDocumentCard[] = [];
  const unsignedCardKeys = new Set<string>();
  const signOnceUnsignedScopeKeys = new Set<string>();

  discoverableEventsSorted.forEach((event) => {
    const templateIds = Array.isArray(event.requiredTemplateIds)
      ? event.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    if (!templateIds.length) {
      return;
    }

    templateIds.forEach((templateId) => {
      const template = templateById.get(templateId);
      if (!template) {
        return;
      }

      const requiredSignerType = normalizeRequiredSignerType(template.requiredSignerType);
      const signerContexts: Array<{
        signerContext: SignerContext;
        childUserId?: string;
        childEmail?: string;
        consentStatus?: string;
        requiresChildEmail?: boolean;
        statusNote?: string;
      }> = [];
      const childRows = childAssociationsByEvent.get(event.id) ?? [];

      if (requiredSignerType === 'PARTICIPANT') {
        signerContexts.push({ signerContext: 'participant' });
      }
      if (requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'parent_guardian',
            childUserId: childRow.childUserId,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }
      if (requiredSignerType === 'CHILD' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'child',
            childUserId: childRow.childUserId,
            childEmail: childRow.childEmail,
            consentStatus: childRow.consentStatus,
            requiresChildEmail: childRow.requiresChildEmail,
            statusNote: childRow.statusNote,
          });
        });
      }

      signerContexts.forEach((context) => {
        const scopedChildUserId = context.signerContext === 'participant' ? undefined : context.childUserId;
        if (!isSignerContextVisibleForViewer({
          viewerUserId: userId,
          signerContext: context.signerContext,
          childUserId: scopedChildUserId,
        })) {
          return;
        }
        const templateScopeKey = buildTemplateScopeKey({
          templateId: template.id,
          signerContext: context.signerContext,
          childUserId: scopedChildUserId,
        });
        if (template.signOnce) {
          if (signOnceUnsignedScopeKeys.has(templateScopeKey)) {
            return;
          }
          signOnceUnsignedScopeKeys.add(templateScopeKey);
        }
        const signed = template.signOnce
          ? signedByTemplateScope.get(templateScopeKey)
          : signedByEventScope.get(buildEventScopeKey({
            eventId: event.id,
            templateId: template.id,
            signerContext: context.signerContext,
            childUserId: scopedChildUserId,
          }));
        if (signed) {
          return;
        }

        const cardId = template.signOnce
          ? `once:${templateScopeKey}`
          : `${event.id}:${template.id}:${context.signerContext}:${context.childUserId ?? 'self'}`;
        if (unsignedCardKeys.has(cardId)) {
          return;
        }
        unsignedCardKeys.add(cardId);

        const organizationDisplay = getDisplayOrganizationName({
          eventOrganizationId: event.organizationId,
          templateOrganizationId: template.organizationId,
          organizationsById,
        });
        const childMustSignFromOwnAccount = Boolean(
          context.signerContext === 'child'
          && context.childUserId
          && context.childUserId !== userId,
        );
        const statusNotes = [
          context.statusNote,
          childMustSignFromOwnAccount ? 'Waiting on child signature from the child account.' : undefined,
        ].filter((value): value is string => Boolean(value && value.trim()));
        const statusNote = statusNotes.length ? statusNotes.join(' ') : undefined;

        unsignedCards.push({
          id: cardId,
          status: 'UNSIGNED',
          eventId: event.id,
          eventName: normalizeText(event.name) ?? 'Event',
          organizationId: organizationDisplay.organizationId,
          organizationName: organizationDisplay.organizationName,
          templateId: template.id,
          title: normalizeText(template.title) ?? 'Required Document',
          type: normalizeTemplateType(template.type),
          requiredSignerType,
          requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
          signerContext: context.signerContext,
          signerContextLabel: getSignerContextLabel(context.signerContext),
          childUserId: context.childUserId,
          childEmail: context.childEmail,
          consentStatus: context.consentStatus,
          requiresChildEmail: context.requiresChildEmail,
          statusNote,
          content: normalizeTemplateType(template.type) === 'TEXT' ? normalizeText(template.content) : undefined,
        });
      });
    });
  });

  unsignedCards.sort((left, right) => {
    const leftEventStart = toTimestamp(eventById.get(left.eventId ?? '')?.start ?? null);
    const rightEventStart = toTimestamp(eventById.get(right.eventId ?? '')?.start ?? null);
    if (leftEventStart !== rightEventStart) {
      return rightEventStart - leftEventStart;
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  });

  const signedCards: ProfileDocumentCard[] = [];
  signedDocuments
    .filter((document) => isSignedStatus(document.status))
    .forEach((document) => {
      const event = normalizeText(document.eventId) ? eventById.get(normalizeText(document.eventId) as string) : undefined;
      const template = templateById.get(document.templateId);
      const requiredSignerType = normalizeRequiredSignerType(template?.requiredSignerType);
      const signerContext = normalizeSignerContextValue(document.signerRole) ?? (
        requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD'
          ? 'parent_guardian'
          : requiredSignerType === 'CHILD'
            ? 'child'
            : 'participant'
      );
      const childUserId = signerContext === 'participant' ? undefined : normalizeText(document.hostId);
      const signerUserId = normalizeText(document.userId);
      if (!isSignerContextVisibleForViewer({
        viewerUserId: userId,
        signerContext,
        childUserId,
        signerUserId,
      })) {
        return;
      }
      const organizationDisplay = getDisplayOrganizationName({
        eventOrganizationId: event?.organizationId,
        templateOrganizationId: template?.organizationId,
        organizationsById,
      });
      const type = normalizeTemplateType(template?.type);

      signedCards.push({
        id: document.id,
        status: 'SIGNED',
        eventId: event?.id ?? normalizeText(document.eventId),
        eventName: normalizeText(event?.name) ?? undefined,
        organizationId: organizationDisplay.organizationId,
        organizationName: organizationDisplay.organizationName,
        templateId: normalizeText(document.templateId) ?? '',
        title: normalizeText(template?.title) ?? 'Signed Document',
        type,
        requiredSignerType,
        requiredSignerLabel: getRequiredSignerTypeLabel(requiredSignerType),
        signerContext,
        signerContextLabel: getSignerContextLabel(signerContext),
        childUserId,
        signedAt: normalizeText(document.signedAt) ?? (document.createdAt ? document.createdAt.toISOString() : undefined),
        signedDocumentRecordId: document.id,
        viewUrl: type === 'PDF' ? `/api/documents/signed/${document.id}/file` : undefined,
        content: type === 'TEXT' ? normalizeText(template?.content) : undefined,
      });
    });

  signedCards.sort((left, right) => toTimestamp(right.signedAt) - toTimestamp(left.signedAt));

  return NextResponse.json({
    unsigned: unsignedCards,
    signed: signedCards,
  }, { status: 200 });
}
