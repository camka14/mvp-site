import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { withLegacyFields } from '@/server/legacyFormat';
import { upsertEventRegistration } from '@/server/events/eventRegistrations';

type PrismaLike = PrismaClient | Prisma.TransactionClient | any;

export type CanonicalPlayerRegistration = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  teamId: string;
  userId: string;
  status: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean | null;
  createdBy?: string | null;
};

export type TeamRegistrationMetadataInput = {
  userId?: unknown;
  jerseyNumber?: unknown;
  position?: unknown;
};

export type CanonicalStaffAssignment = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  teamId: string;
  userId: string;
  role: string;
  status: string;
  createdBy?: string | null;
};

type CanonicalTeamRow = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  name: string;
  division?: string | null;
  divisionTypeId?: string | null;
  divisionTypeName?: string | null;
  wins?: number | null;
  losses?: number | null;
  teamSize: number;
  profileImageId?: string | null;
  sport?: string | null;
  organizationId?: string | null;
  createdBy?: string | null;
};

type EventTeamRow = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  eventId?: string | null;
  kind?: string | null;
  playerIds?: string[];
  playerRegistrationIds?: string[];
  division?: string | null;
  divisionTypeId?: string | null;
  divisionTypeName?: string | null;
  wins?: number | null;
  losses?: number | null;
  name: string;
  captainId?: string | null;
  managerId?: string | null;
  headCoachId?: string | null;
  coachIds?: string[];
  staffAssignmentIds?: string[];
  parentTeamId?: string | null;
  pending?: string[];
  teamSize: number;
  profileImageId?: string | null;
  sport?: string | null;
};

export const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const normalizeIdList = (value: unknown): string[] => (
  Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => normalizeId(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ))
);

const ACTIVE_TEAM_MEMBER_STATUSES = new Set(['ACTIVE']);
const INVITED_TEAM_MEMBER_STATUSES = new Set(['INVITED']);
const ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES = ['STARTED', 'ACTIVE'];

const getCanonicalTeamsDelegate = (client: PrismaLike) => client?.canonicalTeams ?? null;
export const getEventTeamsDelegate = (client: PrismaLike) => client?.teams ?? client?.volleyBallTeams ?? null;
const getTeamRegistrationsDelegate = (client: PrismaLike) => client?.teamRegistrations ?? null;
const getTeamStaffAssignmentsDelegate = (client: PrismaLike) => client?.teamStaffAssignments ?? null;
const getEventTeamStaffAssignmentsDelegate = (client: PrismaLike) => client?.eventTeamStaffAssignments ?? null;

const isActiveRegistration = (row: { status?: string | null }) => ACTIVE_TEAM_MEMBER_STATUSES.has(String(row.status ?? '').toUpperCase());
const isInvitedRegistration = (row: { status?: string | null }) => INVITED_TEAM_MEMBER_STATUSES.has(String(row.status ?? '').toUpperCase());

const buildCanonicalTeamRegistrationId = (teamId: string, userId: string) => `${teamId}__${userId}`;
const buildCanonicalTeamStaffAssignmentId = (teamId: string, role: string, userId: string) => `${teamId}__${role}__${userId}`;
const buildEventTeamStaffAssignmentId = (eventTeamId: string, role: string, userId: string) => `${eventTeamId}__${role}__${userId}`;

