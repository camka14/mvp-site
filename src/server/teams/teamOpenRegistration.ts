import { prisma } from '@/lib/prisma';
import {
  upsertRegistrationQuestionResponse,
  type RegistrationQuestionAnswerSnapshotItem,
} from '@/server/registrationQuestions';
import { resolveConnectedAccountId } from '@/lib/stripeConnectAccounts';
import {
  buildRefundScopeSnapshot,
  buildTeamRegistrationRefundEventId,
  isRefundScopeSnapshotValid,
  resolveRefundablePaymentsForRequest,
  type RefundRequestRow,
} from '@/server/refunds/refundExecution';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import {
  loadCanonicalTeamById,
  normalizeId,
} from '@/server/teams/teamMembership';
import {
  TEAM_JOIN_POLICY_OPEN_REGISTRATION,
  TEAM_JOIN_POLICY_REQUEST_TO_JOIN,
  type TeamJoinPolicy,
  inferTeamJoinPolicyFromOpenRegistration,
  normalizeTeamJoinPolicy,
  resolveSerializedTeamJoinPolicy,
} from '@/server/teams/teamJoinPolicy';
import { syncCanonicalTeamFutureEventSnapshots } from '@/server/teams/teamEventSnapshotSync';

type PrismaLike = any;

export const TEAM_REGISTRATION_STARTED_TTL_MS = 10 * 60 * 1000;

const ACTIVE_CAPACITY_STATUSES = ['ACTIVE', 'INVITED', 'STARTED', 'PENDING'] as const;
const ACTIVE_MEMBER_STATUS = 'ACTIVE';
const STARTED_MEMBER_STATUS = 'STARTED';
const PENDING_MEMBER_STATUS = 'PENDING';
const LEFT_MEMBER_STATUS = 'LEFT';

