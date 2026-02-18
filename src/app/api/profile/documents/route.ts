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

export async function GET(_req: NextRequest) {
  const session = await requireSession(_req);
  const userId = session.userId;

  const [profile, registrations, signedDocuments] = await Promise.all([
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
        eventId: true,
        parentId: true,
        registrantId: true,
        registrantType: true,
      },
    }),
    prisma.signedDocuments.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        signedDocumentId: true,
        templateId: true,
        eventId: true,
        status: true,
        signedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const teamIds = Array.isArray(profile?.teamIds)
    ? profile.teamIds.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
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
        ...(registrationEventIds.length ? [{ id: { in: registrationEventIds } }] : []),
        ...(signedEventIds.length ? [{ id: { in: signedEventIds } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      start: true,
      organizationId: true,
      requiredTemplateIds: true,
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
    childRegistrationRows
      .map((registration) => normalizeText(registration.registrantId))
      .filter((value): value is string => Boolean(value)),
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
  const childRegistrationsByEvent = new Map<string, Array<{ childUserId: string; childEmail?: string }>>();
  childRegistrationRows.forEach((registration) => {
    const eventId = normalizeText(registration.eventId);
    const childUserId = normalizeText(registration.registrantId);
    if (!eventId || !childUserId) return;
    const next = childRegistrationsByEvent.get(eventId) ?? [];
    next.push({
      childUserId,
      childEmail: childEmailById.get(childUserId) || undefined,
    });
    childRegistrationsByEvent.set(eventId, next);
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

  const signedByTemplateId = new Map<string, { id: string; signedAt?: string; createdAt?: Date; status?: string | null }>();
  const signedByEventAndTemplate = new Map<string, { id: string; signedAt?: string; createdAt?: Date; status?: string | null }>();

  signedDocuments.forEach((document) => {
    if (!isSignedStatus(document.status)) {
      return;
    }
    const templateId = normalizeText(document.templateId);
    if (!templateId) {
      return;
    }
    const existingByTemplate = signedByTemplateId.get(templateId);
    const existingByTemplateTime = toTimestamp(existingByTemplate?.signedAt ?? existingByTemplate?.createdAt ?? null);
    const currentTime = toTimestamp(document.signedAt ?? document.createdAt ?? null);
    if (!existingByTemplate || currentTime > existingByTemplateTime) {
      signedByTemplateId.set(templateId, {
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
    const compositeKey = `${eventId}::${templateId}`;
    const existingByEventTemplate = signedByEventAndTemplate.get(compositeKey);
    const existingByEventTemplateTime = toTimestamp(existingByEventTemplate?.signedAt ?? existingByEventTemplate?.createdAt ?? null);
    if (!existingByEventTemplate || currentTime > existingByEventTemplateTime) {
      signedByEventAndTemplate.set(compositeKey, {
        id: document.id,
        signedAt: normalizeText(document.signedAt) ?? undefined,
        createdAt: document.createdAt ?? undefined,
        status: document.status,
      });
    }
  });

  const unsignedCards: ProfileDocumentCard[] = [];
  const unsignedCardKeys = new Set<string>();

  discoverableEvents.forEach((event) => {
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
      }> = [];

      if (requiredSignerType === 'PARTICIPANT') {
        signerContexts.push({ signerContext: 'participant' });
      }
      if (requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD') {
        const childRows = childRegistrationsByEvent.get(event.id) ?? [];
        childRows.forEach((childRow) => {
          signerContexts.push({
            signerContext: 'parent_guardian',
            childUserId: childRow.childUserId,
            childEmail: childRow.childEmail,
          });
        });
      }

      signerContexts.forEach((context) => {
        const signed = template.signOnce
          ? signedByTemplateId.get(template.id)
          : signedByEventAndTemplate.get(`${event.id}::${template.id}`);
        if (signed) {
          return;
        }

        const cardId = `${event.id}:${template.id}:${context.signerContext}:${context.childUserId ?? 'self'}`;
        if (unsignedCardKeys.has(cardId)) {
          return;
        }
        unsignedCardKeys.add(cardId);

        const organizationDisplay = getDisplayOrganizationName({
          eventOrganizationId: event.organizationId,
          templateOrganizationId: template.organizationId,
          organizationsById,
        });

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

  const signedCards: ProfileDocumentCard[] = signedDocuments
    .filter((document) => isSignedStatus(document.status))
    .map((document) => {
      const event = normalizeText(document.eventId) ? eventById.get(normalizeText(document.eventId) as string) : undefined;
      const template = templateById.get(document.templateId);
      const requiredSignerType = normalizeRequiredSignerType(template?.requiredSignerType);
      const signerContext: SignerContext = requiredSignerType === 'PARENT_GUARDIAN' || requiredSignerType === 'PARENT_GUARDIAN_CHILD'
        ? 'parent_guardian'
        : requiredSignerType === 'CHILD'
          ? 'child'
          : 'participant';
      const organizationDisplay = getDisplayOrganizationName({
        eventOrganizationId: event?.organizationId,
        templateOrganizationId: template?.organizationId,
        organizationsById,
      });
      const type = normalizeTemplateType(template?.type);

      return {
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
        signedAt: normalizeText(document.signedAt) ?? (document.createdAt ? document.createdAt.toISOString() : undefined),
        signedDocumentRecordId: document.id,
        viewUrl: type === 'PDF' ? `/api/documents/signed/${document.id}/file` : undefined,
        content: type === 'TEXT' ? normalizeText(template?.content) : undefined,
      };
    });

  signedCards.sort((left, right) => toTimestamp(right.signedAt) - toTimestamp(left.signedAt));

  return NextResponse.json({
    unsigned: unsignedCards,
    signed: signedCards,
  }, { status: 200 });
}