const uniqueStrings = (values: Array<string | null | undefined>): string[] => Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const hasOwn = (value: object, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

export const applyCanonicalTeamRegistrationMetadata = async (params: {
  client: PrismaLike;
  teamId: string;
  playerRegistrations?: TeamRegistrationMetadataInput[] | null;
  now?: Date;
}) => {
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(params.client);
  if (!teamRegistrationsDelegate?.updateMany || !Array.isArray(params.playerRegistrations)) {
    return;
  }

  const now = params.now ?? new Date();
  await Promise.all(params.playerRegistrations.map(async (registration) => {
    if (!registration || typeof registration !== 'object') {
      return;
    }

    const userId = normalizeId(registration.userId);
    if (!userId) {
      return;
    }

    const data: Record<string, unknown> = { updatedAt: now };
    if (hasOwn(registration, 'jerseyNumber')) {
      data.jerseyNumber = normalizeId(registration.jerseyNumber);
    }
    if (hasOwn(registration, 'position')) {
      data.position = normalizeId(registration.position);
    }
    if (Object.keys(data).length === 1) {
      return;
    }

    await teamRegistrationsDelegate.updateMany({
      where: {
        teamId: params.teamId,
        userId,
      },
      data,
    });
  }));
};

export const serializeCanonicalTeam = (params: {
  team: CanonicalTeamRow;
  playerRegistrations: CanonicalPlayerRegistration[];
  staffAssignments: CanonicalStaffAssignment[];
}) => {
  const activePlayerRegistrations = params.playerRegistrations.filter(isActiveRegistration);
  const invitedPlayerRegistrations = params.playerRegistrations.filter(isInvitedRegistration);
  const assistantCoachAssignments = params.staffAssignments.filter((row) => (
    isActiveRegistration(row) && String(row.role ?? '').toUpperCase() === 'ASSISTANT_COACH'
  ));
  const managerAssignment = params.staffAssignments.find((row) => (
    isActiveRegistration(row) && String(row.role ?? '').toUpperCase() === 'MANAGER'
  ));
  const headCoachAssignment = params.staffAssignments.find((row) => (
    isActiveRegistration(row) && String(row.role ?? '').toUpperCase() === 'HEAD_COACH'
  ));
  const managerUserId = normalizeId(managerAssignment?.userId);
  const captainRegistration = activePlayerRegistrations.find((row) => Boolean(row.isCaptain))
    ?? (managerUserId ? (activePlayerRegistrations.find((row) => row.userId === managerUserId) ?? null) : null);

  return withLegacyFields({
    ...params.team,
    playerIds: activePlayerRegistrations.map((row) => row.userId),
    pending: invitedPlayerRegistrations.map((row) => row.userId),
    captainId: normalizeId(captainRegistration?.userId) ?? '',
    managerId: normalizeId(managerAssignment?.userId) ?? '',
    headCoachId: normalizeId(headCoachAssignment?.userId),
    coachIds: assistantCoachAssignments.map((row) => row.userId),
    assistantCoachIds: assistantCoachAssignments.map((row) => row.userId),
    playerRegistrations: params.playerRegistrations.map((row) => withLegacyFields({
      ...row,
      jerseyNumber: normalizeId(row.jerseyNumber),
      position: normalizeId(row.position),
      isCaptain: Boolean(row.isCaptain),
    })),
    staffAssignments: params.staffAssignments.map((row) => withLegacyFields({
      ...row,
      role: String(row.role ?? '').toUpperCase(),
    })),
  });
};

const serializeLegacyEventTeam = (team: EventTeamRow) => withLegacyFields({
  ...team,
  kind: normalizeId(team.kind) ?? 'REGISTERED',
  playerIds: normalizeIdList(team.playerIds),
  playerRegistrationIds: normalizeIdList(team.playerRegistrationIds),
  captainId: normalizeId(team.captainId) ?? '',
  managerId: normalizeId(team.managerId) ?? '',
  headCoachId: normalizeId(team.headCoachId),
  coachIds: normalizeIdList(team.coachIds),
  assistantCoachIds: normalizeIdList(team.coachIds),
  staffAssignmentIds: normalizeIdList(team.staffAssignmentIds),
  parentTeamId: normalizeId(team.parentTeamId),
  pending: normalizeIdList(team.pending),
});

const buildFallbackCanonicalTeam = (team: EventTeamRow): ReturnType<typeof serializeCanonicalTeam> => {
  const playerRegistrations: CanonicalPlayerRegistration[] = [
    ...normalizeIdList(team.playerIds).map((userId) => ({
      id: buildCanonicalTeamRegistrationId(team.id, userId),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      teamId: team.id,
      userId,
      status: 'ACTIVE',
      jerseyNumber: null,
      position: null,
      isCaptain: userId === normalizeId(team.captainId),
      createdBy: normalizeId(team.managerId),
    })),
    ...normalizeIdList(team.pending).map((userId) => ({
      id: buildCanonicalTeamRegistrationId(team.id, userId),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      teamId: team.id,
      userId,
      status: 'INVITED',
      jerseyNumber: null,
      position: null,
      isCaptain: false,
      createdBy: normalizeId(team.managerId),
    })),
  ];
  const staffAssignments: CanonicalStaffAssignment[] = [
    ...(normalizeId(team.managerId) ? [{
      id: buildCanonicalTeamStaffAssignmentId(team.id, 'MANAGER', normalizeId(team.managerId)!),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      teamId: team.id,
      userId: normalizeId(team.managerId)!,
      role: 'MANAGER',
      status: 'ACTIVE',
      createdBy: normalizeId(team.managerId),
    }] : []),
    ...(normalizeId(team.headCoachId) ? [{
      id: buildCanonicalTeamStaffAssignmentId(team.id, 'HEAD_COACH', normalizeId(team.headCoachId)!),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      teamId: team.id,
      userId: normalizeId(team.headCoachId)!,
      role: 'HEAD_COACH',
      status: 'ACTIVE',
      createdBy: normalizeId(team.managerId),
    }] : []),
    ...normalizeIdList(team.coachIds).map((userId) => ({
      id: buildCanonicalTeamStaffAssignmentId(team.id, 'ASSISTANT_COACH', userId),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      teamId: team.id,
      userId,
      role: 'ASSISTANT_COACH',
      status: 'ACTIVE',
      createdBy: normalizeId(team.managerId),
    })),
  ];

  return serializeCanonicalTeam({
    team: {
      id: team.id,
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
      name: team.name,
      division: normalizeId(team.division),
      divisionTypeId: normalizeId(team.divisionTypeId),
      divisionTypeName: normalizeId(team.divisionTypeName),
      wins: team.wins ?? null,
      losses: team.losses ?? null,
      teamSize: team.teamSize,
      profileImageId: normalizeId(team.profileImageId),
      sport: normalizeId(team.sport),
      organizationId: null,
      createdBy: normalizeId(team.managerId),
    },
    playerRegistrations,
    staffAssignments,
  });
};

export const loadCanonicalTeamById = async (teamId: string, client: PrismaLike = prisma) => {
  const canonicalTeamsDelegate = getCanonicalTeamsDelegate(client);
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(client);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(client);

  if (!canonicalTeamsDelegate?.findUnique || !teamRegistrationsDelegate?.findMany || !teamStaffAssignmentsDelegate?.findMany) {
    const eventTeam = await getEventTeamsDelegate(client)?.findUnique?.({
      where: { id: teamId },
    });
    if (!eventTeam) {
      return null;
    }
    return buildFallbackCanonicalTeam(eventTeam as EventTeamRow);
  }

  const team = await canonicalTeamsDelegate.findUnique({
    where: { id: teamId },
  }) as CanonicalTeamRow | null;
  if (!team) {
    const eventTeam = await getEventTeamsDelegate(client)?.findUnique?.({
      where: { id: teamId },
    });
    if (!eventTeam) {
      return null;
    }
    return buildFallbackCanonicalTeam(eventTeam as EventTeamRow);
  }

  const [playerRegistrations, staffAssignments] = await Promise.all([
    teamRegistrationsDelegate.findMany({
      where: { teamId },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }),
    teamStaffAssignmentsDelegate.findMany({
      where: { teamId },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }),
  ]);

  return serializeCanonicalTeam({
    team,
    playerRegistrations: playerRegistrations as CanonicalPlayerRegistration[],
    staffAssignments: staffAssignments as CanonicalStaffAssignment[],
  });
};

export const listTeamsByIds = async (ids: string[], client: PrismaLike = prisma) => {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length) {
    return [];
  }
  const eventTeamsDelegate = getEventTeamsDelegate(client);
  if (eventTeamsDelegate?.findMany) {
    const rows = await eventTeamsDelegate.findMany({
      where: { id: { in: normalizedIds } },
      orderBy: { name: 'asc' },
    });
    return (rows as EventTeamRow[]).map(serializeLegacyEventTeam);
  }

  const teams = await Promise.all(normalizedIds.map((teamId) => loadCanonicalTeamById(teamId, client)));
  return teams.filter(Boolean);
};

