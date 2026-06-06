import { prisma } from '@/lib/prisma';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import {
  loadAndBuildRegistrationAnswerSnapshot,
  listRegistrationQuestionResponsesForSubjects,
  upsertRegistrationQuestionResponse,
  type RegistrationQuestionAnswerSnapshotItem,
} from '@/server/registrationQuestions';
import { loadCanonicalTeamById, normalizeId } from '@/server/teams/teamMembership';
import { syncCanonicalTeamFutureEventSnapshots } from '@/server/teams/teamEventSnapshotSync';
import { TEAM_JOIN_POLICY_REQUEST_TO_JOIN, resolveSerializedTeamJoinPolicy } from '@/server/teams/teamJoinPolicy';
import { buildTeamRegistrationId } from '@/server/teams/teamOpenRegistration';

type PrismaLike = any;

export type TeamJoinRequestAction = 'APPROVE' | 'DECLINE';

const ACTIVE_CAPACITY_STATUSES = ['ACTIVE', 'INVITED', 'STARTED', 'PENDING'];
const ACTIVE_MEMBER_STATUS = 'ACTIVE';
const PENDING_REQUEST_STATUS = 'PENDING';

type TeamJoinRequestRegistrantType = 'SELF' | 'CHILD';

type TeamJoinRequestRow = {
  id: string;
  teamId: string;
  requesterUserId: string;
  registrantUserId: string;
  parentId?: string | null;
  registrantType: TeamJoinRequestRegistrantType;
  status: string;
  reviewedByUserId?: string | null;
  reviewedAt?: Date | string | null;
  reviewNote?: string | null;
  approvedRegistrationId?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

const normalizeRegistrantType = (value: unknown): TeamJoinRequestRegistrantType => (
  String(value ?? '').trim().toUpperCase() === 'CHILD' ? 'CHILD' : 'SELF'
);

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const readTeamBeforeChatSync = async (tx: PrismaLike, teamId: string): Promise<string[]> => {
  const team = await loadCanonicalTeamById(teamId, tx);
  return team ? getTeamChatBaseMemberIds(team as Record<string, unknown>) : [];
};

const toAnswerSnapshot = (response: unknown): RegistrationQuestionAnswerSnapshotItem[] => {
  const row = response && typeof response === 'object' ? response as Record<string, any> : null;
  return Array.isArray(row?.answersSnapshot) ? row.answersSnapshot : [];
};

const loadUsersById = async (client: PrismaLike, userIds: string[]): Promise<Map<string, Record<string, any>>> => {
  const normalizedIds = Array.from(new Set(userIds.map((id) => normalizeId(id)).filter(Boolean))) as string[];
  if (!normalizedIds.length || !client.userData?.findMany) {
    return new Map<string, Record<string, any>>();
  }
  const users = await client.userData.findMany({
    where: { id: { in: normalizedIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userName: true,
      profileImageId: true,
    },
  });
  return new Map<string, Record<string, any>>(
    users.map((user: Record<string, any>) => [String(user.id), user]),
  );
};

export const serializeTeamJoinRequest = (
  row: TeamJoinRequestRow,
  answers: RegistrationQuestionAnswerSnapshotItem[] = [],
  usersById: Map<string, Record<string, any>> = new Map(),
) => ({
  id: row.id,
  teamId: row.teamId,
  requesterUserId: row.requesterUserId,
  registrantUserId: row.registrantUserId,
  parentId: row.parentId ?? null,
  registrantType: normalizeRegistrantType(row.registrantType),
  status: String(row.status ?? '').toUpperCase(),
  reviewedByUserId: row.reviewedByUserId ?? null,
  reviewedAt: row.reviewedAt ?? null,
  reviewNote: row.reviewNote ?? null,
  approvedRegistrationId: row.approvedRegistrationId ?? null,
  answers,
  requester: usersById.get(row.requesterUserId) ?? null,
  registrant: usersById.get(row.registrantUserId) ?? null,
  createdAt: row.createdAt ?? null,
  updatedAt: row.updatedAt ?? null,
});

export const listTeamJoinRequests = async (params: {
  teamId: string;
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const teamId = normalizeId(params.teamId);
  if (!teamId || !client.teamJoinRequests?.findMany) {
    return [];
  }
  const rows = await client.teamJoinRequests.findMany({
    where: { teamId },
    orderBy: [
      { status: 'asc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ],
  }) as TeamJoinRequestRow[];
  const responses = await listRegistrationQuestionResponsesForSubjects({
    subjectType: 'TEAM_JOIN_REQUEST',
    subjectIds: rows.map((row) => row.id),
    client,
  });
  const responsesBySubjectId = new Map<string, Record<string, any>>(
    responses.map((response: Record<string, any>) => [String(response.subjectId), response]),
  );
  const usersById = await loadUsersById(client, rows.flatMap((row) => [row.requesterUserId, row.registrantUserId]));
  return rows.map((row) => serializeTeamJoinRequest(
    row,
    toAnswerSnapshot(responsesBySubjectId.get(row.id)),
    usersById,
  ));
};

export const getCurrentTeamJoinRequestForUser = async (params: {
  teamId: string;
  userId: string;
  client?: PrismaLike;
}) => {
  const client = params.client ?? prisma;
  const teamId = normalizeId(params.teamId);
  const userId = normalizeId(params.userId);
  if (!teamId || !userId || !client.teamJoinRequests?.findFirst) {
    return null;
  }
  const row = await client.teamJoinRequests.findFirst({
    where: {
      teamId,
      registrantUserId: userId,
      status: PENDING_REQUEST_STATUS as any,
    },
    orderBy: { createdAt: 'desc' },
  }) as TeamJoinRequestRow | null;
  if (!row) {
    return null;
  }
  const responses = await listRegistrationQuestionResponsesForSubjects({
    subjectType: 'TEAM_JOIN_REQUEST',
    subjectIds: [row.id],
    client,
  });
  const usersById = await loadUsersById(client, [row.requesterUserId, row.registrantUserId]);
  return serializeTeamJoinRequest(row, toAnswerSnapshot(responses[0]), usersById);
};

export const submitTeamJoinRequest = async (params: {
  teamId: string;
  requesterUserId: string;
  registrantUserId?: string | null;
  parentId?: string | null;
  registrantType?: TeamJoinRequestRegistrantType;
  answers?: unknown;
}) => {
  const teamId = normalizeId(params.teamId);
  const requesterUserId = normalizeId(params.requesterUserId);
  const registrantUserId = normalizeId(params.registrantUserId) ?? requesterUserId;
  const parentId = normalizeId(params.parentId);
  const registrantType = normalizeRegistrantType(params.registrantType);
  if (!teamId || !requesterUserId || !registrantUserId) {
    return { ok: false as const, status: 400, error: 'Team and user are required.' };
  }

  try {
    const answerSnapshot = await loadAndBuildRegistrationAnswerSnapshot({
      scopeType: 'TEAM',
      scopeId: teamId,
      answers: params.answers,
    });
    const request = await prisma.$transaction(async (tx) => {
      const lockedTeams = await tx.$queryRaw<Array<{
        id: string;
        openRegistration: boolean | null;
        joinPolicy?: string | null;
      }>>`
        SELECT "id", "openRegistration", "joinPolicy"
        FROM "Teams"
        WHERE "id" = ${teamId}
        FOR UPDATE
      `;
      const team = lockedTeams[0] ?? null;
      if (!team) {
        throw Object.assign(new Error('Team not found.'), { status: 404 });
      }
      if (resolveSerializedTeamJoinPolicy(team) !== TEAM_JOIN_POLICY_REQUEST_TO_JOIN) {
        throw Object.assign(new Error('This team is not accepting join requests.'), { status: 409 });
      }

      const activeRegistration = await tx.teamRegistrations.findFirst({
        where: {
          teamId,
          userId: registrantUserId,
          status: { in: ACTIVE_CAPACITY_STATUSES as any },
        },
        select: { id: true, status: true },
      });
      if (activeRegistration) {
        throw Object.assign(new Error('This player is already registered for this team.'), { status: 409 });
      }

      const existingPending = await tx.teamJoinRequests.findFirst({
        where: {
          teamId,
          registrantUserId,
          status: PENDING_REQUEST_STATUS as any,
        },
        orderBy: { createdAt: 'desc' },
      }) as TeamJoinRequestRow | null;
      if (existingPending) {
        if (answerSnapshot.length) {
          await upsertRegistrationQuestionResponse({
            scopeType: 'TEAM',
            scopeId: teamId,
            subjectType: 'TEAM_JOIN_REQUEST',
            subjectId: existingPending.id,
            responderUserId: requesterUserId,
            registrantUserId,
            registrantType,
            answersSnapshot: answerSnapshot,
            client: tx,
          });
        }
        return existingPending;
      }

      const now = new Date();
      const created = await tx.teamJoinRequests.create({
        data: {
          id: crypto.randomUUID(),
          teamId,
          requesterUserId,
          registrantUserId,
          parentId,
          registrantType: registrantType as any,
          status: PENDING_REQUEST_STATUS as any,
          createdAt: now,
          updatedAt: now,
        },
      }) as TeamJoinRequestRow;
      if (answerSnapshot.length) {
        await upsertRegistrationQuestionResponse({
          scopeType: 'TEAM',
          scopeId: teamId,
          subjectType: 'TEAM_JOIN_REQUEST',
          subjectId: created.id,
          responderUserId: requesterUserId,
          registrantUserId,
          registrantType,
          answersSnapshot: answerSnapshot,
          client: tx,
        });
      }
      return created;
    });
    const usersById = await loadUsersById(prisma, [request.requesterUserId, request.registrantUserId]);
    return {
      ok: true as const,
      request: serializeTeamJoinRequest(request, answerSnapshot, usersById),
    };
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 400;
    const message = error instanceof Error ? error.message : 'Unable to request to join this team.';
    return { ok: false as const, status, error: message };
  }
};

export const reviewTeamJoinRequest = async (params: {
  teamId: string;
  requestId: string;
  reviewerUserId: string;
  action: TeamJoinRequestAction;
  note?: string | null;
}) => {
  const teamId = normalizeId(params.teamId);
  const requestId = normalizeId(params.requestId);
  const reviewerUserId = normalizeId(params.reviewerUserId);
  if (!teamId || !requestId || !reviewerUserId) {
    return { ok: false as const, status: 400, error: 'Team request review context is incomplete.' };
  }

  try {
    const reviewed = await prisma.$transaction(async (tx) => {
      const lockedTeams = await tx.$queryRaw<Array<{
        id: string;
        teamSize: number | null;
        openRegistration: boolean | null;
        joinPolicy?: string | null;
      }>>`
        SELECT "id", "teamSize", "openRegistration", "joinPolicy"
        FROM "Teams"
        WHERE "id" = ${teamId}
        FOR UPDATE
      `;
      const team = lockedTeams[0] ?? null;
      if (!team) {
        throw Object.assign(new Error('Team not found.'), { status: 404 });
      }
      const request = await tx.teamJoinRequests.findUnique({
        where: { id: requestId },
      }) as TeamJoinRequestRow | null;
      if (!request || request.teamId !== teamId) {
        throw Object.assign(new Error('Join request not found.'), { status: 404 });
      }
      if (String(request.status ?? '').toUpperCase() !== PENDING_REQUEST_STATUS) {
        throw Object.assign(new Error('This join request has already been reviewed.'), { status: 409 });
      }

      const now = new Date();
      if (params.action === 'DECLINE') {
        return tx.teamJoinRequests.update({
          where: { id: requestId },
          data: {
            status: 'DECLINED' as any,
            reviewedByUserId: reviewerUserId,
            reviewedAt: now,
            reviewNote: normalizeText(params.note),
            updatedAt: now,
          },
        }) as Promise<TeamJoinRequestRow>;
      }

      const registrationId = buildTeamRegistrationId(teamId, request.registrantUserId);
      const existingRegistration = await tx.teamRegistrations.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: request.registrantUserId,
          },
        },
        select: { id: true, status: true, createdAt: true, createdBy: true },
      });
      const existingStatus = String(existingRegistration?.status ?? '').toUpperCase();
      const alreadyCountsTowardCapacity = ACTIVE_CAPACITY_STATUSES.includes(existingStatus);
      const teamSize = Number.isFinite(Number(team.teamSize)) ? Math.max(0, Math.trunc(Number(team.teamSize))) : 0;
      if (teamSize > 0 && !alreadyCountsTowardCapacity) {
        const activeCount = await tx.teamRegistrations.count({
          where: {
            teamId,
            status: { in: ACTIVE_CAPACITY_STATUSES as any },
          },
        });
        if (activeCount >= teamSize) {
          throw Object.assign(new Error('Team is full. Increase team size before approving this request.'), { status: 409 });
        }
      }

      const previousMemberIds = await readTeamBeforeChatSync(tx, teamId);
      if (!existingRegistration) {
        await tx.teamRegistrations.create({
          data: {
            id: registrationId,
            teamId,
            userId: request.registrantUserId,
            parentId: request.parentId ?? null,
            registrantType: request.registrantType as any,
            rosterRole: 'PARTICIPANT' as any,
            status: ACTIVE_MEMBER_STATUS as any,
            jerseyNumber: null,
            position: null,
            isCaptain: false,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: request.requesterUserId,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await tx.teamRegistrations.update({
          where: { id: existingRegistration.id },
          data: {
            parentId: request.parentId ?? null,
            registrantType: request.registrantType as any,
            rosterRole: 'PARTICIPANT' as any,
            status: ACTIVE_MEMBER_STATUS as any,
            isCaptain: false,
            updatedAt: now,
            createdBy: existingRegistration.createdBy ?? request.requesterUserId,
            createdAt: existingRegistration.createdAt ?? now,
          },
        });
      }

      const requestResponses = await listRegistrationQuestionResponsesForSubjects({
        subjectType: 'TEAM_JOIN_REQUEST',
        subjectIds: [request.id],
        client: tx,
      });
      const answerSnapshot = toAnswerSnapshot(requestResponses[0]);
      if (answerSnapshot.length) {
        await upsertRegistrationQuestionResponse({
          scopeType: 'TEAM',
          scopeId: teamId,
          subjectType: 'TEAM_REGISTRATION',
          subjectId: existingRegistration?.id ?? registrationId,
          responderUserId: request.requesterUserId,
          registrantUserId: request.registrantUserId,
          registrantType: request.registrantType,
          answersSnapshot: answerSnapshot,
          client: tx,
        });
      }

      const updatedRequest = await tx.teamJoinRequests.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED' as any,
          reviewedByUserId: reviewerUserId,
          reviewedAt: now,
          reviewNote: normalizeText(params.note),
          approvedRegistrationId: existingRegistration?.id ?? registrationId,
          updatedAt: now,
        },
      }) as TeamJoinRequestRow;
      await syncCanonicalTeamFutureEventSnapshots({
        tx,
        canonicalTeamId: teamId,
        createdBy: reviewerUserId,
        now,
      });
      await syncTeamChatInTx(tx, teamId, { previousMemberIds });
      return updatedRequest;
    });
    const responses = await listRegistrationQuestionResponsesForSubjects({
      subjectType: 'TEAM_JOIN_REQUEST',
      subjectIds: [reviewed.id],
    });
    const usersById = await loadUsersById(prisma, [reviewed.requesterUserId, reviewed.registrantUserId]);
    return {
      ok: true as const,
      request: serializeTeamJoinRequest(reviewed, toAnswerSnapshot(responses[0]), usersById),
    };
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 400;
    const message = error instanceof Error ? error.message : 'Unable to review join request.';
    return { ok: false as const, status, error: message };
  }
};

export const withdrawTeamJoinRequest = async (params: {
  teamId: string;
  requestId: string;
  requesterUserId: string;
}) => {
  const teamId = normalizeId(params.teamId);
  const requestId = normalizeId(params.requestId);
  const requesterUserId = normalizeId(params.requesterUserId);
  if (!teamId || !requestId || !requesterUserId) {
    return { ok: false as const, status: 400, error: 'Join request context is incomplete.' };
  }
  const request = await prisma.teamJoinRequests.findUnique({
    where: { id: requestId },
  }) as TeamJoinRequestRow | null;
  if (!request || request.teamId !== teamId || request.requesterUserId !== requesterUserId) {
    return { ok: false as const, status: 404, error: 'Join request not found.' };
  }
  if (String(request.status ?? '').toUpperCase() !== PENDING_REQUEST_STATUS) {
    return { ok: false as const, status: 409, error: 'Only pending requests can be withdrawn.' };
  }
  const updated = await prisma.teamJoinRequests.update({
    where: { id: requestId },
    data: {
      status: 'WITHDRAWN' as any,
      updatedAt: new Date(),
    },
  }) as TeamJoinRequestRow;
  const responses = await listRegistrationQuestionResponsesForSubjects({
    subjectType: 'TEAM_JOIN_REQUEST',
    subjectIds: [updated.id],
  });
  const usersById = await loadUsersById(prisma, [updated.requesterUserId, updated.registrantUserId]);
  return {
    ok: true as const,
    request: serializeTeamJoinRequest(updated, toAnswerSnapshot(responses[0]), usersById),
  };
};
