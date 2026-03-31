import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization, canOfficialOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

type OrgEventRow = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  userIds: string[];
  teamIds: string[];
  hostId: string | null;
  assistantHostIds: string[];
  officialIds: string[];
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

const normalizeEventName = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : 'Untitled Event';
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const ids = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized) {
      ids.add(normalized);
    }
  });
  return Array.from(ids);
};

const isTeamRegistrantType = (value: unknown): boolean => {
  const normalized = normalizeId(value);
  if (!normalized) {
    return false;
  }
  return normalized.toUpperCase() === 'TEAM';
};

const toEventTeamKey = (eventId: string, teamId: string): string => `${eventId}::${teamId}`;

const getSortTimestamp = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasOrganizationUserAccess = async (params: {
  sessionUserId: string;
  isAdmin: boolean;
  org: { id: string; ownerId: string };
  events: OrgEventRow[];
}): Promise<boolean> => {
  if (await canManageOrganization(
    {
      userId: params.sessionUserId,
      isAdmin: params.isAdmin,
    },
    params.org,
  )) {
    return true;
  }

  if (await canOfficialOrganization(
    {
      userId: params.sessionUserId,
      isAdmin: params.isAdmin,
    },
    params.org,
  )) {
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
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const organizationFields = await prisma.fields.findMany({
    where: { organizationId: id },
    select: { id: true },
  });
  const organizationFieldIds = organizationFields
    .map((field) => normalizeId(field.id))
    .filter((fieldId): fieldId is string => Boolean(fieldId));

  const eventWhere = organizationFieldIds.length
    ? {
      OR: [
        { organizationId: id },
        { fieldIds: { hasSome: organizationFieldIds } },
      ],
    }
    : { organizationId: id };

  const events = await prisma.events.findMany({
    where: eventWhere,
    select: {
      id: true,
      name: true,
      start: true,
      end: true,
      userIds: true,
      teamIds: true,
      hostId: true,
      assistantHostIds: true,
      officialIds: true,
    },
    orderBy: { start: 'desc' },
  });
  const eventRows: OrgEventRow[] = events.map((event) => ({
    id: event.id,
    name: normalizeEventName(event.name),
    start: event.start,
    end: event.end ?? event.start,
    userIds: normalizeIdList(event.userIds),
    teamIds: normalizeIdList(event.teamIds),
    hostId: normalizeId(event.hostId),
    assistantHostIds: normalizeIdList(event.assistantHostIds),
    officialIds: normalizeIdList(event.officialIds),
  }));

  const canAccess = await hasOrganizationUserAccess({
    sessionUserId: session.userId,
    isAdmin: session.isAdmin,
    org: {
      id: org.id,
      ownerId: org.ownerId,
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
        registrantType: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    : [];
  const eventOfficials = eventIds.length
    ? await prisma.eventOfficials.findMany({
      where: { eventId: { in: eventIds } },
      select: {
        eventId: true,
        userId: true,
      },
    })
    : [];

  const teamIdsByEventId = new Map<string, Set<string>>();
  eventRows.forEach((event) => {
    teamIdsByEventId.set(event.id, new Set(event.teamIds));
  });
  registrations.forEach((registration) => {
    if (!isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const teamId = normalizeId(registration.registrantId);
    if (!teamId) {
      return;
    }
    const teamIdsForEvent = teamIdsByEventId.get(registration.eventId);
    if (teamIdsForEvent) {
      teamIdsForEvent.add(teamId);
      return;
    }
    teamIdsByEventId.set(registration.eventId, new Set([teamId]));
  });

  const registeredTeamIds = Array.from(
    new Set(
      Array.from(teamIdsByEventId.values())
        .flatMap((teamIds) => Array.from(teamIds)),
    ),
  );
  const teams = registeredTeamIds.length
    ? await prisma.teams.findMany({
      where: { id: { in: registeredTeamIds } },
      select: {
        id: true,
        playerIds: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
      },
    })
    : [];
  const teamMemberIdsByTeamId = new Map<string, string[]>();
  teams.forEach((team) => {
    const memberIds = normalizeIdList([
      ...normalizeIdList(team.playerIds),
      team.captainId,
      team.managerId,
      team.headCoachId,
      ...normalizeIdList(team.coachIds),
    ]);
    teamMemberIdsByTeamId.set(team.id, memberIds);
  });

  const teamRegistrationStatusByEventTeam = new Map<string, string | undefined>();
  registrations.forEach((registration) => {
    if (!isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const teamId = normalizeId(registration.registrantId);
    if (!teamId) {
      return;
    }
    const key = toEventTeamKey(registration.eventId, teamId);
    if (!teamRegistrationStatusByEventTeam.has(key)) {
      teamRegistrationStatusByEventTeam.set(key, normalizeStatus(registration.status));
    }
  });

  const participantUserIds = new Set<string>();
  eventRows.forEach((event) => {
    event.userIds.forEach((userId) => participantUserIds.add(userId));
    if (event.hostId) {
      participantUserIds.add(event.hostId);
    }
    event.assistantHostIds.forEach((userId) => participantUserIds.add(userId));
    event.officialIds.forEach((userId) => participantUserIds.add(userId));
  });
  eventOfficials.forEach((assignment) => {
    const userId = normalizeId(assignment.userId);
    if (userId) {
      participantUserIds.add(userId);
    }
  });
  registrations.forEach((registration) => {
    if (isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const registrantId = normalizeId(registration.registrantId);
    if (registrantId) {
      participantUserIds.add(registrantId);
    }
  });
  teamMemberIdsByTeamId.forEach((memberIds) => {
    memberIds.forEach((memberId) => participantUserIds.add(memberId));
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
    const assignmentUserIds = [
      event.hostId,
      ...event.assistantHostIds,
      ...event.officialIds,
    ];
    assignmentUserIds.forEach((userId) => {
      const normalizedUserId = normalizeId(userId);
      if (!normalizedUserId) {
        return;
      }
      const summary = summariesByUserId.get(normalizedUserId);
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

  eventOfficials.forEach((assignment) => {
    const userId = normalizeId(assignment.userId);
    if (!userId) {
      return;
    }
    const event = eventsById.get(assignment.eventId);
    if (!event) {
      return;
    }
    const summary = summariesByUserId.get(userId);
    if (!summary) {
      return;
    }
    if (!summary.eventsById.has(event.id)) {
      summary.eventsById.set(event.id, {
        eventId: event.id,
        eventName: event.name,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
      });
    }
  });

  eventRows.forEach((event) => {
    const teamIds = teamIdsByEventId.get(event.id);
    if (!teamIds) {
      return;
    }
    teamIds.forEach((teamId) => {
      const memberIds = teamMemberIdsByTeamId.get(teamId);
      if (!memberIds) {
        return;
      }
      const teamStatus = teamRegistrationStatusByEventTeam.get(toEventTeamKey(event.id, teamId));
      memberIds.forEach((userId) => {
        const summary = summariesByUserId.get(userId);
        if (!summary) {
          return;
        }
        const existing = summary.eventsById.get(event.id);
        summary.eventsById.set(event.id, {
          eventId: event.id,
          eventName: event.name,
          start: event.start.toISOString(),
          end: event.end.toISOString(),
          status: teamStatus ?? existing?.status,
        });
      });
    });
  });

  registrations.forEach((registration) => {
    if (isTeamRegistrantType(registration.registrantType)) {
      return;
    }
    const registrantId = normalizeId(registration.registrantId);
    if (!registrantId) {
      return;
    }
    const summary = summariesByUserId.get(registrantId);
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

