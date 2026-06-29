import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { withLegacyFields } from '@/server/legacyFormat';
import { upsertEventRegistration, type RegistrationLifecycleStatus } from '@/server/events/eventRegistrations';
import {
  TEAM_JOIN_POLICY_CLOSED,
  resolveSerializedTeamJoinPolicy,
} from '@/server/teams/teamJoinPolicy';

type PrismaLike = PrismaClient | Prisma.TransactionClient | any;

export type CanonicalPlayerRegistration = {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  teamId: string;
  userId: string;
  parentId?: string | null;
  registrantType?: string | null;
  rosterRole?: string | null;
  status: string;
  jerseyNumber?: string | null;
  position?: string | null;
  isCaptain?: boolean | null;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  createdBy?: string | null;
};

export type TeamRegistrationMetadataInput = {
  userId?: unknown;
  registrantId?: unknown;
  parentId?: unknown;
  registrantType?: unknown;
  rosterRole?: unknown;
  jerseyNumber?: unknown;
  position?: unknown;
  consentDocumentId?: unknown;
  consentStatus?: unknown;
  createdBy?: unknown;
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
  wins?: number | null;
  losses?: number | null;
  teamSize: number;
  profileImageId?: string | null;
  sport?: string | null;
  organizationId?: string | null;
  createdBy?: string | null;
  parentTeamId?: string | null;
  openRegistration?: boolean | null;
  joinPolicy?: string | null;
  registrationPriceCents?: number | null;
  affiliateUrl?: string | null;
  requiredTemplateIds?: string[] | null;
  visibility?: string | null;
  archivedAt?: Date | string | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
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
  affiliateUrl?: string | null;
  archivedAt?: Date | string | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
};

type TeamRegistrationSettingsSource = {
  id?: string | null;
  openRegistration?: boolean | null;
  joinPolicy?: string | null;
  registrationPriceCents?: number | null;
  requiredTemplateIds?: string[] | null;
};

export const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const normalizeJerseyNumber = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const normalized = String(value).replace(/\D/g, '').slice(0, 3);
  return normalized.length ? normalized : null;
};

export const normalizeIdList = (value: unknown): string[] => (
  Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => normalizeId(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ))
);

const ACTIVE_TEAM_MEMBER_STATUSES = new Set(['ACTIVE', 'PENDING']);
const INVITED_TEAM_MEMBER_STATUSES = new Set(['INVITED']);
const ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES = ['STARTED', 'PENDING', 'ACTIVE'];
export const TEAM_VISIBILITY_PUBLIC = 'PUBLIC';
export const TEAM_VISIBILITY_ADMIN_ONLY = 'ADMIN_ONLY';
export type TeamVisibility = typeof TEAM_VISIBILITY_PUBLIC | typeof TEAM_VISIBILITY_ADMIN_ONLY;

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

const normalizeRegistrationPriceCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
};

const loadRegistrationSettingsByTeamId = async (
  client: PrismaLike,
  teamIds: Array<string | null | undefined>,
): Promise<Map<string, TeamRegistrationSettingsSource>> => {
  const canonicalTeamIds = normalizeIdList(teamIds);
  const canonicalTeamsDelegate = getCanonicalTeamsDelegate(client);
  if (!canonicalTeamIds.length || !canonicalTeamsDelegate?.findMany) {
    return new Map();
  }

  const rows = await canonicalTeamsDelegate.findMany({
    where: { id: { in: canonicalTeamIds } },
    select: {
      id: true,
      openRegistration: true,
      joinPolicy: true,
      registrationPriceCents: true,
      requiredTemplateIds: true,
    },
  }) as TeamRegistrationSettingsSource[];

  return new Map(
    rows
      .map((row) => {
        const teamId = normalizeId(row.id);
        return teamId ? [teamId, row] as const : null;
      })
      .filter((entry): entry is readonly [string, TeamRegistrationSettingsSource] => Boolean(entry)),
  );
};