export const listCanonicalTeamsForUser = async (params: {
  ids?: string[];
  playerId?: string | null;
  managerId?: string | null;
  limit?: number;
}, client: PrismaLike = prisma) => {
  if (params.ids?.length) {
    return listTeamsByIds(params.ids, client);
  }

  const canonicalTeamsDelegate = getCanonicalTeamsDelegate(client);
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(client);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(client);
  if (!canonicalTeamsDelegate?.findMany || !teamRegistrationsDelegate?.findMany || !teamStaffAssignmentsDelegate?.findMany) {
    const where: Record<string, unknown> = {};
    if (params.playerId && params.managerId) {
      where.OR = [
        { playerIds: { has: params.playerId } },
        { managerId: params.managerId },
      ];
    } else if (params.playerId) {
      where.playerIds = { has: params.playerId };
    } else if (params.managerId) {
      where.managerId = params.managerId;
    } else {
      where.parentTeamId = null;
      where.captainId = { not: '' };
    }
    const rows = await getEventTeamsDelegate(client)?.findMany?.({
      where,
      take: params.limit ?? 100,
      orderBy: { name: 'asc' },
    }) ?? [];
    return (rows as EventTeamRow[]).map(serializeLegacyEventTeam);
  }

  let teamIds: string[] = [];
  if (params.playerId) {
    const rows = await teamRegistrationsDelegate.findMany({
      where: {
        userId: params.playerId,
        status: 'ACTIVE',
      },
      select: { teamId: true },
    });
    teamIds = teamIds.concat(rows.map((row: { teamId: string }) => row.teamId));
  }
  if (params.managerId) {
    const rows = await teamStaffAssignmentsDelegate.findMany({
      where: {
        userId: params.managerId,
        role: 'MANAGER',
        status: 'ACTIVE',
      },
      select: { teamId: true },
    });
    teamIds = teamIds.concat(rows.map((row: { teamId: string }) => row.teamId));
  }
  if (!params.playerId && !params.managerId) {
    const rows = await canonicalTeamsDelegate.findMany({
      take: params.limit ?? 100,
      orderBy: { name: 'asc' },
    });
    return Promise.all((rows as CanonicalTeamRow[]).map((row) => loadCanonicalTeamById(row.id, client))).then((items) => items.filter(Boolean));
  }

  const uniqueTeamIds = Array.from(new Set(teamIds)).slice(0, params.limit ?? 100);
  const teams = await Promise.all(uniqueTeamIds.map((teamId) => loadCanonicalTeamById(teamId, client)));
  return teams.filter(Boolean);
};

