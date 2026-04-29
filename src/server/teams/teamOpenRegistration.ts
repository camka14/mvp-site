import { prisma } from '@/lib/prisma';
import { resolveConnectedAccountId } from '@/lib/stripeConnectAccounts';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import {
  loadCanonicalTeamById,
  normalizeId,
} from '@/server/teams/teamMembership';

type PrismaLike = any;

export const TEAM_REGISTRATION_STARTED_TTL_MS = 5 * 60 * 1000;

const ACTIVE_CAPACITY_STATUSES = ['ACTIVE', 'INVITED', 'STARTED'] as const;
const ACTIVE_MEMBER_STATUS = 'ACTIVE';
const STARTED_MEMBER_STATUS = 'STARTED';
const LEFT_MEMBER_STATUS = 'LEFT';

type LockedTeamRow = {
  id: string;
  teamSize: number | null;
  openRegistration: boolean | null;
  registrationPriceCents: number | null;
  organizationId: string | null;
  createdBy: string | null;
};

type TeamBillingContext = {
  teamId?: string | null;
  organizationId: string | null;
  hostUserId: string | null;
  connectedAccountId: string | null;
};

export type TeamRegistrationRegistrantType = 'SELF' | 'CHILD';
export type TeamRegistrationRosterRole = 'PARTICIPANT' | 'WAITLIST' | 'FREE_AGENT';

type RegistrationResult =
  | { ok: true; registrationId: string; status: 'ACTIVE' | 'STARTED' }
  | { ok: false; status: number; error: string };

const normalizeCents = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
};

const normalizeRegistrantType = (value: unknown): TeamRegistrationRegistrantType => (
  String(value ?? '').trim().toUpperCase() === 'CHILD' ? 'CHILD' : 'SELF'
);

const normalizeRosterRole = (value: unknown): TeamRegistrationRosterRole => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'WAITLIST' || normalized === 'FREE_AGENT') {
    return normalized;
  }
  return 'PARTICIPANT';
};

