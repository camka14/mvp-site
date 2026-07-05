import { prisma } from '@/lib/prisma';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import {
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import {
  acceptTeamInviteEventSyncs,
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import { reserveChildTeamRegistrationForGuardian } from '@/server/teams/teamChildRegistration';

type PrismaLike = any;

type SessionLike = {
  userId: string;
  isAdmin?: boolean;
};

type TeamInviteRecord = {
  id: string;
  type?: string | null;
  teamId?: string | null;
  userId?: string | null;
  createdBy?: string | null;
};

type InviteActionResult = {
  status: number;
  body: Record<string, unknown>;
};

type AuthorizedTeamInviteAction = {
  ok: true;
  teamId: string;
  targetUserId: string;
  targetIsMinor: boolean;
  actingParentId: string | null;
} | {
  ok: false;
  status: number;
  error: string;
};

export const TEAM_INVITE_NO_PARENT_LINK_MESSAGE = 'No parent/guardian link is detected. Please have your parent or guardian create an account and accept this invitation on your behalf.';
export const TEAM_INVITE_PARENT_REQUIRED_MESSAGE = 'A parent or guardian must accept team invitations for child accounts.';

const uniqueStrings = (values: unknown[]): string[] => Array.from(
  new Set(values.map((value) => normalizeId(value)).filter((value): value is string => Boolean(value))),
);

export const listActiveChildIdsForParent = async (
  client: PrismaLike,
  parentId: string,
): Promise<string[]> => {
  const links = await client.parentChildLinks.findMany({
    where: {
      parentId,
      status: 'ACTIVE',
    },
    select: { childId: true },
  });
  return normalizeIdList(links.map((link: { childId?: string | null }) => link.childId));
};

const findActiveParentLink = async (
  client: PrismaLike,
  parentId: string,
  childId: string,
): Promise<{ id: string } | null> => client.parentChildLinks.findFirst({
  where: {
    parentId,
    childId,
    status: 'ACTIVE',
  },
  select: { id: true },
});

const hasAnyActiveParentLink = async (
  client: PrismaLike,
  childId: string,
): Promise<boolean> => {
  const link = await client.parentChildLinks.findFirst({
    where: {
      childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const isUserMinor = async (
  client: PrismaLike,
  userId: string,
  now: Date,
): Promise<boolean> => {
  const user = await client.userData.findUnique({
    where: { id: userId },
    select: { dateOfBirth: true },
  });
  return isMinorAtUtcDate(user?.dateOfBirth, now);
};

export const authorizeTeamInviteAction = async ({
  client = prisma,
  invite,
  session,
  action,
  now = new Date(),
}: {
  client?: PrismaLike;
  invite: TeamInviteRecord;
  session: SessionLike;
  action: 'accept' | 'decline';
  now?: Date;
}): Promise<AuthorizedTeamInviteAction> => {
  const teamId = normalizeId(invite.teamId);
  const targetUserId = normalizeId(invite.userId);
  if (!teamId || !targetUserId) {
    return { ok: false, status: 400, error: 'Invalid invite' };
  }

  const targetIsMinor = await isUserMinor(client, targetUserId, now);
  if (session.isAdmin) {
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: null,
    };
  }

  if (targetUserId === session.userId) {
    if (action === 'accept' && targetIsMinor) {
      const hasParentLink = await hasAnyActiveParentLink(client, targetUserId);
      return {
        ok: false,
        status: 403,
        error: hasParentLink ? TEAM_INVITE_PARENT_REQUIRED_MESSAGE : TEAM_INVITE_NO_PARENT_LINK_MESSAGE,
      };
    }
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: null,
    };
  }

  if (targetIsMinor && await findActiveParentLink(client, session.userId, targetUserId)) {
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: session.userId,
    };
  }

  return { ok: false, status: 403, error: 'Forbidden' };
};

export const acceptTeamInviteWithGuardianRules = async ({
  invite,
  session,
  now = new Date(),
}: {
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
}): Promise<InviteActionResult> => {
  const auth = await authorizeTeamInviteAction({
    invite,
    session,
    action: 'accept',
    now,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const team = await loadCanonicalTeamById(auth.teamId);
  if (!team) {
    return { status: 404, body: { error: 'Team not found' } };
  }

  const pending = normalizeIdList((team as any).pending);
  const isPlayerInvite = pending.includes(auth.targetUserId);
  const isChildOpenJoinRequest = Boolean(
    auth.targetIsMinor
    && auth.actingParentId
    && !isPlayerInvite
    && normalizeId(invite.createdBy) === auth.targetUserId,
  );

  if (isChildOpenJoinRequest && auth.actingParentId) {
    const registration = await reserveChildTeamRegistrationForGuardian({
      teamId: auth.teamId,
      childId: auth.targetUserId,
      parentId: auth.actingParentId,
      actorUserId: session.userId,
      teamRow: team as Record<string, any>,
      now,
    });
    if (!registration.ok) {
      return { status: registration.status, body: { error: registration.error } };
    }
    await prisma.invites.delete({ where: { id: invite.id } });
    return {
      status: 200,
      body: {
        ok: true,
        requestType: 'TEAM',
        ...registration.payload,
      },
    };
  }

  const ok = await prisma.$transaction(async (tx) => {
    const txTeam = await loadCanonicalTeamById(auth.teamId, tx);
    if (!txTeam) {
      return false;
    }

    const previousMemberIds = getTeamChatBaseMemberIds(txTeam);
    const txPending = normalizeIdList((txTeam as any).pending);
    const txIsPlayerInvite = txPending.includes(auth.targetUserId);

    if (txIsPlayerInvite) {
      await syncCanonicalTeamRoster({
        teamId: auth.teamId,
        captainId: (txTeam as any).captainId,
        playerIds: uniqueStrings([...(Array.isArray((txTeam as any).playerIds) ? (txTeam as any).playerIds : []), auth.targetUserId]),
        pendingPlayerIds: txPending.filter((userId: string) => userId !== auth.targetUserId),
        managerId: (txTeam as any).managerId,
        headCoachId: (txTeam as any).headCoachId,
        assistantCoachIds: Array.isArray((txTeam as any).coachIds) ? (txTeam as any).coachIds : [],
        actingUserId: session.userId,
        now,
        cleanupRemovedPendingInvites: false,
      }, tx);

      if (auth.actingParentId) {
        await tx.teamRegistrations?.updateMany?.({
          where: {
            teamId: auth.teamId,
            userId: auth.targetUserId,
          },
          data: {
            parentId: auth.actingParentId,
            registrantType: 'CHILD',
            updatedAt: now,
          },
        });
      }
    }

    await syncTeamChatInTx(tx, auth.teamId, {
      previousMemberIds,
    });
    await acceptTeamInviteEventSyncs(tx, invite, now, {
      propagateToLinkedEventTeams: txIsPlayerInvite,
    });

    if (tx.invites?.deleteMany) {
      await tx.invites.deleteMany({ where: { id: invite.id } });
    } else {
      await tx.invites.delete({ where: { id: invite.id } });
    }
    return true;
  });

  if (!ok) {
    return { status: 404, body: { error: 'Team not found' } };
  }

  return { status: 200, body: { ok: true } };
};

export const declineTeamInviteWithGuardianRules = async ({
  invite,
  session,
  now = new Date(),
}: {
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
}): Promise<InviteActionResult> => {
  const auth = await authorizeTeamInviteAction({
    invite,
    session,
    action: 'decline',
    now,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  await prisma.$transaction(async (tx) => {
    await rollbackTeamInviteEventSyncs(tx, invite, 'DECLINED', now);
    await removeCanonicalPendingInvitee(tx, invite, session.userId, now);

    await tx.invites.update({
      where: { id: invite.id },
      data: {
        status: 'DECLINED',
        updatedAt: now,
      },
    });
  });

  return { status: 200, body: { ok: true } };
};
