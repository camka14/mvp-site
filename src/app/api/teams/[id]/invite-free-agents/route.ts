import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import { loadCanonicalTeamById } from '@/server/teams/teamMembership';
import {
  applyUserPrivacyList,
  createVisibilityContext,
  publicUserSelect,
} from '@/server/userPrivacy';

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const includesId = (ids: string[], value: string): boolean => {
  return ids.map((entry) => entry.trim()).filter(Boolean).includes(value);
};

type InviteTeamContext = {
  id: string;
  playerIds: string[];
  captainId: string;
  managerId: string;
  headCoachId: string | null;
  coachIds: string[];
  parentTeamId: string | null;
};

type EventTeamOption = {
  eventId: string;
  eventTeamId: string;
  eventName: string;
  eventStart: string | null;
  eventEnd: string | null;
  teamName: string;
};

const toInviteTeamContext = (teamId: string, row: Record<string, unknown>): InviteTeamContext => ({
  id: normalizeText(row.id) ?? teamId,
  playerIds: normalizeIdList(row.playerIds),
  captainId: normalizeText(row.captainId) ?? '',
  managerId: normalizeText(row.managerId) ?? '',
  headCoachId: normalizeText(row.headCoachId),
  coachIds: normalizeIdList(row.coachIds),
  parentTeamId: normalizeText(row.parentTeamId),
});

const loadInviteTeamContext = async (
  teamId: string,
  teamsDelegate: any,
): Promise<InviteTeamContext | null> => {
  const eventTeam = await teamsDelegate.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
      parentTeamId: true,
    },
  });

  if (eventTeam) {
    return toInviteTeamContext(teamId, eventTeam);
  }

  const canonicalTeam = await loadCanonicalTeamById(teamId, prisma);
  if (!canonicalTeam) {
    return null;
  }

  return toInviteTeamContext(teamId, canonicalTeam as Record<string, unknown>);
};