const teamRegistrationSelect = {
  id: true,
  teamId: true,
  userId: true,
  parentId: true,
  registrantType: true,
  rosterRole: true,
  status: true,
  jerseyNumber: true,
  position: true,
  isCaptain: true,
  consentDocumentId: true,
  consentStatus: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const buildTeamRegistrationId = (teamId: string, userId: string) => `${teamId}__${userId}`;

export const findTeamRegistration = async ({
  teamId,
  registrantId,
  client = prisma,
}: {
  teamId: string;
  registrantId: string;
  client?: PrismaLike;
}) => {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedRegistrantId = normalizeId(registrantId);
  if (!normalizedTeamId || !normalizedRegistrantId) {
    return null;
  }

  return client.teamRegistrations.findUnique({
    where: {
      teamId_userId: {
        teamId: normalizedTeamId,
        userId: normalizedRegistrantId,
      },
    },
    select: teamRegistrationSelect,
  });
};

const sortRegistrationRows = <T extends { id: string; createdAt: Date | null }>(rows: T[]): T[] => (
  [...rows].sort((left, right) => {
    const leftTime = left.createdAt ? left.createdAt.getTime() : 0;
    const rightTime = right.createdAt ? right.createdAt.getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  })
);

const findOrganizationIdForTeam = async (client: PrismaLike, team: { id: string; organizationId?: string | null }) => {
  return normalizeId(team.organizationId);
};

const findHostUserIdForTeam = async (client: PrismaLike, team: { id: string; createdBy?: string | null }) => {
  const managerAssignment = await client.teamStaffAssignments?.findFirst?.({
    where: {
      teamId: team.id,
      role: 'MANAGER' as any,
      status: ACTIVE_MEMBER_STATUS as any,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: { userId: true },
  });
  const managerId = normalizeId(managerAssignment?.userId);
  if (managerId) return managerId;

  const createdBy = normalizeId(team.createdBy);
  if (createdBy) return createdBy;

  const captainRegistration = await client.teamRegistrations?.findFirst?.({
    where: {
      teamId: team.id,
      status: ACTIVE_MEMBER_STATUS as any,
      isCaptain: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: { userId: true },
  });
  return normalizeId(captainRegistration?.userId);
};

export const resolveTeamBillingContext = async (
  teamIdOrInput: string | {
    teamId?: string | null;
    organizationId?: string | null;
    hostUserId?: string | null;
    createdBy?: string | null;
  },
  client: PrismaLike = prisma,
): Promise<TeamBillingContext> => {
  if (typeof teamIdOrInput === 'string') {
    const team = await client.canonicalTeams?.findUnique?.({
      where: { id: teamIdOrInput },
      select: {
        id: true,
        organizationId: true,
        createdBy: true,
      },
    });
    if (!team) {
      return {
        teamId: teamIdOrInput,
        organizationId: null,
        hostUserId: null,
        connectedAccountId: null,
      };
    }
    const organizationId = await findOrganizationIdForTeam(client, team);
    const hostUserId = await findHostUserIdForTeam(client, team);
    const connectedAccountId = await resolveConnectedAccountId({
      organizationId,
      hostUserId,
    });
    return {
      teamId: team.id,
      organizationId,
      hostUserId,
      connectedAccountId,
    };
  }

  const organizationId = normalizeId(teamIdOrInput.organizationId);
  const hostUserId = normalizeId(teamIdOrInput.hostUserId) ?? normalizeId(teamIdOrInput.createdBy);
  const connectedAccountId = await resolveConnectedAccountId({
    organizationId,
    hostUserId,
  });
  return {
    teamId: normalizeId(teamIdOrInput.teamId),
    organizationId,
    hostUserId,
    connectedAccountId,
  };
};

export const resolveTeamRegistrationSettings = async ({
  teamId,
  organizationId,
  hostUserId,
  createdBy,
  openRegistration,
  registrationPriceCents,
  client = prisma,
}: {
  teamId?: string | null;
  organizationId?: string | null;
  hostUserId?: string | null;
  createdBy?: string | null;
  openRegistration: unknown;
  registrationPriceCents: unknown;
  client?: PrismaLike;
}): Promise<{ openRegistration: boolean; registrationPriceCents: number }> => {
  const nextOpenRegistration = Boolean(openRegistration);
  const nextRegistrationPriceCents = nextOpenRegistration ? normalizeCents(registrationPriceCents) : 0;
  if (!nextOpenRegistration || nextRegistrationPriceCents <= 0) {
    return {
      openRegistration: nextOpenRegistration,
      registrationPriceCents: 0,
    };
  }

  const billingContext = teamId
    ? await resolveTeamBillingContext(teamId, client)
    : await resolveTeamBillingContext({
      organizationId,
      hostUserId,
      createdBy,
    }, client);
  if (!billingContext.connectedAccountId) {
    throw new Error('Connect Stripe before setting a paid team registration cost.');
  }

  return {
    openRegistration: nextOpenRegistration,
    registrationPriceCents: nextRegistrationPriceCents,
  };
};

const readTeamBeforeChatSync = async (tx: PrismaLike, teamId: string): Promise<string[]> => {
  const team = await loadCanonicalTeamById(teamId, tx);
  return team ? getTeamChatBaseMemberIds(team as Record<string, unknown>) : [];
};

export const reserveTeamRegistrationSlot = async ({
  teamId,
  userId,
  actorUserId,
  status,
  registrantType = 'SELF',
  parentId,
  rosterRole = 'PARTICIPANT',
  consentDocumentId,
  consentStatus,
  allowStartedWithoutPayment = false,
  now,
}: {
  teamId: string | null;
  userId: string | null;
  actorUserId: string;
  status: 'ACTIVE' | 'STARTED';
  registrantType?: TeamRegistrationRegistrantType;
  parentId?: string | null;
  rosterRole?: TeamRegistrationRosterRole;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  allowStartedWithoutPayment?: boolean;
  now: Date;
}): Promise<RegistrationResult> => {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedUserId = normalizeId(userId);
  const normalizedParentId = normalizeId(parentId);
  const normalizedRegistrantType = normalizeRegistrantType(registrantType);
  const normalizedRosterRole = normalizeRosterRole(rosterRole);
  const normalizedConsentDocumentId = normalizeId(consentDocumentId);
  const normalizedConsentStatus = normalizeId(consentStatus);
  if (!normalizedTeamId) {
    return { ok: false, status: 400, error: 'Team id is required.' };
  }
  if (!normalizedUserId) {
    return { ok: false, status: 400, error: 'Sign in to register for this team.' };
  }

  const cutoff = new Date(now.getTime() - TEAM_REGISTRATION_STARTED_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const lockedTeams = await tx.$queryRaw<LockedTeamRow[]>`
      SELECT
        "id",
        "teamSize",
        "openRegistration",
        "registrationPriceCents",
        "organizationId",
        "createdBy"
      FROM "Teams"
      WHERE "id" = ${normalizedTeamId}
      FOR UPDATE
    `;
    const team = lockedTeams[0] ?? null;
    if (!team) {
      return { ok: false, status: 404, error: 'Team not found.' };
    }
    if (!team.openRegistration) {
      return { ok: false, status: 409, error: 'This team is not open for registration.' };
    }

    const priceCents = normalizeCents(team.registrationPriceCents);
    if (status === ACTIVE_MEMBER_STATUS && priceCents > 0) {
      return { ok: false, status: 402, error: 'Payment is required to register for this team.' };
    }
    if (status === STARTED_MEMBER_STATUS && priceCents <= 0 && !allowStartedWithoutPayment) {
      return { ok: false, status: 409, error: 'This team does not require payment.' };
    }

    const staleStartedRows = await tx.teamRegistrations.findMany({
      where: {
        teamId: normalizedTeamId,
        status: STARTED_MEMBER_STATUS as any,
        OR: [
          { createdAt: null },
          { createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
    });
    if (staleStartedRows.length) {
      await tx.teamRegistrations.deleteMany({
        where: { id: { in: staleStartedRows.map((row: { id: string }) => row.id) } },
      });
    }

    const registrationId = buildTeamRegistrationId(normalizedTeamId, normalizedUserId);
    const existing = await tx.teamRegistrations.findUnique({
      where: {
        teamId_userId: {
          teamId: normalizedTeamId,
          userId: normalizedUserId,
        },
      },
      select: {
        id: true,
        parentId: true,
        registrantType: true,
        rosterRole: true,
        status: true,
        jerseyNumber: true,
        position: true,
        isCaptain: true,
        consentDocumentId: true,
        consentStatus: true,
        createdAt: true,
        createdBy: true,
      },
    });
    const existingStatus = String(existing?.status ?? '').toUpperCase();
    if (existingStatus === ACTIVE_MEMBER_STATUS) {
      return { ok: false, status: 409, error: 'You are already registered for this team.' };
    }
    if (existing && existingStatus === STARTED_MEMBER_STATUS && status === STARTED_MEMBER_STATUS) {
      await tx.teamRegistrations.update({
        where: { id: existing.id },
        data: {
          parentId: normalizedParentId,
          registrantType: normalizedRegistrantType as any,
          rosterRole: normalizedRosterRole as any,
          consentDocumentId: normalizedConsentDocumentId,
          consentStatus: normalizedConsentStatus,
          updatedAt: now,
          createdAt: existing.createdAt ?? now,
          createdBy: existing.createdBy ?? actorUserId,
        },
      });
      return { ok: true, registrationId: existing?.id ?? registrationId, status };
    }
    if (existing && existingStatus === STARTED_MEMBER_STATUS) {
      return { ok: false, status: 409, error: 'You are already registered for this team.' };
    }

    const previousMemberIds = status === ACTIVE_MEMBER_STATUS
      ? await readTeamBeforeChatSync(tx, normalizedTeamId)
      : [];

    if (!existing) {
      await tx.teamRegistrations.create({
        data: {
          id: registrationId,
          teamId: normalizedTeamId,
          userId: normalizedUserId,
          parentId: normalizedParentId,
          registrantType: normalizedRegistrantType as any,
          rosterRole: normalizedRosterRole as any,
          status: status as any,
          jerseyNumber: null,
          position: null,
          isCaptain: false,
          consentDocumentId: normalizedConsentDocumentId,
          consentStatus: normalizedConsentStatus,
          createdBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else {
      await tx.teamRegistrations.update({
        where: { id: existing.id },
        data: {
          parentId: normalizedParentId,
          registrantType: normalizedRegistrantType as any,
          rosterRole: normalizedRosterRole as any,
          status: status as any,
          isCaptain: false,
          consentDocumentId: normalizedConsentDocumentId,
          consentStatus: normalizedConsentStatus,
          updatedAt: now,
          createdAt: existing.createdAt ?? now,
          createdBy: existing.createdBy ?? actorUserId,
        },
      });
    }

    const releaseCurrentRegistration = async () => {
      if (!existing) {
        await tx.teamRegistrations.deleteMany({
          where: { id: registrationId },
        });
        return;
      }
      await tx.teamRegistrations.update({
        where: { id: existing.id },
        data: {
          parentId: existing.parentId,
          registrantType: existing.registrantType,
          rosterRole: existing.rosterRole,
          status: existing.status,
          jerseyNumber: existing.jerseyNumber,
          position: existing.position,
          isCaptain: existing.isCaptain,
          consentDocumentId: existing.consentDocumentId,
          consentStatus: existing.consentStatus,
          createdBy: existing.createdBy,
          createdAt: existing.createdAt,
          updatedAt: now,
        },
      });
    };

    const teamSize = normalizeCents(team.teamSize);
    if (teamSize > 0) {
      const capacityRows = await tx.teamRegistrations.findMany({
        where: {
          teamId: normalizedTeamId,
          status: { in: ACTIVE_CAPACITY_STATUSES as any },
        },
        select: { id: true, createdAt: true },
      });
      const ordered = sortRegistrationRows(capacityRows);
      if (ordered.length > teamSize) {
        const position = ordered.findIndex((row) => row.id === (existing?.id ?? registrationId));
        if (position < 0 || position >= teamSize) {
          await releaseCurrentRegistration();
          return { ok: false, status: 409, error: 'Team is full. Registration slot was not reserved.' };
        }
      }
    }

    if (status === ACTIVE_MEMBER_STATUS) {
      await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    }

    return { ok: true, registrationId: existing?.id ?? registrationId, status };
  });
};

export const registerForTeam = async ({
  teamId,
  userId,
  actorUserId,
  registrantType = 'SELF',
  parentId,
  rosterRole = 'PARTICIPANT',
  consentDocumentId,
  consentStatus,
  now = new Date(),
}: {
  teamId: string | null;
  userId: string | null;
  actorUserId: string;
  registrantType?: TeamRegistrationRegistrantType;
  parentId?: string | null;
  rosterRole?: TeamRegistrationRosterRole;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  now?: Date;
}) => reserveTeamRegistrationSlot({
  teamId,
  userId,
  actorUserId,
  status: ACTIVE_MEMBER_STATUS,
  registrantType,
  parentId,
  rosterRole,
  consentDocumentId,
  consentStatus,
  now,
});

export const releaseStartedTeamRegistration = async ({
  registrationId,
  teamId,
}: {
  registrationId: string | null;
  teamId: string | null;
}) => {
  const normalizedRegistrationId = normalizeId(registrationId);
  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedRegistrationId || !normalizedTeamId) return;
  try {
    await prisma.teamRegistrations.deleteMany({
      where: {
        id: normalizedRegistrationId,
        teamId: normalizedTeamId,
        status: STARTED_MEMBER_STATUS as any,
      },
    });
  } catch (error) {
    console.warn('Failed to release started team registration after checkout intent failure.', {
      registrationId: normalizedRegistrationId,
      teamId: normalizedTeamId,
      error,
    });
  }
};

export const activateStartedTeamRegistration = async ({
  teamId,
  userId,
  registrationId,
  now,
}: {
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedUserId = normalizeId(userId);
  const normalizedRegistrationId = normalizeId(registrationId);
  if (!normalizedTeamId) return { applied: false, reason: 'missing_team_id' };
  if (!normalizedUserId) return { applied: false, reason: 'missing_user_id' };
  if (!normalizedRegistrationId) return { applied: false, reason: 'missing_registration_id' };

  return prisma.$transaction(async (tx) => {
    const lockedTeams = await tx.$queryRaw<Array<{ id: string; teamSize: number | null }>>`
      SELECT "id", "teamSize"
      FROM "Teams"
      WHERE "id" = ${normalizedTeamId}
      FOR UPDATE
    `;
    const team = lockedTeams[0] ?? null;
    if (!team) return { applied: false, reason: 'team_not_found' };

    const registration = await tx.teamRegistrations.findUnique({
      where: { id: normalizedRegistrationId },
      select: {
        id: true,
        teamId: true,
        userId: true,
        status: true,
      },
    });
    if (!registration) return { applied: false, reason: 'reservation_missing' };
    if (registration.teamId !== normalizedTeamId || registration.userId !== normalizedUserId) {
      return { applied: false, reason: 'reservation_mismatch' };
    }
    if (registration.status === ACTIVE_MEMBER_STATUS) {
      return { applied: true, reason: 'already_active' };
    }
    if (registration.status !== STARTED_MEMBER_STATUS) {
      return { applied: false, reason: 'reservation_not_started' };
    }

    const teamSize = normalizeCents(team.teamSize);
    if (teamSize > 0) {
      const capacityRows = await tx.teamRegistrations.findMany({
        where: {
          teamId: normalizedTeamId,
          status: { in: ACTIVE_CAPACITY_STATUSES as any },
        },
        select: { id: true, createdAt: true },
      });
      const ordered = sortRegistrationRows(capacityRows);
      if (ordered.length > teamSize) {
        const position = ordered.findIndex((row) => row.id === normalizedRegistrationId);
        if (position < 0 || position >= teamSize) {
          await tx.teamRegistrations.deleteMany({
            where: {
              id: normalizedRegistrationId,
              status: STARTED_MEMBER_STATUS as any,
            },
          });
          return { applied: false, reason: 'team_full' };
        }
      }
    }

    const previousMemberIds = await readTeamBeforeChatSync(tx, normalizedTeamId);
    await tx.teamRegistrations.update({
      where: { id: normalizedRegistrationId },
      data: {
        status: ACTIVE_MEMBER_STATUS as any,
        updatedAt: now,
      },
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    return { applied: true };
  });
};

export const leaveTeam = async ({
  teamId,
  userId,
  now,
}: {
  teamId: string | null;
  userId: string | null;
  now: Date;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedTeamId) {
    return { ok: false, status: 400, error: 'Team id is required.' };
  }
  if (!normalizedUserId) {
    return { ok: false, status: 401, error: 'Sign in to leave this team.' };
  }

  return prisma.$transaction(async (tx) => {
    const lockedTeams = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Teams"
      WHERE "id" = ${normalizedTeamId}
      FOR UPDATE
    `;
    if (!lockedTeams[0]) {
      return { ok: false, status: 404, error: 'Team not found.' };
    }

    const registration = await tx.teamRegistrations.findUnique({
      where: {
        teamId_userId: {
          teamId: normalizedTeamId,
          userId: normalizedUserId,
        },
      },
      select: {
        id: true,
        status: true,
        isCaptain: true,
      },
    });
    if (!registration || registration.status !== ACTIVE_MEMBER_STATUS) {
      return { ok: false, status: 409, error: 'You are not an active member of this team.' };
    }
    if (registration.isCaptain) {
      return { ok: false, status: 409, error: 'Transfer captain before leaving this team.' };
    }

    const activeManagers = await tx.teamStaffAssignments.findMany({
      where: {
        teamId: normalizedTeamId,
        role: 'MANAGER' as any,
        status: ACTIVE_MEMBER_STATUS as any,
      },
      select: { userId: true },
    });
    const normalizedManagers = activeManagers
      .map((row: { userId: string }) => normalizeId(row.userId))
      .filter((value: string | null): value is string => Boolean(value));
    if (normalizedManagers.includes(normalizedUserId) && normalizedManagers.length <= 1) {
      return { ok: false, status: 409, error: 'Transfer manager before leaving this team.' };
    }

    const previousMemberIds = await readTeamBeforeChatSync(tx, normalizedTeamId);
    await tx.teamRegistrations.update({
      where: { id: registration.id },
      data: {
        status: LEFT_MEMBER_STATUS as any,
        isCaptain: false,
        updatedAt: now,
      },
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    return { ok: true };
  });
};