type SyncCanonicalTeamRosterInput = {
  teamId: string;
  captainId?: string | null;
  playerIds: string[];
  pendingPlayerIds: string[];
  managerId?: string | null;
  headCoachId?: string | null;
  assistantCoachIds: string[];
  actingUserId?: string | null;
  now?: Date;
};

const syncUserTeamIds = async (params: {
  tx: PrismaLike;
  teamId: string;
  previousActiveUserIds: string[];
  nextActiveUserIds: string[];
  now: Date;
}) => {
  const nextUsers = new Set(params.nextActiveUserIds);
  const previousUsers = new Set(params.previousActiveUserIds);
  const addUserIds = params.nextActiveUserIds.filter((userId) => !previousUsers.has(userId));
  const removeUserIds = params.previousActiveUserIds.filter((userId) => !nextUsers.has(userId));
  const userIds = Array.from(new Set([...addUserIds, ...removeUserIds]));
  if (!userIds.length || !params.tx?.userData?.findMany || !params.tx?.userData?.update) {
    return;
  }

  const users = await params.tx.userData.findMany({
    where: { id: { in: userIds } },
    select: { id: true, teamIds: true },
  });
  const userMap = new Map<string, string[]>(users.map((row: { id: string; teamIds: string[] }) => [row.id, normalizeIdList(row.teamIds)]));

  await Promise.all(userIds.map(async (userId) => {
    const currentTeamIds = userMap.get(userId) ?? [];
    const shouldAdd = addUserIds.includes(userId);
    const nextTeamIds = shouldAdd
      ? uniqueStrings([...currentTeamIds, params.teamId])
      : currentTeamIds.filter((teamId) => teamId !== params.teamId);
    await params.tx.userData.update({
      where: { id: userId },
      data: {
        teamIds: nextTeamIds,
        updatedAt: params.now,
      },
    });
  }));
};