const hasOrganizationTeamManagementAccess = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
): Promise<boolean> => {
  if (!teamId || !session.userId) return false;
  const team = await prisma.canonicalTeams.findUnique({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = typeof team?.organizationId === 'string' ? team.organizationId.trim() : '';
  if (!organizationId) {
    return false;
  }
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
  });
  if (!organization) {
    return false;
  }
  return canManageOrganization(session, organization);
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = id.trim();
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.findMany) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const team = await loadInviteTeamContext(teamId, teamsDelegate);
  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isTeamManager = session.isAdmin
    || team.captainId === session.userId
    || team.managerId === session.userId
    || team.headCoachId === session.userId
    || includesId(normalizeIdList(team.coachIds), session.userId);
  const organizationAccessTeamId = team.parentTeamId ?? teamId;
  const isOrganizationManager = !isTeamManager
    ? await hasOrganizationTeamManagementAccess(organizationAccessTeamId, session)
    : false;

  const playerIds = normalizeIdList(team.playerIds);
  const parentLink = !isTeamManager && !isOrganizationManager && playerIds.length > 0
    ? await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId: { in: playerIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    : null;

  if (!isTeamManager && !isOrganizationManager && !parentLink) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const relatedTeamSeedIds = Array.from(new Set([teamId, team.parentTeamId].filter((value): value is string => Boolean(value))));
  const childTeams = await teamsDelegate.findMany({
    where: { parentTeamId: { in: relatedTeamSeedIds } },
    select: { id: true },
  });
  const childTeamIds = childTeams.map((row: { id: string }) => row.id).filter(Boolean);
  const relatedTeamIds = Array.from(new Set([...relatedTeamSeedIds, ...childTeamIds]));

  const now = new Date();
  const linkedTeamRegistrations = await prisma.eventRegistrations.findMany({
    where: {
      registrantType: 'TEAM',
      registrantId: { in: relatedTeamIds },
      rosterRole: 'PARTICIPANT',
      status: { in: ['STARTED', 'ACTIVE', 'BLOCKED'] },
      slotId: null,
      occurrenceDate: null,
    },
    select: {
      eventId: true,
      registrantId: true,
    },
  });
  const candidateEventIds = Array.from(new Set(linkedTeamRegistrations.map((row) => row.eventId)));
  const events = await prisma.events.findMany({
    where: {
      id: { in: candidateEventIds },
      NOT: { end: { lt: now } },
    },
    select: {
      id: true,
      name: true,
      start: true,
      end: true,
    },
    orderBy: { start: 'asc' },
  });

  const eventIds = events.map((event) => event.id);
  const visibleEventIds = new Set(eventIds);
  const linkedEventTeamIds = Array.from(new Set(
    linkedTeamRegistrations
      .filter((row) => visibleEventIds.has(row.eventId))
      .map((row) => row.registrantId)
      .filter((eventTeamId) => relatedTeamIds.includes(eventTeamId)),
  ));
  const linkedEventTeamRows = linkedEventTeamIds.length
    ? await teamsDelegate.findMany({
      where: { id: { in: linkedEventTeamIds } },
      select: {
        id: true,
        eventId: true,
        name: true,
        parentTeamId: true,
      },
    })
    : [];
  const eventTeamById = new Map<string, any>(linkedEventTeamRows.map((row: any) => [row.id, row] as const));
  const eventTeamsByEventId = new Map<string, EventTeamOption[]>();
  const eventTeams: EventTeamOption[] = [];
  events.forEach((event) => {
    linkedTeamRegistrations
      .filter((row) => row.eventId === event.id && linkedEventTeamIds.includes(row.registrantId))
      .map((row) => row.registrantId)
      .forEach((eventTeamId) => {
        const eventTeam = eventTeamById.get(eventTeamId);
        const option: EventTeamOption = {
          eventId: event.id,
          eventTeamId,
          eventName: event.name,
          eventStart: event.start ? event.start.toISOString() : null,
          eventEnd: event.end ? event.end.toISOString() : null,
          teamName: normalizeText(eventTeam?.name) ?? teamId,
        };
        eventTeams.push(option);
        const existing = eventTeamsByEventId.get(event.id) ?? [];
        existing.push(option);
        eventTeamsByEventId.set(event.id, existing);
      });
  });

  const registrationFreeAgents = eventIds.length
    ? await prisma.eventRegistrations.findMany({
      where: {
        eventId: { in: eventIds },
        registrantType: 'SELF',
        rosterRole: 'FREE_AGENT',
        status: { in: ['STARTED', 'ACTIVE', 'BLOCKED'] },
        slotId: null,
        occurrenceDate: null,
      },
      select: {
        eventId: true,
        registrantId: true,
      },
    })
    : [];

  const freeAgentEventsByUserId: Record<string, string[]> = {};
  const freeAgentEventTeamIdsByUserId: Record<string, string[]> = {};
  const addFreeAgentSource = (userId: string, eventId: string) => {
    if (!userId || !eventId) return;
    const eventIdsForUser = freeAgentEventsByUserId[userId] ?? [];
    if (!eventIdsForUser.includes(eventId)) {
      eventIdsForUser.push(eventId);
      freeAgentEventsByUserId[userId] = eventIdsForUser;
    }
    const eventTeamIdsForUser = freeAgentEventTeamIdsByUserId[userId] ?? [];
    (eventTeamsByEventId.get(eventId) ?? []).forEach((option) => {
      if (!eventTeamIdsForUser.includes(option.eventTeamId)) {
        eventTeamIdsForUser.push(option.eventTeamId);
      }
    });
    freeAgentEventTeamIdsByUserId[userId] = eventTeamIdsForUser;
  };

  registrationFreeAgents.forEach((row) => {
    addFreeAgentSource(row.registrantId, row.eventId);
  });

  const freeAgentIds = Array.from(new Set(Object.keys(freeAgentEventsByUserId)));

  if (!freeAgentIds.length) {
    return NextResponse.json({
      users: [],
      eventIds,
      freeAgentIds: [],
      eventTeams,
      freeAgentEventsByUserId,
      freeAgentEventTeamIdsByUserId,
    }, { status: 200 });
  }

  const users = await prisma.userData.findMany({
    where: { id: { in: freeAgentIds } },
    select: publicUserSelect,
  });
  const usersById = new Map(users.map((user) => [user.id, user] as const));
  const orderedUsers = freeAgentIds
    .map((freeAgentId) => usersById.get(freeAgentId))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const visibilityContext = await createVisibilityContext(prisma, {
    viewerId: session.userId,
    isAdmin: session.isAdmin,
    teamId: childTeamIds[0] ?? teamId,
    eventId: events[0]?.id,
    allowManagerFreeAgentUnmask: true,
    freeAgentUserIds: freeAgentIds,
  });

  return NextResponse.json(
    {
      users: withLegacyList(applyUserPrivacyList(orderedUsers, visibilityContext)),
      eventIds,
      freeAgentIds,
      eventTeams,
      freeAgentEventsByUserId,
      freeAgentEventTeamIdsByUserId,
    },
    { status: 200 },
  );
}
