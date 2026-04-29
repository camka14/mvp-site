import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';
import {
  getEventTeamsDelegate,
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';

type PrismaLike = PrismaClient | Prisma.TransactionClient | any;

type TeamInviteLike = {
  id: string;
  teamId?: string | null;
  userId?: string | null;
  createdBy?: string | null;
};

type TeamInviteEventSyncRow = {
  id: string;
  inviteId: string;
  canonicalTeamId: string;
  eventId: string;
  eventTeamId: string;
  userId: string;
  previousRegistrationSnapshot?: unknown;
  eventTeamHadUser?: boolean | null;
  eventTeamHadPendingUser?: boolean | null;
  sourceTeamRegistrationId?: string | null;
  status?: string | null;
};

const getTeamInviteEventSyncsDelegate = (client: PrismaLike) => client?.teamInviteEventSyncs ?? null;

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);

const registrationSnapshotSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  eventId: true,
  registrantId: true,
  parentId: true,
  registrantType: true,
  rosterRole: true,
  status: true,
  eventTeamId: true,
  sourceTeamRegistrationId: true,
  slotId: true,
  occurrenceDate: true,
  ageAtEvent: true,
  divisionId: true,
  divisionTypeId: true,
  divisionTypeKey: true,
  jerseyNumber: true,
  position: true,
  isCaptain: true,
  consentDocumentId: true,
  consentStatus: true,
  createdBy: true,
} as const;

const toDate = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
};

const toSnapshotRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const resolveSyncRegistrationId = (syncRow: TeamInviteEventSyncRow): string => {
  const snapshot = toSnapshotRecord(syncRow.previousRegistrationSnapshot);
  return normalizeId(snapshot?.id) ?? buildEventRegistrationId({
    eventId: syncRow.eventId,
    registrantType: 'SELF',
    registrantId: syncRow.userId,
  });
};

export const serializeEventRegistrationSnapshot = (row: unknown): Prisma.InputJsonValue | null => {
  if (!row) {
    return null;
  }
  return JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;
};