export const syncCanonicalTeamRoster = async (input: SyncCanonicalTeamRosterInput, tx: PrismaLike) => {
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(tx);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(tx);
  if (!teamRegistrationsDelegate?.findMany || !teamRegistrationsDelegate?.upsert || !teamRegistrationsDelegate?.updateMany) {
    return;
  }
  if (!teamStaffAssignmentsDelegate?.findMany || !teamStaffAssignmentsDelegate?.upsert || !teamStaffAssignmentsDelegate?.updateMany) {
    return;
  }

  const now = input.now ?? new Date();
  const captainId = normalizeId(input.captainId);
  const activePlayerIds = uniqueStrings([
    ...normalizeIdList(input.playerIds),
    ...(captainId ? [captainId] : []),
  ]);
  const pendingPlayerIds = normalizeIdList(input.pendingPlayerIds).filter((userId) => !activePlayerIds.includes(userId));
  const managerId = normalizeId(input.managerId);
  const headCoachId = normalizeId(input.headCoachId);
  const assistantCoachIds = normalizeIdList(input.assistantCoachIds).filter((userId) => userId !== headCoachId && userId !== managerId);
  const desiredPlayerUserIds = uniqueStrings([...activePlayerIds, ...pendingPlayerIds]);
  const desiredStaffKeys = new Map<string, { userId: string; role: 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' }>();
  if (managerId) {
    desiredStaffKeys.set(`MANAGER:${managerId}`, { userId: managerId, role: 'MANAGER' });
  }
  if (headCoachId) {
    desiredStaffKeys.set(`HEAD_COACH:${headCoachId}`, { userId: headCoachId, role: 'HEAD_COACH' });
  }
  assistantCoachIds.forEach((userId) => {
    desiredStaffKeys.set(`ASSISTANT_COACH:${userId}`, { userId, role: 'ASSISTANT_COACH' });
  });

  const [existingPlayerRegistrations, existingStaffAssignments] = await Promise.all([
    teamRegistrationsDelegate.findMany({
      where: { teamId: input.teamId },
    }) as Promise<CanonicalPlayerRegistration[]>,
    teamStaffAssignmentsDelegate.findMany({
      where: { teamId: input.teamId },
    }) as Promise<CanonicalStaffAssignment[]>,
  ]);

  await Promise.all(activePlayerIds.map((userId) => teamRegistrationsDelegate.upsert({
    where: {
      teamId_userId: {
        teamId: input.teamId,
        userId,
      },
    },
    create: {
      id: buildCanonicalTeamRegistrationId(input.teamId, userId),
      teamId: input.teamId,
      userId,
      status: 'ACTIVE',
      jerseyNumber: existingPlayerRegistrations.find((row) => row.userId === userId)?.jerseyNumber ?? null,
      position: existingPlayerRegistrations.find((row) => row.userId === userId)?.position ?? null,
      isCaptain: userId === captainId,
      createdBy: normalizeId(input.actingUserId),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: 'ACTIVE',
      isCaptain: userId === captainId,
      updatedAt: now,
    },
  })));

  await Promise.all(pendingPlayerIds.map((userId) => teamRegistrationsDelegate.upsert({
    where: {
      teamId_userId: {
        teamId: input.teamId,
        userId,
      },
    },
    create: {
      id: buildCanonicalTeamRegistrationId(input.teamId, userId),
      teamId: input.teamId,
      userId,
      status: 'INVITED',
      jerseyNumber: existingPlayerRegistrations.find((row) => row.userId === userId)?.jerseyNumber ?? null,
      position: existingPlayerRegistrations.find((row) => row.userId === userId)?.position ?? null,
      isCaptain: false,
      createdBy: normalizeId(input.actingUserId),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: 'INVITED',
      isCaptain: false,
      updatedAt: now,
    },
  })));

  const removedPlayerUserIds = existingPlayerRegistrations
    .map((row) => row.userId)
    .filter((userId) => !desiredPlayerUserIds.includes(userId));
  if (removedPlayerUserIds.length) {
    await teamRegistrationsDelegate.updateMany({
      where: {
        teamId: input.teamId,
        userId: { in: removedPlayerUserIds },
      },
      data: {
        status: 'REMOVED',
        isCaptain: false,
        updatedAt: now,
      },
    });
  }

  await Promise.all(Array.from(desiredStaffKeys.values()).map(({ userId, role }) => teamStaffAssignmentsDelegate.upsert({
    where: {
      teamId_userId_role: {
        teamId: input.teamId,
        userId,
        role,
      },
    },
    create: {
      id: buildCanonicalTeamStaffAssignmentId(input.teamId, role, userId),
      teamId: input.teamId,
      userId,
      role,
      status: 'ACTIVE',
      createdBy: normalizeId(input.actingUserId),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: 'ACTIVE',
      updatedAt: now,
    },
  })));

  const removedStaffAssignments = existingStaffAssignments.filter((row) => !desiredStaffKeys.has(`${String(row.role).toUpperCase()}:${row.userId}`));
  if (removedStaffAssignments.length) {
    await Promise.all(removedStaffAssignments.map((row) => teamStaffAssignmentsDelegate.updateMany({
      where: {
        teamId: input.teamId,
        userId: row.userId,
        role: String(row.role).toUpperCase(),
      },
      data: {
        status: 'REMOVED',
        updatedAt: now,
      },
    })));
  }

  const previousActiveUserIds = uniqueStrings([
    ...existingPlayerRegistrations.filter(isActiveRegistration).map((row) => row.userId),
    ...existingStaffAssignments.filter(isActiveRegistration).map((row) => row.userId),
  ]);
  const nextActiveUserIds = uniqueStrings([
    ...activePlayerIds,
    ...Array.from(desiredStaffKeys.values()).map((row) => row.userId),
  ]);

  await syncUserTeamIds({
    tx,
    teamId: input.teamId,
    previousActiveUserIds,
    nextActiveUserIds,
    now,
  });
};

export const canManageCanonicalTeam = async (params: {
  teamId: string;
  userId: string;
  isAdmin?: boolean;
}, client: PrismaLike = prisma): Promise<boolean> => {
  if (params.isAdmin) {
    return true;
  }
  const team = await loadCanonicalTeamById(params.teamId, client);
  if (!team) {
    return false;
  }
  const playerRegistrations = Array.isArray((team as any).playerRegistrations) ? (team as any).playerRegistrations : [];
  const staffAssignments = Array.isArray((team as any).staffAssignments) ? (team as any).staffAssignments : [];
  const isCaptain = playerRegistrations.some((row: any) => row.userId === params.userId && row.status === 'ACTIVE' && Boolean(row.isCaptain));
  const isManager = staffAssignments.some((row: any) => row.userId === params.userId && row.status === 'ACTIVE' && String(row.role ?? '').toUpperCase() === 'MANAGER');
  return isCaptain || isManager;
};

export const findRegisteredEventTeamForCanonical = async (params: {
  eventId: string;
  canonicalTeamId: string;
}, client: PrismaLike = prisma) => {
  const eventTeamsDelegate = getEventTeamsDelegate(client);
  const rows = await eventTeamsDelegate?.findMany?.({
    where: {
      eventId: params.eventId,
      parentTeamId: params.canonicalTeamId,
      kind: 'REGISTERED',
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as EventTeamRow[] | undefined;
  const candidates = (rows ?? []).filter((row) => normalizeId(row.parentTeamId) === params.canonicalTeamId);
  if (!candidates.length) {
    return null;
  }

  if (client?.eventRegistrations?.findMany) {
    const candidateIds = candidates.map((row) => row.id).filter(Boolean);
    if (candidateIds.length) {
      const activeRegistrations = await client.eventRegistrations.findMany({
        where: {
          eventId: params.eventId,
          registrantType: 'TEAM',
          status: { in: ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES },
          OR: [
            { registrantId: { in: candidateIds } },
            { eventTeamId: { in: candidateIds } },
          ],
        },
        select: {
          registrantId: true,
          eventTeamId: true,
        },
      }) as Array<{ registrantId?: string | null; eventTeamId?: string | null }>;
      const activeCandidateIds = new Set<string>(
        activeRegistrations.flatMap((row) => (
          [normalizeId(row.eventTeamId), normalizeId(row.registrantId)].filter((value): value is string => Boolean(value))
        )),
      );
      const activeCandidate = candidates.find((row) => activeCandidateIds.has(row.id));
      if (activeCandidate) {
        return activeCandidate;
      }
    }
  }

  return candidates[0] ?? null;
};

const updateEventTeamSnapshotReferences = async (params: {
  tx: PrismaLike;
  eventTeamId: string;
  now: Date;
}) => {
  if (!params.tx?.eventRegistrations?.findMany) {
    return;
  }
  const eventRegistrations = await params.tx.eventRegistrations.findMany({
    where: {
      eventTeamId: params.eventTeamId,
      registrantType: { not: 'TEAM' },
      status: { in: ['STARTED', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
    },
    select: { id: true },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
  const eventStaffAssignments = await getEventTeamStaffAssignmentsDelegate(params.tx)?.findMany?.({
    where: {
      eventTeamId: params.eventTeamId,
      status: 'ACTIVE',
    },
    select: { id: true },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) ?? [];

  await getEventTeamsDelegate(params.tx)?.update?.({
    where: { id: params.eventTeamId },
    data: {
      playerRegistrationIds: eventRegistrations.map((row: { id: string }) => row.id),
      staffAssignmentIds: eventStaffAssignments.map((row: { id: string }) => row.id),
      updatedAt: params.now,
    },
  });
};

export const claimOrCreateEventTeamSnapshot = async (params: {
  tx: PrismaLike;
  eventId: string;
  canonicalTeamId: string;
  createdBy: string;
  canonicalTeam?: Record<string, any> | null;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  occurrence?: { slotId: string; occurrenceDate: string } | null;
}) => {
  const canonicalTeam = params.canonicalTeam ?? await loadCanonicalTeamById(params.canonicalTeamId, params.tx);
  if (!canonicalTeam) {
    throw new Error('Canonical team not found.');
  }

  const playerRegistrations = Array.isArray((canonicalTeam as any).playerRegistrations) ? (canonicalTeam as any).playerRegistrations : [];
  const staffAssignments = Array.isArray((canonicalTeam as any).staffAssignments) ? (canonicalTeam as any).staffAssignments : [];
  const activePlayerRegistrations = playerRegistrations.filter((row: any) => row.status === 'ACTIVE');
  const activeStaffAssignments = staffAssignments.filter((row: any) => row.status === 'ACTIVE');
  const now = new Date();
  const eventTeamsDelegate = getEventTeamsDelegate(params.tx);
  if (!eventTeamsDelegate?.findMany) {
    throw new Error('Event team storage is unavailable.');
  }

  const placeholderRows = await eventTeamsDelegate.findMany({
    where: {
      eventId: params.eventId,
      kind: 'PLACEHOLDER',
      parentTeamId: null,
    },
  }) as EventTeamRow[];
  const matchingPlaceholder = placeholderRows
    .filter((row) => {
      const rowDivision = normalizeId(row.division);
      const rowDivisionTypeId = normalizeId(row.divisionTypeId);
      const targetDivisionId = normalizeId(params.divisionId);
      const targetDivisionTypeId = normalizeId(params.divisionTypeId);
      if (targetDivisionId && rowDivision && rowDivision === targetDivisionId) {
        return true;
      }
      if (targetDivisionTypeId && rowDivisionTypeId && rowDivisionTypeId === targetDivisionTypeId) {
        return true;
      }
      if (!targetDivisionId && !targetDivisionTypeId) {
        return true;
      }
      return false;
    })
    .sort((left: any, right: any) => {
      const seedDelta = Number(left.seed ?? Number.MAX_SAFE_INTEGER) - Number(right.seed ?? Number.MAX_SAFE_INTEGER);
      if (seedDelta !== 0) {
        return seedDelta;
      }
      const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }
      return String(left.id).localeCompare(String(right.id));
    })[0] ?? null;
  const existingRegisteredEventTeam = matchingPlaceholder
    ? null
    : await findRegisteredEventTeamForCanonical({
      eventId: params.eventId,
      canonicalTeamId: params.canonicalTeamId,
    }, params.tx);

  const eventTeamId = normalizeId(matchingPlaceholder?.id)
    ?? normalizeId(existingRegisteredEventTeam?.id)
    ?? (eventTeamsDelegate.create ? crypto.randomUUID() : params.canonicalTeamId);
  const teamData = {
    eventId: params.eventId,
    kind: 'REGISTERED',
    playerIds: activePlayerRegistrations.map((row: any) => row.userId),
    playerRegistrationIds: [],
    division: normalizeId(params.divisionId) ?? normalizeId((canonicalTeam as any).division) ?? null,
    divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((canonicalTeam as any).divisionTypeId) ?? null,
    divisionTypeName: normalizeId((canonicalTeam as any).divisionTypeName) ?? null,
    wins: (canonicalTeam as any).wins ?? null,
    losses: (canonicalTeam as any).losses ?? null,
    name: String((canonicalTeam as any).name ?? '').trim(),
    captainId: normalizeId((canonicalTeam as any).captainId) ?? '',
    managerId: normalizeId((canonicalTeam as any).managerId) ?? '',
    headCoachId: normalizeId((canonicalTeam as any).headCoachId),
    coachIds: normalizeIdList((canonicalTeam as any).coachIds),
    staffAssignmentIds: [],
    parentTeamId: params.canonicalTeamId,
    pending: [],
    teamSize: Number((canonicalTeam as any).teamSize ?? activePlayerRegistrations.length ?? 0),
    profileImageId: normalizeId((canonicalTeam as any).profileImageId),
    sport: normalizeId((canonicalTeam as any).sport),
    updatedAt: now,
  };

  const eventTeam = await ((matchingPlaceholder || existingRegisteredEventTeam)
    ? (() => {
      if (!eventTeamsDelegate.update) {
        throw new Error('Event team update storage is unavailable.');
      }
      return eventTeamsDelegate.update({
        where: { id: eventTeamId },
        data: teamData,
      });
    })()
    : (() => {
      if (!eventTeamsDelegate.create) {
        return {
          id: params.canonicalTeamId,
          ...teamData,
        };
      }
      return eventTeamsDelegate.create({
        data: {
          id: eventTeamId,
          createdAt: now,
          ...teamData,
        },
      });
    })());

  await upsertEventRegistration({
    eventId: params.eventId,
    registrantType: 'TEAM',
    registrantId: eventTeamId,
    parentId: params.canonicalTeamId,
    rosterRole: 'PARTICIPANT',
    status: 'ACTIVE',
    eventTeamId: eventTeamId,
    divisionId: normalizeId(params.divisionId) ?? normalizeId((eventTeam as any).division) ?? null,
    divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((eventTeam as any).divisionTypeId) ?? null,
    divisionTypeKey: normalizeId(params.divisionTypeKey),
    createdBy: params.createdBy,
    occurrence: params.occurrence,
  }, params.tx);

  if (params.tx?.eventRegistrations?.findMany && params.tx?.eventRegistrations?.updateMany) {
    const currentEventPlayerRows = await params.tx.eventRegistrations.findMany({
      where: {
        eventTeamId,
        registrantType: { not: 'TEAM' },
      },
      select: { id: true, registrantId: true },
    });

    const activeEventPlayerIds = activePlayerRegistrations.map((row: any) => row.userId);
    const cancelledRegistrantIds = currentEventPlayerRows
      .map((row: { registrantId: string }) => row.registrantId)
      .filter((registrantId: string) => !activeEventPlayerIds.includes(registrantId));
    if (cancelledRegistrantIds.length) {
      await params.tx.eventRegistrations.updateMany({
        where: {
          eventTeamId,
          registrantId: { in: cancelledRegistrantIds },
          registrantType: { not: 'TEAM' },
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });
    }
  }

  await Promise.all(activePlayerRegistrations.map((row: any) => upsertEventRegistration({
    eventId: params.eventId,
    registrantType: 'SELF',
    registrantId: row.userId,
    parentId: params.canonicalTeamId,
    rosterRole: 'PARTICIPANT',
    status: 'ACTIVE',
    eventTeamId,
    sourceTeamRegistrationId: row.id,
    divisionId: normalizeId(params.divisionId) ?? normalizeId((eventTeam as any).division) ?? null,
    divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((eventTeam as any).divisionTypeId) ?? null,
    divisionTypeKey: normalizeId(params.divisionTypeKey),
    jerseyNumber: normalizeId(row.jerseyNumber),
    position: normalizeId(row.position),
    isCaptain: Boolean(row.isCaptain),
    createdBy: params.createdBy,
    occurrence: params.occurrence,
  }, params.tx)));

  const eventTeamStaffAssignmentsDelegate = getEventTeamStaffAssignmentsDelegate(params.tx);
  if (eventTeamStaffAssignmentsDelegate?.findMany && eventTeamStaffAssignmentsDelegate?.upsert && eventTeamStaffAssignmentsDelegate?.updateMany) {
    const existingEventStaffAssignments = await eventTeamStaffAssignmentsDelegate.findMany({
      where: { eventTeamId },
    }) as Array<{ userId: string; role: string }>;
    const desiredStaffKeys = new Set(activeStaffAssignments.map((row: any) => `${String(row.role).toUpperCase()}:${row.userId}`));

    await Promise.all(activeStaffAssignments.map((row: any) => eventTeamStaffAssignmentsDelegate.upsert({
      where: {
        eventTeamId_userId_role: {
          eventTeamId,
          userId: row.userId,
          role: String(row.role).toUpperCase(),
        },
      },
      create: {
        id: buildEventTeamStaffAssignmentId(eventTeamId, String(row.role).toUpperCase(), row.userId),
        eventTeamId,
        userId: row.userId,
        role: String(row.role).toUpperCase(),
        status: 'ACTIVE',
        sourceStaffAssignmentId: row.id,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        status: 'ACTIVE',
        sourceStaffAssignmentId: row.id,
        updatedAt: now,
      },
    })));

    const staleStaffAssignments = existingEventStaffAssignments.filter((row) => !desiredStaffKeys.has(`${String(row.role).toUpperCase()}:${row.userId}`));
    if (staleStaffAssignments.length) {
      await Promise.all(staleStaffAssignments.map((row) => eventTeamStaffAssignmentsDelegate.updateMany({
        where: {
          eventTeamId,
          userId: row.userId,
          role: String(row.role).toUpperCase(),
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      })));
    }
  }

  await updateEventTeamSnapshotReferences({
    tx: params.tx,
    eventTeamId,
    now,
  });

  return eventTeam;
};
