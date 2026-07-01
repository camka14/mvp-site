import type { Prisma } from '@/generated/prisma/client';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';

type PrismaClientLike = Prisma.TransactionClient;

type EventAccessRow = {
  id: string;
  hostId?: string | null;
  assistantHostIds?: string[] | null;
  organizationId?: string | null;
  start?: Date | string | null;
  teamSignup?: boolean | null;
  teamCheckInMode?: string | null;
  teamCheckInOpenMinutesBefore?: number | null;
  allowMatchRosterEdits?: boolean | null;
  allowTemporaryMatchPlayers?: boolean | null;
};

type MatchAccessRow = {
  id: string;
  eventId?: string | null;
  start?: Date | string | null;
  status?: string | null;
  resultType?: string | null;
  actualEnd?: Date | string | null;
  team1Id?: string | null;
  team2Id?: string | null;
};

type MatchRosterOverrideRow = {
  id: string;
  source: string;
  status: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  linkedAt: Date | null;
  removedAt: Date | null;
};

type RosterUserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  userName: string;
};

const CHECK_IN_STATUS = 'CHECKED_IN';
const BASE_SOURCE = 'BASE';
const TEMPORARY_SOURCE = 'TEMPORARY';
const ACTIVE_STATUS = 'ACTIVE';
const REMOVED_STATUS = 'REMOVED';

const normalizeId = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};

const normalizeName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const buildTeamCheckInKey = (
  eventId: string,
  eventTeamId: string,
  matchId?: string | null,
): string => (
  matchId ? `match:${eventId}:${matchId}:${eventTeamId}` : `event:${eventId}:${eventTeamId}`
);

export const isMatchCompletedForRoster = (match: MatchAccessRow): boolean => {
  const status = String(match.status ?? '').toUpperCase();
  const resultType = String(match.resultType ?? '').toUpperCase();
  return status === 'COMPLETE' || status === 'CANCELLED' || resultType === 'FORFEIT' || Boolean(match.actualEnd);
};

export const getCheckInOpenAt = (
  start: Date | string | null | undefined,
  openMinutesBefore: number | null | undefined,
): Date | null => {
  if (!start) return null;
  const startDate = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const minutes = Number.isFinite(Number(openMinutesBefore)) ? Math.max(0, Math.trunc(Number(openMinutesBefore))) : 60;
  return new Date(startDate.getTime() - minutes * 60_000);
};

export const assertCheckInWindowOpen = (
  start: Date | string | null | undefined,
  openMinutesBefore: number | null | undefined,
  now = new Date(),
): void => {
  const openAt = getCheckInOpenAt(start, openMinutesBefore);
  if (openAt && now.getTime() < openAt.getTime()) {
    throw new Response('Check-in is not open yet.', { status: 409 });
  }
};