const refreshEventTeamRegistrationReferences = async (
  tx: PrismaLike,
  eventTeamId: string,
  now: Date,
) => {
  const eventTeamsDelegate = getEventTeamsDelegate(tx);
  if (!eventTeamsDelegate?.update || !tx?.eventRegistrations?.findMany) {
    return;
  }

  const rows = await tx.eventRegistrations.findMany({
    where: {
      eventTeamId,
      registrantType: { not: 'TEAM' },
      status: { in: ['STARTED', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
    },
    select: { id: true },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as Array<{ id: string }>;

  await eventTeamsDelegate.update({
    where: { id: eventTeamId },
    data: {
      playerRegistrationIds: rows.map((row) => row.id),
      updatedAt: now,
    },
  });
};

const restoreEventRegistrationSnapshot = async (
  tx: PrismaLike,
  syncRow: TeamInviteEventSyncRow,
  now: Date,
) => {
  const snapshot = toSnapshotRecord(syncRow.previousRegistrationSnapshot);
  if (!snapshot) {
    const registrationId = buildEventRegistrationId({
      eventId: syncRow.eventId,
      registrantType: 'SELF',
      registrantId: syncRow.userId,
    });
    await tx.eventRegistrations?.updateMany?.({
      where: { id: registrationId },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });
    return;
  }

  const registrationId = normalizeId(snapshot.id) ?? buildEventRegistrationId({
    eventId: syncRow.eventId,
    registrantType: 'SELF',
    registrantId: syncRow.userId,
  });
  const createData = {
    id: registrationId,
    createdAt: toDate(snapshot.createdAt, now),
    updatedAt: now,
    eventId: normalizeId(snapshot.eventId) ?? syncRow.eventId,
    registrantId: normalizeId(snapshot.registrantId) ?? syncRow.userId,
    parentId: normalizeId(snapshot.parentId),
    registrantType: normalizeId(snapshot.registrantType)?.toUpperCase() ?? 'SELF',
    rosterRole: normalizeId(snapshot.rosterRole)?.toUpperCase() ?? 'FREE_AGENT',
    status: normalizeId(snapshot.status)?.toUpperCase() ?? 'STARTED',
    eventTeamId: normalizeId(snapshot.eventTeamId),
    sourceTeamRegistrationId: normalizeId(snapshot.sourceTeamRegistrationId),
    slotId: normalizeId(snapshot.slotId),
    occurrenceDate: normalizeId(snapshot.occurrenceDate),
    ageAtEvent: typeof snapshot.ageAtEvent === 'number' ? snapshot.ageAtEvent : null,
    divisionId: normalizeId(snapshot.divisionId),
    divisionTypeId: normalizeId(snapshot.divisionTypeId),
    divisionTypeKey: normalizeId(snapshot.divisionTypeKey),
    jerseyNumber: normalizeId(snapshot.jerseyNumber),
    position: normalizeId(snapshot.position),
    isCaptain: Boolean(snapshot.isCaptain),
    consentDocumentId: normalizeId(snapshot.consentDocumentId),
    consentStatus: normalizeId(snapshot.consentStatus),
    createdBy: normalizeId(snapshot.createdBy) ?? syncRow.userId,
  };

  await tx.eventRegistrations?.upsert?.({
    where: { id: registrationId },
    create: createData,
    update: {
      parentId: createData.parentId,
      registrantType: createData.registrantType,
      rosterRole: createData.rosterRole,
      status: createData.status,
      eventTeamId: createData.eventTeamId,
      sourceTeamRegistrationId: createData.sourceTeamRegistrationId,
      slotId: createData.slotId,
      occurrenceDate: createData.occurrenceDate,
      ageAtEvent: createData.ageAtEvent,
      divisionId: createData.divisionId,
      divisionTypeId: createData.divisionTypeId,
      divisionTypeKey: createData.divisionTypeKey,
      jerseyNumber: createData.jerseyNumber,
      position: createData.position,
      isCaptain: createData.isCaptain,
      consentDocumentId: createData.consentDocumentId,
      consentStatus: createData.consentStatus,
      updatedAt: now,
    },
  });
};

export const loadEventRegistrationSnapshot = async (
  tx: PrismaLike,
  eventId: string,
  userId: string,
) => {
  const registrationId = buildEventRegistrationId({
    eventId,
    registrantType: 'SELF',
    registrantId: userId,
  });
  const row = await tx.eventRegistrations?.findUnique?.({
    where: { id: registrationId },
    select: registrationSnapshotSelect,
  });
  if (row) {
    return serializeEventRegistrationSnapshot(row);
  }

  const rows = await tx.eventRegistrations?.findMany?.({
    where: {
      eventId,
      registrantId: userId,
      registrantType: 'SELF',
      slotId: null,
      occurrenceDate: null,
      rosterRole: { in: ['FREE_AGENT', 'PARTICIPANT'] },
      status: { in: ['STARTED', 'ACTIVE', 'BLOCKED'] },
    },
    select: registrationSnapshotSelect,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
  const fallbackRow = Array.isArray(rows)
    ? rows.find((entry) => entry.rosterRole === 'FREE_AGENT') ?? rows[0] ?? null
    : null;
  return serializeEventRegistrationSnapshot(fallbackRow);
};

export const acceptTeamInviteEventSyncs = async (
  tx: PrismaLike,
  invite: TeamInviteLike,
  now: Date,
) => {
  const delegate = getTeamInviteEventSyncsDelegate(tx);
  if (!delegate?.findMany || !delegate?.updateMany || !invite.id) {
    return;
  }

  const rows = await delegate.findMany({
    where: {
      inviteId: invite.id,
      status: 'PENDING',
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as TeamInviteEventSyncRow[];
  if (!rows.length) {
    return;
  }

  const eventTeamsDelegate = getEventTeamsDelegate(tx);
  await Promise.all(rows.map(async (row) => {
    const eventTeam = await eventTeamsDelegate?.findUnique?.({
      where: { id: row.eventTeamId },
      select: {
        id: true,
        playerIds: true,
        pending: true,
      },
    });
    if (eventTeam && eventTeamsDelegate?.update) {
      const playerIds = normalizeIdList(eventTeam.playerIds);
      const pending = normalizeIdList(eventTeam.pending);
      await eventTeamsDelegate.update({
        where: { id: row.eventTeamId },
        data: {
          playerIds: row.eventTeamHadUser ? playerIds : uniqueStrings([...playerIds, row.userId]),
          pending: pending.filter((userId) => userId !== row.userId),
          updatedAt: now,
        },
      });
    }

    const registrationId = resolveSyncRegistrationId(row);
    await tx.eventRegistrations?.updateMany?.({
      where: { id: registrationId },
      data: {
        parentId: row.canonicalTeamId,
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        eventTeamId: row.eventTeamId,
        sourceTeamRegistrationId: normalizeId(row.sourceTeamRegistrationId),
        updatedAt: now,
      },
    });
    await refreshEventTeamRegistrationReferences(tx, row.eventTeamId, now);
  }));

  await delegate.updateMany({
    where: {
      inviteId: invite.id,
      status: 'PENDING',
    },
    data: {
      status: 'ACCEPTED',
      updatedAt: now,
    },
  });
};

export const rollbackTeamInviteEventSyncs = async (
  tx: PrismaLike,
  invite: TeamInviteLike,
  status: 'DECLINED' | 'CANCELLED',
  now: Date,
) => {
  const delegate = getTeamInviteEventSyncsDelegate(tx);
  if (!delegate?.findMany || !delegate?.updateMany || !invite.id) {
    return;
  }

  const rows = await delegate.findMany({
    where: {
      inviteId: invite.id,
      status: 'PENDING',
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  }) as TeamInviteEventSyncRow[];
  if (!rows.length) {
    return;
  }

  const eventTeamsDelegate = getEventTeamsDelegate(tx);
  await Promise.all(rows.map(async (row) => {
    const eventTeam = await eventTeamsDelegate?.findUnique?.({
      where: { id: row.eventTeamId },
      select: {
        id: true,
        playerIds: true,
        pending: true,
      },
    });
    if (eventTeam && eventTeamsDelegate?.update) {
      const playerIds = normalizeIdList(eventTeam.playerIds);
      const pending = normalizeIdList(eventTeam.pending);
      await eventTeamsDelegate.update({
        where: { id: row.eventTeamId },
        data: {
          playerIds: row.eventTeamHadUser ? playerIds : playerIds.filter((userId) => userId !== row.userId),
          pending: row.eventTeamHadPendingUser ? pending : pending.filter((userId) => userId !== row.userId),
          updatedAt: now,
        },
      });
    }

    await restoreEventRegistrationSnapshot(tx, row, now);
    await refreshEventTeamRegistrationReferences(tx, row.eventTeamId, now);
  }));

  await delegate.updateMany({
    where: {
      inviteId: invite.id,
      status: 'PENDING',
    },
    data: {
      status,
      updatedAt: now,
    },
  });
};

export const removeCanonicalPendingInvitee = async (
  tx: PrismaLike,
  invite: TeamInviteLike,
  actingUserId: string,
  now: Date,
) => {
  const teamId = normalizeId(invite.teamId);
  const userId = normalizeId(invite.userId);
  if (!teamId || !userId) {
    return;
  }

  const team = await loadCanonicalTeamById(teamId, tx);
  if (!team) {
    return;
  }

  const pending = normalizeIdList((team as any).pending);
  if (!pending.includes(userId)) {
    return;
  }

  await syncCanonicalTeamRoster({
    teamId,
    captainId: (team as any).captainId,
    playerIds: normalizeIdList((team as any).playerIds),
    pendingPlayerIds: pending.filter((pendingUserId) => pendingUserId !== userId),
    managerId: (team as any).managerId,
    headCoachId: (team as any).headCoachId,
    assistantCoachIds: normalizeIdList((team as any).coachIds),
    actingUserId,
    now,
  }, tx);
};