type LockedTeamRow = {
  id: string;
  teamSize: number | null;
  openRegistration: boolean | null;
  joinPolicy?: string | null;
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
  | {
      ok: true;
      registrationId: string;
      status: 'ACTIVE' | 'STARTED' | 'PENDING';
      registrationHoldExpiresAt?: Date | null;
    }
  | { ok: false; status: number; error: string };

type TeamRegistrationRefundResult =
  | { ok: true; refundId: string; refundAlreadyPending: boolean }
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

const buildStartedRegistrationHoldExpiresAt = (createdAt: Date | null | undefined, now: Date): Date => (
  new Date((createdAt?.getTime() ?? now.getTime()) + TEAM_REGISTRATION_STARTED_TTL_MS)
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
  joinPolicy,
  openRegistration,
  registrationPriceCents,
  client = prisma,
}: {
  teamId?: string | null;
  organizationId?: string | null;
  hostUserId?: string | null;
  createdBy?: string | null;
  joinPolicy?: unknown;
  openRegistration: unknown;
  registrationPriceCents: unknown;
  client?: PrismaLike;
}): Promise<{ joinPolicy: TeamJoinPolicy; openRegistration: boolean; registrationPriceCents: number }> => {
  const normalizedJoinPolicy = normalizeTeamJoinPolicy(
    joinPolicy,
    inferTeamJoinPolicyFromOpenRegistration(openRegistration),
  );
  const nextOpenRegistration = normalizedJoinPolicy === TEAM_JOIN_POLICY_OPEN_REGISTRATION;
  const nextRegistrationPriceCents = (
    nextOpenRegistration || normalizedJoinPolicy === TEAM_JOIN_POLICY_REQUEST_TO_JOIN
  )
    ? normalizeCents(registrationPriceCents)
    : 0;
  if (!nextOpenRegistration || nextRegistrationPriceCents <= 0) {
    return {
      joinPolicy: normalizedJoinPolicy,
      openRegistration: nextOpenRegistration,
      registrationPriceCents: nextRegistrationPriceCents,
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
    joinPolicy: normalizedJoinPolicy,
    openRegistration: nextOpenRegistration,
    registrationPriceCents: nextRegistrationPriceCents,
  };
};

const deleteQuestionResponsesForRegistrations = async (
  tx: PrismaLike,
  registrationIds: string[],
) => {
  const ids = registrationIds
    .map((registrationId) => normalizeId(registrationId))
    .filter((registrationId): registrationId is string => Boolean(registrationId));
  if (!ids.length || !tx.registrationQuestionResponses?.deleteMany) {
    return;
  }
  await tx.registrationQuestionResponses.deleteMany({
    where: {
      subjectType: 'TEAM_REGISTRATION' as any,
      subjectId: { in: ids },
    },
  });
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
  answersSnapshot,
  allowStartedWithoutPayment = false,
  now,
}: {
  teamId: string | null;
  userId: string | null;
  actorUserId: string;
  status: 'ACTIVE' | 'STARTED' | 'PENDING';
  registrantType?: TeamRegistrationRegistrantType;
  parentId?: string | null;
  rosterRole?: TeamRegistrationRosterRole;
  consentDocumentId?: string | null;
  consentStatus?: string | null;
  answersSnapshot?: RegistrationQuestionAnswerSnapshotItem[];
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
        "joinPolicy",
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
    if (
      resolveSerializedTeamJoinPolicy(team) !== TEAM_JOIN_POLICY_OPEN_REGISTRATION
      || !team.openRegistration
    ) {
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
      await deleteQuestionResponsesForRegistrations(tx, staleStartedRows.map((row: { id: string }) => row.id));
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
    if (existingStatus === PENDING_MEMBER_STATUS) {
      return { ok: false, status: 409, error: 'Payment is pending for this team registration.' };
    }
    if (existing && existingStatus === STARTED_MEMBER_STATUS && status === STARTED_MEMBER_STATUS) {
      const existingCreatedAt = existing.createdAt ?? now;
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
      return {
        ok: true,
        registrationId: existing?.id ?? registrationId,
        status,
        registrationHoldExpiresAt: buildStartedRegistrationHoldExpiresAt(existingCreatedAt, now),
      };
    }
    if (existing && existingStatus === STARTED_MEMBER_STATUS) {
      return { ok: false, status: 409, error: 'You are already registered for this team.' };
    }

    const previousMemberIds = status === ACTIVE_MEMBER_STATUS || status === PENDING_MEMBER_STATUS
      ? await readTeamBeforeChatSync(tx, normalizedTeamId)
      : [];

    const responseRegistrationId = existing?.id ?? registrationId;
    const registrationHoldCreatedAt = existingStatus === STARTED_MEMBER_STATUS
      ? existing?.createdAt ?? now
      : now;

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
          createdAt: status === STARTED_MEMBER_STATUS ? registrationHoldCreatedAt : existing.createdAt ?? now,
          createdBy: existing.createdBy ?? actorUserId,
        },
      });
    }

    if (Array.isArray(answersSnapshot) && answersSnapshot.length) {
      await upsertRegistrationQuestionResponse({
        scopeType: 'TEAM',
        scopeId: normalizedTeamId,
        subjectType: 'TEAM_REGISTRATION',
        subjectId: responseRegistrationId,
        responderUserId: actorUserId,
        registrantUserId: normalizedUserId,
        registrantType: normalizedRegistrantType,
        answersSnapshot,
        client: tx,
      });
    }

    const releaseCurrentRegistration = async () => {
      await deleteQuestionResponsesForRegistrations(tx, [responseRegistrationId]);
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

    if (status === ACTIVE_MEMBER_STATUS || status === PENDING_MEMBER_STATUS) {
      await syncCanonicalTeamFutureEventSnapshots({
        tx,
        canonicalTeamId: normalizedTeamId,
        createdBy: actorUserId,
        now,
      });
      await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    }

    return {
      ok: true,
      registrationId: existing?.id ?? registrationId,
      status,
      registrationHoldExpiresAt: status === STARTED_MEMBER_STATUS
        ? buildStartedRegistrationHoldExpiresAt(registrationHoldCreatedAt, now)
        : null,
    };
  });
};

