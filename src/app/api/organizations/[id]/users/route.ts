import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

type OrgEventRow = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  userIds: string[];
};

type EventSummary = {
  eventId: string;
  eventName: string;
  start: string;
  end: string;
  status?: string;
};

type DocumentSummary = {
  signedDocumentRecordId: string;
  documentId: string;
  templateId: string;
  eventId?: string;
  eventName?: string;
  title: string;
  type: 'PDF' | 'TEXT';
  status?: string;
  signedAt?: string;
  viewUrl?: string;
  content?: string;
};

type UserSummaryInternal = {
  userId: string;
  fullName: string;
  userName?: string;
  eventsById: Map<string, EventSummary>;
  documents: DocumentSummary[];
};

const toDisplayName = (user: {
  firstName?: string | null;
  lastName?: string | null;
  userName?: string | null;
  id: string;
}): string => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName) {
    return fullName;
  }
  if (user.userName?.trim()) {
    return user.userName.trim();
  }
  return user.id;
};

const normalizeStatus = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
};

const getSortTimestamp = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasOrganizationUserAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  org: { ownerId: string; refIds: string[]; hostIds: string[] };
  events: OrgEventRow[];
}): Promise<boolean> => {
  if (canManageOrganization(
    {
      userId: params.sessionUserId,
      isAdmin: params.isAdmin,
    },
    params.org,
  )) {
    return true;
  }

  if (params.org.refIds.includes(params.sessionUserId)) {
    return true;
  }

  const inEventUsers = params.events.some((event) => event.userIds.includes(params.sessionUserId));
  if (inEventUsers) {
    return true;
  }

  const eventIds = params.events.map((event) => event.id);
  if (!eventIds.length) {
    return false;
  }

  const registration = await prisma.eventRegistrations.findFirst({
    where: {
      eventId: { in: eventIds },
      OR: [
        { registrantId: params.sessionUserId },
        { createdBy: params.sessionUserId },
      ],
    },
    select: { id: true },
  });

  return Boolean(registration);
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true, hostIds: true, refIds: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const events = await prisma.events.findMany({
    where: { organizationId: id },
    select: {
      id: true,
      name: true,
      start: true,
      end: true,
      userIds: true,
    },
    orderBy: { start: 'desc' },
  });
  const eventRows: OrgEventRow[] = events.map((event) => ({
    id: event.id,
    name: event.name,
    start: event.start,
    end: event.end,
    userIds: Array.isArray(event.userIds) ? event.userIds.filter((entry): entry is string => typeof entry === 'string') : [],
  }));

  const canAccess = await hasOrganizationUserAccess({
    sessionUserId: session.userId,
    isAdmin: session.isAdmin,
    org: {
      ownerId: org.ownerId,
      hostIds: Array.isArray(org.hostIds) ? org.hostIds.filter((entry): entry is string => typeof entry === 'string') : [],
      refIds: Array.isArray(org.refIds) ? org.refIds.filter((entry): entry is string => typeof entry === 'string') : [],
    },
    events: eventRows,
  });

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const eventIds = eventRows.map((event) => event.id);
  const registrations = eventIds.length
    ? await prisma.eventRegistrations.findMany({
      where: { eventId: { in: eventIds } },
      select: {
        eventId: true,
        registrantId: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    : [];

  const participantUserIds = new Set<string>();
  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => participantUserIds.add(userId));
  });
  registrations.forEach((registration) => {
    participantUserIds.add(registration.registrantId);
  });

  const userIds = Array.from(participantUserIds);
  if (!userIds.length) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const [users, templates] = await Promise.all([
    prisma.userData.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
      },
    }),
    prisma.templateDocuments.findMany({
      where: { organizationId: id },
      select: {
        id: true,
        title: true,
        type: true,
        content: true,
      },
    }),
  ]);

  const templateById = new Map(templates.map((template) => [template.id, template]));
  const templateIds = templates.map((template) => template.id);

  const signedDocuments = (eventIds.length || templateIds.length)
    ? await prisma.signedDocuments.findMany({
      where: {
        userId: { in: userIds },
        OR: [
          ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
          ...(templateIds.length ? [{ templateId: { in: templateIds } }] : []),
        ],
      },
      select: {
        id: true,
        signedDocumentId: true,
        templateId: true,
        userId: true,
        documentName: true,
        eventId: true,
        status: true,
        signedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];

  const eventsById = new Map(eventRows.map((event) => [event.id, event]));
  const summariesByUserId = new Map<string, UserSummaryInternal>();

  users.forEach((user) => {
    summariesByUserId.set(user.id, {
      userId: user.id,
      fullName: toDisplayName(user),
      userName: user.userName ?? undefined,
      eventsById: new Map<string, EventSummary>(),
      documents: [],
    });
  });

  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => {
      const summary = summariesByUserId.get(userId);
      if (!summary) return;
      if (!summary.eventsById.has(event.id)) {
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
        });
      }
    });
  });

  registrations.forEach((registration) => {
    const summary = summariesByUserId.get(registration.registrantId);
    const event = eventsById.get(registration.eventId);
    if (!summary || !event) return;

    const existing = summary.eventsById.get(event.id);
    summary.eventsById.set(event.id, {
      eventId: event.id,
      eventName: event.name,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      status: normalizeStatus(registration.status) ?? existing?.status,
    });
  });

  signedDocuments.forEach((document) => {
    const summary = summariesByUserId.get(document.userId);
    if (!summary) return;
    const template = templateById.get(document.templateId);
    const type: 'PDF' | 'TEXT' = template?.type === 'TEXT' ? 'TEXT' : 'PDF';
    const event = document.eventId ? eventsById.get(document.eventId) : undefined;

    summary.documents.push({
      signedDocumentRecordId: document.id,
      documentId: document.signedDocumentId,
      templateId: document.templateId,
      eventId: document.eventId ?? undefined,
      eventName: event?.name,
      title: template?.title?.trim() || document.documentName || 'Signed Document',
      type,
      status: normalizeStatus(document.status),
      signedAt: document.signedAt ?? document.createdAt?.toISOString() ?? undefined,
      viewUrl: type === 'PDF' ? `/api/documents/signed/${document.id}/file` : undefined,
      content: type === 'TEXT' ? template?.content ?? undefined : undefined,
    });
  });

  const usersPayload = Array.from(summariesByUserId.values())
    .map((summary) => {
      const eventsList = Array.from(summary.eventsById.values())
        .sort((a, b) => getSortTimestamp(b.start) - getSortTimestamp(a.start));
      const documentsList = [...summary.documents]
        .sort((a, b) => getSortTimestamp(b.signedAt) - getSortTimestamp(a.signedAt));

      return {
        userId: summary.userId,
        fullName: summary.fullName,
        userName: summary.userName,
        events: eventsList,
        documents: documentsList,
      };
    })
    .filter((summary) => summary.events.length > 0 || summary.documents.length > 0)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }));

  return NextResponse.json({ users: usersPayload }, { status: 200 });
}