const hasOwn = (value: object, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const eventTeamMatchesDivision = (
  row: Pick<EventTeamRow, 'division' | 'divisionTypeId'> | null | undefined,
  divisionId?: string | null,
  divisionTypeId?: string | null,
): boolean => {
  const targetDivisionId = normalizeId(divisionId);
  const targetDivisionTypeId = normalizeId(divisionTypeId);
  return Boolean(
    row
    && (
      (targetDivisionId && normalizeId(row.division) === targetDivisionId)
      || (!targetDivisionId && targetDivisionTypeId && normalizeId(row.divisionTypeId) === targetDivisionTypeId)
    ),
  );
};

const newestFirst = <T extends { updatedAt?: Date | string | null; createdAt?: Date | string | null; id?: string | null }>(rows: T[]): T[] => (
  [...rows].sort((left, right) => {
    const leftUpdatedAt = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightUpdatedAt = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    if (leftUpdatedAt !== rightUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }
    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  })
);

export const normalizeTeamVisibility = (value: unknown): TeamVisibility => (
  String(value ?? '').trim().toUpperCase() === TEAM_VISIBILITY_ADMIN_ONLY
    ? TEAM_VISIBILITY_ADMIN_ONLY
    : TEAM_VISIBILITY_PUBLIC
);

export const isAdminOnlyCanonicalTeam = (team: Record<string, unknown> | null | undefined): boolean => (
  normalizeTeamVisibility(team?.visibility) === TEAM_VISIBILITY_ADMIN_ONLY
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
      const registrantId = normalizeId(registration.registrantId);
      const targetUserId = userId ?? registrantId;
      if (!targetUserId) {
        return;
      }

      const data: Record<string, unknown> = { updatedAt: now };
      if (hasOwn(registration, 'parentId')) {
        data.parentId = normalizeId(registration.parentId);
      }
      if (hasOwn(registration, 'registrantType')) {
        data.registrantType = normalizeId(registration.registrantType)?.toUpperCase() ?? 'SELF';
      }
      if (hasOwn(registration, 'rosterRole')) {
        data.rosterRole = normalizeId(registration.rosterRole)?.toUpperCase() ?? 'PARTICIPANT';
      }
      if (hasOwn(registration, 'jerseyNumber')) {
        data.jerseyNumber = normalizeJerseyNumber(registration.jerseyNumber);
      }
      if (hasOwn(registration, 'position')) {
        data.position = normalizeId(registration.position);
      }
      if (hasOwn(registration, 'consentDocumentId')) {
        data.consentDocumentId = normalizeId(registration.consentDocumentId);
      }
      if (hasOwn(registration, 'consentStatus')) {
        data.consentStatus = normalizeId(registration.consentStatus);
      }
      if (hasOwn(registration, 'createdBy')) {
        data.createdBy = normalizeId(registration.createdBy);
      }
      if (Object.keys(data).length === 1) {
        return;
      }

      await teamRegistrationsDelegate.updateMany({
        where: {
          teamId: params.teamId,
          userId: targetUserId,
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
  const joinPolicy = resolveSerializedTeamJoinPolicy(params.team);
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
    visibility: normalizeTeamVisibility(params.team.visibility),
    joinPolicy,
    openRegistration: joinPolicy === 'OPEN_REGISTRATION',
    registrationPriceCents: Math.max(0, Math.round(params.team.registrationPriceCents ?? 0)),
    requiredTemplateIds: normalizeIdList(params.team.requiredTemplateIds),
    playerIds: activePlayerRegistrations.map((row) => row.userId),
    pending: invitedPlayerRegistrations.map((row) => row.userId),
    captainId: normalizeId(captainRegistration?.userId) ?? '',
    managerId: normalizeId(managerAssignment?.userId) ?? '',
    headCoachId: normalizeId(headCoachAssignment?.userId),
    coachIds: assistantCoachAssignments.map((row) => row.userId),
    assistantCoachIds: assistantCoachAssignments.map((row) => row.userId),
    playerRegistrations: params.playerRegistrations.map((row) => withLegacyFields({
      ...row,
      registrantId: normalizeId(row.userId) ?? '',
      parentId: normalizeId(row.parentId),
      registrantType: normalizeId(row.registrantType)?.toUpperCase() ?? 'SELF',
      rosterRole: normalizeId(row.rosterRole)?.toUpperCase() ?? 'PARTICIPANT',
      jerseyNumber: normalizeJerseyNumber(row.jerseyNumber),
      position: normalizeId(row.position),
      isCaptain: Boolean(row.isCaptain),
      consentDocumentId: normalizeId(row.consentDocumentId),
      consentStatus: normalizeId(row.consentStatus),
    })),
    staffAssignments: params.staffAssignments.map((row) => withLegacyFields({
      ...row,
      role: String(row.role ?? '').toUpperCase(),
    })),
  });
};

const serializeLegacyEventTeam = (
  team: EventTeamRow,
  registrationSettings?: TeamRegistrationSettingsSource | null,
) => withLegacyFields({
  ...team,
  joinPolicy: registrationSettings ? resolveSerializedTeamJoinPolicy(registrationSettings) : TEAM_JOIN_POLICY_CLOSED,
  openRegistration: registrationSettings
    ? resolveSerializedTeamJoinPolicy(registrationSettings) === 'OPEN_REGISTRATION'
    : false,
  registrationPriceCents: normalizeRegistrationPriceCents(registrationSettings?.registrationPriceCents),
  requiredTemplateIds: normalizeIdList(registrationSettings?.requiredTemplateIds),
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

const serializeLegacyEventTeamsWithRegistrationSettings = async (
  client: PrismaLike,
  rows: EventTeamRow[],
): Promise<Array<ReturnType<typeof serializeLegacyEventTeam>>> => {
  const settingsByTeamId = await loadRegistrationSettingsByTeamId(
    client,
    rows.map((row) => row.parentTeamId),
  );
  return rows.map((row) => serializeLegacyEventTeam(
    row,
    settingsByTeamId.get(normalizeId(row.parentTeamId) ?? ''),
  ));
};

const buildFallbackCanonicalTeam = (team: EventTeamRow): ReturnType<typeof serializeCanonicalTeam> => {
  const playerRegistrations: CanonicalPlayerRegistration[] = [
    ...normalizeIdList(team.playerIds).map((userId) => ({
      id: buildCanonicalTeamRegistrationId(team.id, userId),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
        teamId: team.id,
        userId,
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        jerseyNumber: null,
        position: null,
        isCaptain: userId === normalizeId(team.captainId),
        consentDocumentId: null,
        consentStatus: null,
        createdBy: normalizeId(team.managerId),
      })),
    ...normalizeIdList(team.pending).map((userId) => ({
      id: buildCanonicalTeamRegistrationId(team.id, userId),
      createdAt: team.createdAt ?? null,
      updatedAt: team.updatedAt ?? null,
        teamId: team.id,
        userId,
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'INVITED',
        jerseyNumber: null,
        position: null,
        isCaptain: false,
        consentDocumentId: null,
        consentStatus: null,
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
      wins: team.wins ?? null,
      losses: team.losses ?? null,
      teamSize: team.teamSize,
      profileImageId: normalizeId(team.profileImageId),
      sport: normalizeId(team.sport),
      organizationId: null,
      parentTeamId: normalizeId(team.parentTeamId),
      createdBy: normalizeId(team.managerId),
      openRegistration: false,
      joinPolicy: TEAM_JOIN_POLICY_CLOSED,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
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

export const listTeamsByIds = async (
  ids: string[],
  client: PrismaLike = prisma,
  options: { eventId?: string | null } = {},
) => {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length) {
    return [];
  }

  const eventId = normalizeId(options.eventId);
  const teamsById = new Map<string, ReturnType<typeof serializeCanonicalTeam> | ReturnType<typeof serializeLegacyEventTeam>>();
  const eventTeamsDelegate = getEventTeamsDelegate(client);
  if (eventId && eventTeamsDelegate?.findMany) {
    const rows = await eventTeamsDelegate.findMany({
      where: {
        id: { in: normalizedIds },
        eventId,
      },
    }) as EventTeamRow[];
    const serializedRows = await serializeLegacyEventTeamsWithRegistrationSettings(client, rows);
    rows.forEach((row, index) => {
      teamsById.set(row.id, serializedRows[index]);
    });
  }

  const canonicalTeamsDelegate = getCanonicalTeamsDelegate(client);
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(client);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(client);
  const canonicalCandidateIds = normalizedIds.filter((teamId) => !teamsById.has(teamId));

  if (canonicalCandidateIds.length && canonicalTeamsDelegate?.findMany && teamRegistrationsDelegate?.findMany && teamStaffAssignmentsDelegate?.findMany) {
    const canonicalRows = await canonicalTeamsDelegate.findMany({
      where: { id: { in: canonicalCandidateIds } },
    }) as CanonicalTeamRow[];
    const canonicalIds = canonicalRows.map((row) => row.id).filter(Boolean);

    if (canonicalIds.length) {
      const [playerRegistrations, staffAssignments] = await Promise.all([
        teamRegistrationsDelegate.findMany({
          where: { teamId: { in: canonicalIds } },
          orderBy: [
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        }) as Promise<CanonicalPlayerRegistration[]>,
        teamStaffAssignmentsDelegate.findMany({
          where: { teamId: { in: canonicalIds } },
          orderBy: [
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        }) as Promise<CanonicalStaffAssignment[]>,
      ]);

      const playerRegistrationsByTeamId = new Map<string, CanonicalPlayerRegistration[]>();
      playerRegistrations.forEach((row) => {
        const existingRows = playerRegistrationsByTeamId.get(row.teamId);
        if (existingRows) {
          existingRows.push(row);
          return;
        }
        playerRegistrationsByTeamId.set(row.teamId, [row]);
      });

      const staffAssignmentsByTeamId = new Map<string, CanonicalStaffAssignment[]>();
      staffAssignments.forEach((row) => {
        const existingRows = staffAssignmentsByTeamId.get(row.teamId);
        if (existingRows) {
          existingRows.push(row);
          return;
        }
        staffAssignmentsByTeamId.set(row.teamId, [row]);
      });

      canonicalRows.forEach((row) => {
        teamsById.set(row.id, serializeCanonicalTeam({
          team: row,
          playerRegistrations: playerRegistrationsByTeamId.get(row.id) ?? [],
          staffAssignments: staffAssignmentsByTeamId.get(row.id) ?? [],
        }));
      });
    }
  }

  const remainingIds = normalizedIds.filter((teamId) => !teamsById.has(teamId));
  if (remainingIds.length && !eventId) {
    if (eventTeamsDelegate?.findMany) {
      const rows = await eventTeamsDelegate.findMany({
        where: { id: { in: remainingIds } },
      }) as EventTeamRow[];
      const serializedRows = await serializeLegacyEventTeamsWithRegistrationSettings(client, rows);
      rows.forEach((row, index) => {
        teamsById.set(row.id, serializedRows[index]);
      });
    }
  }

  return normalizedIds
    .map((teamId) => teamsById.get(teamId))
    .filter((team): team is ReturnType<typeof serializeCanonicalTeam> | ReturnType<typeof serializeLegacyEventTeam> => Boolean(team));
};

export const listCanonicalTeamsForUser = async (params: {
  ids?: string[];
  eventId?: string | null;
  organizationId?: string | null;
  playerId?: string | null;
  managerId?: string | null;
  query?: string | null;
  openRegistrationOnly?: boolean;
  includeAdminOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
}, client: PrismaLike = prisma) => {
  if (params.ids?.length) {
    const teams = await listTeamsByIds(params.ids, client, { eventId: params.eventId });
    return teams.filter((team) => (
      (params.includeArchived || !(team as Record<string, unknown>).archivedAt)
      && (params.includeAdminOnly || !isAdminOnlyCanonicalTeam(team as Record<string, unknown>))
    ));
  }

  const canonicalTeamsDelegate = getCanonicalTeamsDelegate(client);
  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(client);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(client);
  const normalizedQuery = normalizeId(params.query)?.toLowerCase() ?? null;
  const teamMatchesQuery = (team: Record<string, unknown>) => {
    if (!normalizedQuery) {
      return true;
    }
    return ['name', 'sport', 'division'].some((field) => (
      String(team[field] ?? '').toLowerCase().includes(normalizedQuery)
    ));
  };
  if (!canonicalTeamsDelegate?.findMany || !teamRegistrationsDelegate?.findMany || !teamStaffAssignmentsDelegate?.findMany) {
    if (params.organizationId) {
      return [];
    }
    const andFilters: Record<string, unknown>[] = [];
    if (params.playerId && params.managerId) {
      andFilters.push({ OR: [
        { playerIds: { has: params.playerId } },
        { managerId: params.managerId },
      ] });
    } else if (params.playerId) {
      andFilters.push({ playerIds: { has: params.playerId } });
    } else if (params.managerId) {
      andFilters.push({ managerId: params.managerId });
    } else {
      andFilters.push({
        parentTeamId: null,
        captainId: { not: '' },
      });
    }
    if (params.openRegistrationOnly) {
      andFilters.push({ openRegistration: true });
    }
    if (!params.includeArchived) {
      andFilters.push({ archivedAt: null });
    }
    if (normalizedQuery) {
      andFilters.push({ OR: [
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { sport: { contains: normalizedQuery, mode: 'insensitive' } },
        { division: { contains: normalizedQuery, mode: 'insensitive' } },
      ] });
    }
    const rows = await getEventTeamsDelegate(client)?.findMany?.({
      where: andFilters.length ? { AND: andFilters } : undefined,
      take: params.limit ?? 100,
      orderBy: { name: 'asc' },
    }) ?? [];
    return (rows as EventTeamRow[]).map((row) => serializeLegacyEventTeam(row));
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
    const where: Record<string, unknown> = params.includeAdminOnly
      ? {}
      : { visibility: TEAM_VISIBILITY_PUBLIC };
    if (!params.includeArchived) {
      where.archivedAt = null;
    }
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }
    if (params.openRegistrationOnly) {
      where.openRegistration = true;
    }
    if (normalizedQuery) {
      where.OR = [
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { sport: { contains: normalizedQuery, mode: 'insensitive' } },
        { division: { contains: normalizedQuery, mode: 'insensitive' } },
      ];
    }
    const rows = await canonicalTeamsDelegate.findMany({
      where: Object.keys(where).length ? where : undefined,
      take: params.limit ?? 100,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }],
    });
    return Promise.all((rows as CanonicalTeamRow[]).map((row) => loadCanonicalTeamById(row.id, client))).then((items) => items.filter(Boolean));
  }

  const uniqueTeamIds = Array.from(new Set(teamIds));
  const teams = await Promise.all(uniqueTeamIds.map((teamId) => loadCanonicalTeamById(teamId, client)));
  return teams
    .filter((team): team is NonNullable<typeof team> => (
      Boolean(team)
      && (!params.organizationId || normalizeId((team as Record<string, unknown>).organizationId as string | null | undefined) === params.organizationId)
      && (!params.openRegistrationOnly || (team as Record<string, unknown>).openRegistration === true)
      && (params.includeArchived || !(team as Record<string, unknown>).archivedAt)
      && teamMatchesQuery(team as Record<string, unknown>)
      && (params.includeAdminOnly || !isAdminOnlyCanonicalTeam(team as Record<string, unknown>))
    ))
    .slice(0, params.limit ?? 100);
};

export const getCanonicalTeamIdsByUserIds = async (
  userIds: string[],
  client: PrismaLike = prisma,
): Promise<Map<string, string[]>> => {
  const normalizedUserIds = normalizeIdList(userIds);
  const teamIdsByUserId = new Map<string, string[]>(
    normalizedUserIds.map((userId) => [userId, []]),
  );

  if (!normalizedUserIds.length) {
    return teamIdsByUserId;
  }

  const teamRegistrationsDelegate = getTeamRegistrationsDelegate(client);
  const teamStaffAssignmentsDelegate = getTeamStaffAssignmentsDelegate(client);
  if (!teamRegistrationsDelegate?.findMany || !teamStaffAssignmentsDelegate?.findMany) {
    if (client?.userData?.findMany) {
      const userRows = await client.userData.findMany({
        where: { id: { in: normalizedUserIds } },
        select: {
          id: true,
          teamIds: true,
        },
      }) as Array<{ id: string; teamIds?: string[] | null }>;

      userRows.forEach((row) => {
        teamIdsByUserId.set(row.id, normalizeIdList(row.teamIds));
      });
    } else if (client?.userData?.findUnique) {
      const userRows = await Promise.all(normalizedUserIds.map(async (userId) => {
        const row = await client.userData.findUnique({
          where: { id: userId },
          select: {
            id: true,
            teamIds: true,
          },
        }) as { id: string; teamIds?: string[] | null } | null;
        return row;
      }));

      userRows.forEach((row) => {
        if (!row) {
          return;
        }
        teamIdsByUserId.set(row.id, normalizeIdList(row.teamIds));
      });
    }
    return teamIdsByUserId;
  }

  const [playerRegistrations, staffAssignments] = await Promise.all([
    teamRegistrationsDelegate.findMany({
      where: {
        userId: { in: normalizedUserIds },
        status: 'ACTIVE',
      },
      select: {
        userId: true,
        teamId: true,
      },
    }) as Promise<Array<{ userId: string; teamId: string }>>,
    teamStaffAssignmentsDelegate.findMany({
      where: {
        userId: { in: normalizedUserIds },
        status: 'ACTIVE',
      },
      select: {
        userId: true,
        teamId: true,
      },
    }) as Promise<Array<{ userId: string; teamId: string }>>,
  ]);

  [...playerRegistrations, ...staffAssignments].forEach((row) => {
    const userId = normalizeId(row.userId);
    const teamId = normalizeId(row.teamId);
    if (!userId || !teamId || !teamIdsByUserId.has(userId)) {
      return;
    }
    const currentTeamIds = teamIdsByUserId.get(userId) ?? [];
    if (!currentTeamIds.includes(teamId)) {
      currentTeamIds.push(teamId);
      teamIdsByUserId.set(userId, currentTeamIds);
    }
  });

  return teamIdsByUserId;
};

export const withDerivedCanonicalTeamIds = async <T extends { id: string; teamIds?: unknown }>(
  users: T[],
  client: PrismaLike = prisma,
): Promise<Array<Omit<T, 'teamIds'> & { teamIds: string[] }>> => {
  const teamIdsByUserId = await getCanonicalTeamIdsByUserIds(
    users.map((user) => user.id),
    client,
  );

  return users.map((user) => ({
    ...user,
    teamIds: teamIdsByUserId.get(user.id) ?? [],
  }));
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
  targetDivisionId?: string | null;
  targetDivisionTypeId?: string | null;
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
  const pickCandidate = (items: EventTeamRow[]) => {
    const sorted = newestFirst(items);
    return sorted.find((row) => !eventTeamMatchesDivision(row, params.targetDivisionId, params.targetDivisionTypeId))
      ?? sorted[0]
      ?? null;
  };

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
      const activeCandidate = pickCandidate(candidates.filter((row) => activeCandidateIds.has(row.id)));
      if (activeCandidate) {
        return activeCandidate;
      }
    }
  }

  return pickCandidate(candidates);
};

const findRegisteredEventTeamByIdForEvent = async (params: {
  eventId: string;
  eventTeamId: string;
}, client: PrismaLike = prisma) => {
  const eventTeamsDelegate = getEventTeamsDelegate(client);
  const rows = await eventTeamsDelegate?.findMany?.({
    where: {
      id: params.eventTeamId,
      eventId: params.eventId,
      kind: 'REGISTERED',
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as EventTeamRow[] | undefined;
  const candidate = (rows ?? []).find((row) => (
    normalizeId(row.id) === params.eventTeamId
    && normalizeId(row.eventId) === params.eventId
  ));
  if (!candidate) {
    return null;
  }

  if (client?.eventRegistrations?.findMany) {
    const activeRegistrations = await client.eventRegistrations.findMany({
      where: {
        eventId: params.eventId,
        registrantType: 'TEAM',
        status: { in: ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES },
        OR: [
          { registrantId: params.eventTeamId },
          { eventTeamId: params.eventTeamId },
        ],
      },
      select: {
        registrantId: true,
        eventTeamId: true,
      },
    }) as Array<{ registrantId?: string | null; eventTeamId?: string | null }>;
    if (activeRegistrations.length) {
      return candidate;
    }
  }

  return candidate;
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
      status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
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

const normalizeNonNegativeInt = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numeric));
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
  placeholderDivisionIds?: string[] | null;
  occurrence?: { slotId: string; occurrenceDate: string } | null;
  registrationStatus?: RegistrationLifecycleStatus;
  upsertRegistration?: boolean;
}) => {
  const canonicalTeam = params.canonicalTeam ?? await loadCanonicalTeamById(params.canonicalTeamId, params.tx);
  if (!canonicalTeam) {
    throw new Error('Canonical team not found.');
  }

  const playerRegistrations = Array.isArray((canonicalTeam as any).playerRegistrations) ? (canonicalTeam as any).playerRegistrations : [];
  const staffAssignments = Array.isArray((canonicalTeam as any).staffAssignments) ? (canonicalTeam as any).staffAssignments : [];
  const activePlayerRegistrations = playerRegistrations.filter((row: any) => ACTIVE_TEAM_MEMBER_STATUSES.has(String(row.status ?? '').toUpperCase()));
  const activeStaffAssignments = staffAssignments.filter((row: any) => row.status === 'ACTIVE');
  const now = new Date();
  const eventTeamsDelegate = getEventTeamsDelegate(params.tx);
  if (!eventTeamsDelegate?.findMany) {
    throw new Error('Event team storage is unavailable.');
  }

  const targetDivisionId = normalizeId(params.divisionId);
  const targetDivisionTypeId = normalizeId(params.divisionTypeId);
  const canonicalTeamIdentityId = normalizeId((canonicalTeam as any).parentTeamId) ?? params.canonicalTeamId;
  const existingRegisteredEventTeam = await findRegisteredEventTeamByIdForEvent({
    eventId: params.eventId,
    eventTeamId: params.canonicalTeamId,
  }, params.tx) ?? await findRegisteredEventTeamForCanonical({
    eventId: params.eventId,
    canonicalTeamId: canonicalTeamIdentityId,
    targetDivisionId,
    targetDivisionTypeId,
  }, params.tx);
  const registeredSiblingEventTeams = canonicalTeamIdentityId
    ? newestFirst(((await eventTeamsDelegate.findMany({
      where: {
        eventId: params.eventId,
        parentTeamId: canonicalTeamIdentityId,
        kind: 'REGISTERED',
      },
    }) as EventTeamRow[]) ?? [])
      .filter((row) => normalizeId(row.parentTeamId) === canonicalTeamIdentityId))
    : [];
  const placeholderDivisionIdSet = new Set(
    normalizeIdList(params.placeholderDivisionIds)
      .map((divisionId) => divisionId.toLowerCase()),
  );
  const existingDivisionId = normalizeId(existingRegisteredEventTeam?.division);
  const existingDivisionTypeId = normalizeId(existingRegisteredEventTeam?.divisionTypeId);
  const targetMatchesExistingDivision = Boolean(
    existingRegisteredEventTeam
    && (
      (targetDivisionId && existingDivisionId === targetDivisionId)
      || (!targetDivisionId && targetDivisionTypeId && existingDivisionTypeId === targetDivisionTypeId)
    ),
  );
  const shouldInspectPlaceholders = !existingRegisteredEventTeam
    || (
      !targetMatchesExistingDivision
      && Boolean(targetDivisionId || targetDivisionTypeId || placeholderDivisionIdSet.size > 0)
    );
  const placeholderRows = shouldInspectPlaceholders
    ? await eventTeamsDelegate.findMany({
      where: {
        eventId: params.eventId,
        kind: 'PLACEHOLDER',
        parentTeamId: null,
      },
    }) as EventTeamRow[]
    : [];
  const matchingPlaceholder = placeholderRows
    .filter((row) => {
      const rowDivision = normalizeId(row.division);
      const rowDivisionTypeId = normalizeId(row.divisionTypeId);
      if (rowDivision && placeholderDivisionIdSet.has(rowDivision.toLowerCase())) {
        return true;
      }
      if (targetDivisionId && rowDivision && rowDivision === targetDivisionId) {
        return true;
      }
      if (targetDivisionTypeId && rowDivisionTypeId && rowDivisionTypeId === targetDivisionTypeId) {
        return true;
      }
      if (!existingRegisteredEventTeam && !targetDivisionId && !targetDivisionTypeId && placeholderDivisionIdSet.size === 0) {
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
  const matchingSwapTarget = matchingPlaceholder;
  const sourcePlaceholderEventTeamId = existingRegisteredEventTeam && matchingSwapTarget
    ? normalizeId(existingRegisteredEventTeam.id)
    : null;
  const eventTeamId = normalizeId(matchingSwapTarget?.id)
    ?? normalizeId(existingRegisteredEventTeam?.id)
    ?? (eventTeamsDelegate.create ? crypto.randomUUID() : params.canonicalTeamId);
  const duplicateRegisteredEventTeams = registeredSiblingEventTeams.filter((row) => {
    const duplicateId = normalizeId(row.id);
    return Boolean(
      duplicateId
      && duplicateId !== eventTeamId
      && duplicateId !== sourcePlaceholderEventTeamId
    );
  });
  const matchingPlaceholderDivisionId = normalizeId(matchingSwapTarget?.division);
  const shouldPreservePlaceholderDivision = Boolean(
    matchingPlaceholderDivisionId
    && placeholderDivisionIdSet.has(matchingPlaceholderDivisionId.toLowerCase()),
  );
  const parentTeamId = normalizeId(existingRegisteredEventTeam?.parentTeamId)
    ?? canonicalTeamIdentityId
    ?? params.canonicalTeamId;
  const teamData = {
    eventId: params.eventId,
    kind: 'REGISTERED',
    playerIds: activePlayerRegistrations.map((row: any) => row.userId),
    playerRegistrationIds: [],
    division: (shouldPreservePlaceholderDivision ? matchingPlaceholderDivisionId : null)
      ?? normalizeId(params.divisionId)
      ?? normalizeId((canonicalTeam as any).division)
      ?? null,
    divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((canonicalTeam as any).divisionTypeId) ?? null,
    wins: (canonicalTeam as any).wins ?? null,
    losses: (canonicalTeam as any).losses ?? null,
    name: String((canonicalTeam as any).name ?? '').trim(),
    captainId: normalizeId((canonicalTeam as any).captainId) ?? '',
    managerId: normalizeId((canonicalTeam as any).managerId) ?? '',
    headCoachId: normalizeId((canonicalTeam as any).headCoachId),
    coachIds: normalizeIdList((canonicalTeam as any).coachIds),
    staffAssignmentIds: [],
    parentTeamId,
    pending: [],
    teamSize: Number((canonicalTeam as any).teamSize ?? activePlayerRegistrations.length ?? 0),
    profileImageId: normalizeId((canonicalTeam as any).profileImageId),
    sport: normalizeId((canonicalTeam as any).sport),
    updatedAt: now,
  };

  const sourcePlaceholderDivisionId = sourcePlaceholderEventTeamId
    ? (existingDivisionId ?? normalizeId((canonicalTeam as any).division) ?? null)
    : null;
  const sourcePlaceholderDivisionTypeId = sourcePlaceholderEventTeamId
    ? (existingDivisionTypeId ?? normalizeId((canonicalTeam as any).divisionTypeId) ?? null)
    : null;
  const sourcePlaceholderData = sourcePlaceholderEventTeamId
    ? {
      eventId: params.eventId,
      kind: 'PLACEHOLDER',
      playerIds: [],
      playerRegistrationIds: [],
      division: sourcePlaceholderDivisionId,
      divisionTypeId: sourcePlaceholderDivisionTypeId,
      wins: 0,
      losses: 0,
      name: String(matchingSwapTarget?.kind === 'PLACEHOLDER' ? matchingSwapTarget?.name : '').trim() || 'Place Holder',
      captainId: '',
      managerId: '',
      headCoachId: null,
      coachIds: [],
      staffAssignmentIds: [],
      parentTeamId: null,
      pending: [],
      teamSize: normalizeNonNegativeInt(
        existingRegisteredEventTeam?.teamSize
        ?? (canonicalTeam as any).teamSize
        ?? activePlayerRegistrations.length,
      ),
      profileImageId: null,
      sport: null,
      updatedAt: now,
    }
    : null;

  const eventTeam = await ((matchingPlaceholder || existingRegisteredEventTeam)
    ? (async () => {
      if (!eventTeamsDelegate.update) {
        throw new Error('Event team update storage is unavailable.');
      }
      const updatedEventTeam = await eventTeamsDelegate.update({
        where: { id: eventTeamId },
        data: teamData,
      });
      if (sourcePlaceholderEventTeamId && sourcePlaceholderData) {
        await eventTeamsDelegate.update({
          where: { id: sourcePlaceholderEventTeamId },
          data: sourcePlaceholderData,
        });
      }
      if (duplicateRegisteredEventTeams.length) {
        await Promise.all(duplicateRegisteredEventTeams.map((row) => eventTeamsDelegate.update({
          where: { id: row.id },
          data: {
            eventId: params.eventId,
            kind: 'PLACEHOLDER',
            playerIds: [],
            playerRegistrationIds: [],
            division: normalizeId(row.division),
            divisionTypeId: normalizeId(row.divisionTypeId),
            wins: 0,
            losses: 0,
            name: 'Place Holder',
            captainId: '',
            managerId: '',
            headCoachId: null,
            coachIds: [],
            staffAssignmentIds: [],
            parentTeamId: null,
            pending: [],
            teamSize: normalizeNonNegativeInt(row.teamSize),
            profileImageId: null,
            sport: null,
            updatedAt: now,
          },
        })));
      }
      return updatedEventTeam;
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

  if (params.upsertRegistration !== false) {
    await upsertEventRegistration({
      eventId: params.eventId,
      registrantType: 'TEAM',
      registrantId: eventTeamId,
      parentId: parentTeamId,
      rosterRole: 'PARTICIPANT',
      status: params.registrationStatus ?? 'ACTIVE',
      eventTeamId: eventTeamId,
      divisionId: normalizeId(params.divisionId) ?? normalizeId((eventTeam as any).division) ?? null,
      divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((eventTeam as any).divisionTypeId) ?? null,
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      createdBy: params.createdBy,
      occurrence: params.occurrence,
      }, params.tx);
  }

  if (params.upsertRegistration !== false && sourcePlaceholderEventTeamId) {
    await upsertEventRegistration({
      eventId: params.eventId,
      registrantType: 'TEAM',
      registrantId: sourcePlaceholderEventTeamId,
      parentId: null,
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      eventTeamId: sourcePlaceholderEventTeamId,
      divisionId: sourcePlaceholderDivisionId,
      divisionTypeId: sourcePlaceholderDivisionTypeId,
      divisionTypeKey: null,
      createdBy: params.createdBy,
      occurrence: params.occurrence,
    }, params.tx);
  }

  if (params.upsertRegistration !== false && duplicateRegisteredEventTeams.length && params.tx?.eventRegistrations?.updateMany) {
    const duplicateEventTeamIds = duplicateRegisteredEventTeams
      .map((row) => normalizeId(row.id))
      .filter((teamId): teamId is string => Boolean(teamId));
    if (duplicateEventTeamIds.length) {
      await params.tx.eventRegistrations.updateMany({
        where: {
          eventId: params.eventId,
          registrantType: 'TEAM',
          status: { in: ACTIVE_EVENT_TEAM_REGISTRATION_STATUSES },
          OR: [
            { registrantId: { in: duplicateEventTeamIds } },
            { eventTeamId: { in: duplicateEventTeamIds } },
          ],
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });
    }
  }

  if (params.upsertRegistration !== false && params.tx?.eventRegistrations?.findMany && params.tx?.eventRegistrations?.updateMany) {
    const playerEventTeamIds = Array.from(new Set(
      [eventTeamId, sourcePlaceholderEventTeamId]
        .map((teamId) => normalizeId(teamId))
        .filter((teamId): teamId is string => Boolean(teamId)),
    ));
    const currentEventPlayerRows = await params.tx.eventRegistrations.findMany({
      where: {
        eventTeamId: playerEventTeamIds.length > 1 ? { in: playerEventTeamIds } : eventTeamId,
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
          eventTeamId: playerEventTeamIds.length > 1 ? { in: playerEventTeamIds } : eventTeamId,
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

  if (params.upsertRegistration !== false) {
    await Promise.all(activePlayerRegistrations.map((row: any) => upsertEventRegistration({
      eventId: params.eventId,
      registrantType: 'SELF',
      registrantId: row.userId,
      parentId: parentTeamId,
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      eventTeamId,
      sourceTeamRegistrationId: row.id,
      divisionId: normalizeId(params.divisionId) ?? normalizeId((eventTeam as any).division) ?? null,
      divisionTypeId: normalizeId(params.divisionTypeId) ?? normalizeId((eventTeam as any).divisionTypeId) ?? null,
      divisionTypeKey: normalizeId(params.divisionTypeKey),
      jerseyNumber: normalizeJerseyNumber(row.jerseyNumber),
      position: normalizeId(row.position),
      isCaptain: Boolean(row.isCaptain),
      createdBy: params.createdBy,
      occurrence: params.occurrence,
    }, params.tx)));
  }

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

    if (sourcePlaceholderEventTeamId) {
      await eventTeamStaffAssignmentsDelegate.updateMany({
        where: {
          eventTeamId: sourcePlaceholderEventTeamId,
          status: 'ACTIVE',
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });
    }
  }

  await updateEventTeamSnapshotReferences({
    tx: params.tx,
    eventTeamId,
    now,
  });
  if (sourcePlaceholderEventTeamId) {
    await updateEventTeamSnapshotReferences({
      tx: params.tx,
      eventTeamId: sourcePlaceholderEventTeamId,
      now,
    });
  }

  return eventTeam;
};