export const markTeamRegistrationPaymentPending = async ({
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
    if (registration.status === PENDING_MEMBER_STATUS) {
      return { applied: true, reason: 'already_pending' };
    }
    if (registration.status !== STARTED_MEMBER_STATUS) {
      return { applied: false, reason: 'reservation_not_started' };
    }

    const previousMemberIds = await readTeamBeforeChatSync(tx, normalizedTeamId);
    await tx.teamRegistrations.update({
      where: { id: normalizedRegistrationId },
      data: {
        status: PENDING_MEMBER_STATUS as any,
        updatedAt: now,
      },
    });
    await syncCanonicalTeamFutureEventSnapshots({
      tx,
      canonicalTeamId: normalizedTeamId,
      createdBy: normalizedUserId,
      now,
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    return { applied: true };
  });
};

export const cancelPendingTeamRegistration = async ({
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
    if (registration.status !== STARTED_MEMBER_STATUS && registration.status !== PENDING_MEMBER_STATUS) {
      return { applied: false, reason: 'reservation_not_pending' };
    }

    const previousMemberIds = registration.status === PENDING_MEMBER_STATUS
      ? await readTeamBeforeChatSync(tx, normalizedTeamId)
      : [];
    await tx.teamRegistrations.update({
      where: { id: normalizedRegistrationId },
      data: {
        status: LEFT_MEMBER_STATUS as any,
        isCaptain: false,
        updatedAt: now,
      },
    });
    if (registration.status === PENDING_MEMBER_STATUS) {
      await syncCanonicalTeamFutureEventSnapshots({
        tx,
        canonicalTeamId: normalizedTeamId,
        createdBy: normalizedUserId,
        now,
      });
      await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    }
    return { applied: true };
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
    await prisma.$transaction(async (tx) => {
      await deleteQuestionResponsesForRegistrations(tx, [normalizedRegistrationId]);
      await tx.teamRegistrations.deleteMany({
        where: {
          id: normalizedRegistrationId,
          teamId: normalizedTeamId,
          status: STARTED_MEMBER_STATUS as any,
        },
      });
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
  allowRetryableFailure = false,
}: {
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
  allowRetryableFailure?: boolean;
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
        createdAt: true,
      },
    });
    if (!registration) return { applied: false, reason: 'reservation_missing' };
    if (registration.teamId !== normalizedTeamId || registration.userId !== normalizedUserId) {
      return { applied: false, reason: 'reservation_mismatch' };
    }
    if (registration.status === ACTIVE_MEMBER_STATUS) {
      return { applied: true, reason: 'already_active' };
    }
    const isRetryableFailedRegistration = allowRetryableFailure && registration.status === LEFT_MEMBER_STATUS;
    if (
      registration.status !== STARTED_MEMBER_STATUS
      && registration.status !== PENDING_MEMBER_STATUS
      && !isRetryableFailedRegistration
    ) {
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
      const ordered = sortRegistrationRows(
        isRetryableFailedRegistration
          ? [...capacityRows, { id: registration.id, createdAt: registration.createdAt }]
          : capacityRows,
      );
      if (ordered.length > teamSize) {
        const position = ordered.findIndex((row) => row.id === normalizedRegistrationId);
        if (position < 0 || position >= teamSize) {
          if (registration.status === PENDING_MEMBER_STATUS) {
            const previousMemberIds = await readTeamBeforeChatSync(tx, normalizedTeamId);
            await tx.teamRegistrations.update({
              where: { id: normalizedRegistrationId },
              data: {
                status: LEFT_MEMBER_STATUS as any,
                isCaptain: false,
                updatedAt: now,
              },
            });
            await syncCanonicalTeamFutureEventSnapshots({
              tx,
              canonicalTeamId: normalizedTeamId,
              createdBy: normalizedUserId,
              now,
            });
            await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
          } else if (registration.status === STARTED_MEMBER_STATUS) {
            await deleteQuestionResponsesForRegistrations(tx, [normalizedRegistrationId]);
            await tx.teamRegistrations.deleteMany({
              where: {
                id: normalizedRegistrationId,
                status: STARTED_MEMBER_STATUS as any,
              },
            });
          }
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
    await syncCanonicalTeamFutureEventSnapshots({
      tx,
      canonicalTeamId: normalizedTeamId,
      createdBy: normalizedUserId,
      now,
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    return { applied: true };
  });
};

export const activateFailedTeamRegistration = async (params: {
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => (
  activateStartedTeamRegistration({
    ...params,
    allowRetryableFailure: true,
  })
);

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
    await syncCanonicalTeamFutureEventSnapshots({
      tx,
      canonicalTeamId: normalizedTeamId,
      createdBy: normalizedUserId,
      now,
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });
    return { ok: true };
  });
};

export const requestTeamRegistrationRefund = async ({
  teamId,
  userId,
  reason,
  now,
}: {
  teamId: string | null;
  userId: string | null;
  reason?: string | null;
  now: Date;
}): Promise<TeamRegistrationRefundResult> => {
  const normalizedTeamId = normalizeId(teamId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedTeamId) {
    return { ok: false, status: 400, error: 'Team id is required.' };
  }
  if (!normalizedUserId) {
    return { ok: false, status: 401, error: 'Sign in to request a refund.' };
  }

  return prisma.$transaction(async (tx) => {
    const lockedTeams = await tx.$queryRaw<LockedTeamRow[]>`
      SELECT
        "id",
        "teamSize",
        "openRegistration",
        "joinPolicy",
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
    if (
      resolveSerializedTeamJoinPolicy(team) !== TEAM_JOIN_POLICY_OPEN_REGISTRATION
      || !team.openRegistration
      || normalizeCents(team.registrationPriceCents) <= 0
    ) {
      return { ok: false, status: 409, error: 'Refund requests are only available for paid open registrations.' };
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
      return { ok: false, status: 409, error: 'Transfer captain before requesting a refund.' };
    }

    const activeStaffAssignment = await tx.teamStaffAssignments.findFirst({
      where: {
        teamId: normalizedTeamId,
        userId: normalizedUserId,
        status: ACTIVE_MEMBER_STATUS as any,
      },
      select: { id: true },
    });
    if (activeStaffAssignment) {
      return { ok: false, status: 409, error: 'Transfer team staff duties before requesting a refund.' };
    }

    const refundEventId = buildTeamRegistrationRefundEventId(normalizedTeamId);
    const normalizedReason = normalizeId(reason) ?? 'team_registration_refund_requested';
    const existingRefund = await tx.refundRequests.findFirst({
      where: {
        eventId: refundEventId,
        userId: normalizedUserId,
        teamId: normalizedTeamId,
        status: { in: ['WAITING', 'APPROVED'] as any },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        eventId: true,
        userId: true,
        requestedByUserId: true,
        hostId: true,
        teamId: true,
        organizationId: true,
        reason: true,
        status: true,
        slotId: true,
        occurrenceDate: true,
        billIds: true,
        paymentIds: true,
        paymentScope: true,
        requestedAmountCents: true,
        currency: true,
        policyDecision: true,
        scopeVersion: true,
        scopeHash: true,
      },
    });
    const verifiedExistingRefund = existingRefund
      && isRefundScopeSnapshotValid(existingRefund as RefundRequestRow)
      ? existingRefund
      : null;

    let newRefundRequest: RefundRequestRow | null = null;
    let newRefundScope: ReturnType<typeof buildRefundScopeSnapshot> | null = null;
    if (!verifiedExistingRefund) {
      const organizationId = await findOrganizationIdForTeam(tx, team);
      const hostUserId = await findHostUserIdForTeam(tx, team);
      newRefundRequest = {
        id: crypto.randomUUID(),
        eventId: refundEventId,
        userId: normalizedUserId,
        requestedByUserId: normalizedUserId,
        hostId: hostUserId,
        teamId: normalizedTeamId,
        organizationId,
        reason: normalizedReason,
        status: 'WAITING',
      };
      const payments = await resolveRefundablePaymentsForRequest(tx, newRefundRequest);
      if (!payments.length) {
        return {
          ok: false,
          status: 409,
          error: 'No refundable payment was found for this team registration.',
        };
      }
      newRefundScope = buildRefundScopeSnapshot(
        newRefundRequest,
        payments,
        'HOST_REVIEW_REQUIRED',
      );
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
    await syncCanonicalTeamFutureEventSnapshots({
      tx,
      canonicalTeamId: normalizedTeamId,
      createdBy: normalizedUserId,
      now,
    });
    await syncTeamChatInTx(tx, normalizedTeamId, { previousMemberIds });

    if (verifiedExistingRefund) {
      return { ok: true, refundId: verifiedExistingRefund.id, refundAlreadyPending: true };
    }

    if (!newRefundRequest || !newRefundScope) {
      throw new Error('Unable to create a verified team registration refund request.');
    }
    const refund = await tx.refundRequests.create({
      data: {
        id: newRefundRequest.id,
        eventId: newRefundRequest.eventId,
        userId: newRefundRequest.userId,
        requestedByUserId: newRefundRequest.requestedByUserId,
        hostId: newRefundRequest.hostId,
        teamId: newRefundRequest.teamId,
        organizationId: newRefundRequest.organizationId,
        billIds: newRefundScope.billIds,
        paymentIds: newRefundScope.paymentIds,
        paymentScope: newRefundScope.paymentScope,
        requestedAmountCents: newRefundScope.requestedAmountCents,
        currency: newRefundScope.currency,
        policyDecision: newRefundScope.policyDecision,
        scopeVersion: newRefundScope.scopeVersion,
        scopeHash: newRefundScope.scopeHash,
        reason: newRefundRequest.reason,
        status: 'WAITING' as any,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    return { ok: true, refundId: refund.id, refundAlreadyPending: false };
  });
};