export const isTeamManagerOrCoach = async (
  client: PrismaClientLike,
  eventTeamId: string,
  userId: string,
): Promise<boolean> => {
  const team = await client.teams.findUnique({
    where: { id: eventTeamId },
    select: {
      id: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
    },
  });
  if (!team) {
    return false;
  }
  const managerOrCoachIds = [
    normalizeId(team.managerId),
    normalizeId(team.headCoachId),
    ...(Array.isArray(team.coachIds) ? team.coachIds.map(normalizeId) : []),
  ].filter((entry): entry is string => Boolean(entry));
  if (managerOrCoachIds.includes(userId)) {
    return true;
  }
  const activeAssignment = await client.eventTeamStaffAssignments.findFirst({
    where: {
      eventTeamId,
      userId,
      status: 'ACTIVE',
      role: { in: ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'] },
    },
    select: { id: true },
  });
  return Boolean(activeAssignment);
};

export const loadTeamCheckIns = async (
  client: PrismaClientLike,
  eventId: string,
  options: { matchId?: string | null } = {},
) => client.teamCheckIns.findMany({
  where: {
    eventId,
    ...(options.matchId !== undefined ? { matchId: options.matchId } : {}),
  },
  orderBy: { checkedInAt: 'desc' },
});

export const checkInTeam = async (
  client: PrismaClientLike,
  params: {
    event: EventAccessRow;
    eventTeamId: string;
    checkedInByUserId: string;
    match?: MatchAccessRow | null;
    now?: Date;
  },
) => {
  const now = params.now ?? new Date();
  const matchId = params.match?.id ?? null;
  const expectedMode = matchId ? 'MATCH' : 'EVENT';
  if (params.event.teamSignup !== true) {
    throw new Response('Team check-in requires a team event.', { status: 400 });
  }
  if (String(params.event.teamCheckInMode ?? 'OFF').toUpperCase() !== expectedMode) {
    throw new Response('Team check-in is not enabled for this scope.', { status: 400 });
  }
  const canCheckIn = await isTeamManagerOrCoach(client, params.eventTeamId, params.checkedInByUserId);
  if (!canCheckIn) {
    throw new Response('Only team managers and coaches can check in.', { status: 403 });
  }
  assertCheckInWindowOpen(params.match?.start ?? params.event.start, params.event.teamCheckInOpenMinutesBefore, now);
  const checkInKey = buildTeamCheckInKey(params.event.id, params.eventTeamId, matchId);
  return client.teamCheckIns.upsert({
    where: { checkInKey },
    create: {
      id: crypto.randomUUID(),
      eventId: params.event.id,
      matchId,
      eventTeamId: params.eventTeamId,
      checkInKey,
      checkedInAt: now,
      checkedInByUserId: params.checkedInByUserId,
      scope: expectedMode,
      status: CHECK_IN_STATUS,
    },
    update: {
      checkedInAt: now,
      checkedInByUserId: params.checkedInByUserId,
      status: CHECK_IN_STATUS,
    },
  });
};

const loadCanonicalRosterUsers = async (
  client: PrismaClientLike,
  eventId: string,
  eventTeamId: string,
): Promise<Set<string>> => {
  const [team, registrations] = await Promise.all([
    client.teams.findUnique({
      where: { id: eventTeamId },
      select: { playerIds: true, playerRegistrationIds: true },
    }),
    client.eventRegistrations.findMany({
      where: {
        eventId,
        eventTeamId,
        registrantType: { not: 'TEAM' },
        rosterRole: 'PARTICIPANT',
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
      },
      select: { registrantId: true },
    }),
  ]);
  return new Set([
    ...(Array.isArray(team?.playerIds) ? team.playerIds : []),
    ...registrations.map((registration: { registrantId: string }) => registration.registrantId),
  ].map(normalizeId).filter((entry): entry is string => Boolean(entry)));
};

export const getMatchRoster = async (
  client: PrismaClientLike,
  params: {
    eventId: string;
    matchId: string;
    eventTeamId: string;
  },
) => {
  const [canonicalUserIds, overrides] = await Promise.all([
    loadCanonicalRosterUsers(client, params.eventId, params.eventTeamId),
    client.matchRosterEntries.findMany({
      where: {
        eventId: params.eventId,
        matchId: params.matchId,
        eventTeamId: params.eventTeamId,
      },
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  const users: RosterUserRow[] = canonicalUserIds.size
    ? await client.userData.findMany({
      where: { id: { in: Array.from(canonicalUserIds) } },
      select: { id: true, firstName: true, lastName: true, userName: true },
    })
    : [];
  const typedOverrides = overrides as MatchRosterOverrideRow[];
  const baseOverridesByUserId = new Map<string, MatchRosterOverrideRow>(
    typedOverrides
      .filter((entry) => entry.source === BASE_SOURCE && entry.userId)
      .map((entry) => [entry.userId as string, entry]),
  );
  const baseEntries = users.map((user) => {
    const override = baseOverridesByUserId.get(user.id);
    return {
      id: override?.id ?? null,
      source: BASE_SOURCE,
      status: override?.status === REMOVED_STATUS ? REMOVED_STATUS : ACTIVE_STATUS,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      userName: user.userName,
      email: null,
      noAccount: false,
      removedAt: override?.removedAt ?? null,
    };
  });
  const temporaryEntries = typedOverrides
    .filter((entry) => entry.source === TEMPORARY_SOURCE)
    .map((entry) => ({
      id: entry.id,
      source: TEMPORARY_SOURCE,
      status: entry.status,
      userId: entry.userId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      userName: null,
      email: entry.email,
      noAccount: !entry.userId,
      linkedAt: entry.linkedAt,
      removedAt: entry.removedAt,
    }));
  return {
    eventTeamId: params.eventTeamId,
    entries: [...baseEntries, ...temporaryEntries],
  };
};

export const removeMatchRosterPlayer = async (
  client: PrismaClientLike,
  params: {
    eventId: string;
    matchId: string;
    eventTeamId: string;
    userId: string;
    actorUserId: string;
    match: MatchAccessRow;
    event: EventAccessRow;
  },
) => {
  if (isMatchCompletedForRoster(params.match)) {
    throw new Response('Completed match rosters cannot remove players.', { status: 409 });
  }
  if (params.event.allowMatchRosterEdits !== true) {
    throw new Response('Match roster edits are not enabled.', { status: 400 });
  }
  const canonicalUserIds = await loadCanonicalRosterUsers(client, params.eventId, params.eventTeamId);
  if (!canonicalUserIds.has(params.userId)) {
    throw new Response('Player is not on the event team roster.', { status: 404 });
  }
  const existing = await client.matchRosterEntries.findFirst({
    where: {
      eventId: params.eventId,
      matchId: params.matchId,
      eventTeamId: params.eventTeamId,
      source: BASE_SOURCE,
      userId: params.userId,
    },
    select: { id: true },
  });
  const now = new Date();
  if (existing) {
    return client.matchRosterEntries.update({
      where: { id: existing.id },
      data: {
        status: REMOVED_STATUS,
        removedAt: now,
        removedByUserId: params.actorUserId,
      },
    });
  }
  return client.matchRosterEntries.create({
    data: {
      id: crypto.randomUUID(),
      eventId: params.eventId,
      matchId: params.matchId,
      eventTeamId: params.eventTeamId,
      source: BASE_SOURCE,
      status: REMOVED_STATUS,
      userId: params.userId,
      createdByUserId: params.actorUserId,
      removedAt: now,
      removedByUserId: params.actorUserId,
    },
  });
};

export const restoreMatchRosterPlayer = async (
  client: PrismaClientLike,
  params: {
    eventId: string;
    matchId: string;
    eventTeamId: string;
    userId: string;
    match: MatchAccessRow;
    event: EventAccessRow;
  },
) => {
  if (isMatchCompletedForRoster(params.match)) {
    throw new Response('Completed match rosters cannot restore players.', { status: 409 });
  }
  if (params.event.allowMatchRosterEdits !== true) {
    throw new Response('Match roster edits are not enabled.', { status: 400 });
  }
  return client.matchRosterEntries.deleteMany({
    where: {
      eventId: params.eventId,
      matchId: params.matchId,
      eventTeamId: params.eventTeamId,
      source: BASE_SOURCE,
      userId: params.userId,
    },
  });
};

export const addTemporaryMatchRosterPlayer = async (
  client: PrismaClientLike,
  params: {
    eventId: string;
    matchId: string;
    eventTeamId: string;
    firstName: unknown;
    lastName: unknown;
    email?: unknown;
    actorUserId: string;
    match: MatchAccessRow;
    event: EventAccessRow;
    existingEntryId?: string | null;
  },
) => {
  if (params.event.allowMatchRosterEdits !== true) {
    throw new Response('Match roster edits are not enabled.', { status: 400 });
  }
  if (isMatchCompletedForRoster(params.match) && !params.existingEntryId) {
    throw new Response('Completed match rosters cannot add players.', { status: 409 });
  }
  if (params.event.allowTemporaryMatchPlayers !== true) {
    throw new Response('Temporary match players are not enabled.', { status: 400 });
  }
  const existingEntry = params.existingEntryId
    ? await client.matchRosterEntries.findFirst({
      where: {
        id: params.existingEntryId,
        eventId: params.eventId,
        matchId: params.matchId,
        eventTeamId: params.eventTeamId,
        source: TEMPORARY_SOURCE,
      },
    })
    : null;
  const firstName = normalizeName(params.firstName) ?? normalizeName(existingEntry?.firstName);
  const lastName = normalizeName(params.lastName) ?? normalizeName(existingEntry?.lastName);
  if (!firstName || !lastName) {
    throw new Response('First and last name are required.', { status: 400 });
  }
  const email = normalizeEmail(params.email);
  const now = new Date();
  let linkedUserId: string | null = null;
  if (email) {
    const ensured = await ensureAuthUserAndUserDataByEmail(client, email, now, { firstName, lastName });
    linkedUserId = ensured.userId;
    const canonicalUserIds = await loadCanonicalRosterUsers(client, params.eventId, params.eventTeamId);
    if (canonicalUserIds.has(linkedUserId)) {
      await client.matchRosterEntries.deleteMany({
        where: {
          eventId: params.eventId,
          matchId: params.matchId,
          eventTeamId: params.eventTeamId,
          source: TEMPORARY_SOURCE,
          OR: [{ userId: linkedUserId }, { email }],
        },
      });
      if (!isMatchCompletedForRoster(params.match)) {
        await restoreMatchRosterPlayer(client, {
          eventId: params.eventId,
          matchId: params.matchId,
          eventTeamId: params.eventTeamId,
          userId: linkedUserId,
          match: params.match,
          event: params.event,
        });
      }
      return null;
    }
  }
  if (params.existingEntryId) {
    if (!existingEntry) {
      throw new Response('Temporary roster entry not found.', { status: 404 });
    }
    return client.matchRosterEntries.update({
      where: { id: params.existingEntryId },
      data: {
        firstName,
        lastName,
        email,
        userId: linkedUserId,
        linkedAt: linkedUserId ? now : null,
        linkedByUserId: linkedUserId ? params.actorUserId : null,
      },
    });
  }
  return client.matchRosterEntries.create({
    data: {
      id: crypto.randomUUID(),
      eventId: params.eventId,
      matchId: params.matchId,
      eventTeamId: params.eventTeamId,
      source: TEMPORARY_SOURCE,
      status: ACTIVE_STATUS,
      userId: linkedUserId,
      firstName,
      lastName,
      email,
      linkedAt: linkedUserId ? now : null,
      linkedByUserId: linkedUserId ? params.actorUserId : null,
      createdByUserId: params.actorUserId,
    },
  });
};

export const syncNewCanonicalPlayerIntoMatchRosters = async (
  client: PrismaClientLike,
  params: {
    eventId: string;
    eventTeamId: string;
    userId: string;
    actorUserId: string;
    now?: Date;
  },
) => {
  const now = params.now ?? new Date();
  const matches = await client.matches.findMany({
    where: {
      eventId: params.eventId,
      OR: [
        { team1Id: params.eventTeamId },
        { team2Id: params.eventTeamId },
      ],
    },
    select: {
      id: true,
      status: true,
      resultType: true,
      actualEnd: true,
    },
  });
  await Promise.all(matches.map(async (match) => {
    await client.matchRosterEntries.deleteMany({
      where: {
        eventId: params.eventId,
        matchId: match.id,
        eventTeamId: params.eventTeamId,
        source: TEMPORARY_SOURCE,
        userId: params.userId,
      },
    });
    if (!isMatchCompletedForRoster(match)) {
      return;
    }
    const existing = await client.matchRosterEntries.findFirst({
      where: {
        eventId: params.eventId,
        matchId: match.id,
        eventTeamId: params.eventTeamId,
        source: BASE_SOURCE,
        userId: params.userId,
      },
      select: { id: true },
    });
    if (existing) {
      await client.matchRosterEntries.update({
        where: { id: existing.id },
        data: {
          status: REMOVED_STATUS,
          removedAt: now,
          removedByUserId: params.actorUserId,
        },
      });
      return;
    }
    await client.matchRosterEntries.create({
      data: {
        id: crypto.randomUUID(),
        eventId: params.eventId,
        matchId: match.id,
        eventTeamId: params.eventTeamId,
        source: BASE_SOURCE,
        status: REMOVED_STATUS,
        userId: params.userId,
        createdByUserId: params.actorUserId,
        removedAt: now,
        removedByUserId: params.actorUserId,
      },
    });
  }));
};
