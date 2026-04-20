import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { CurrentUser, currentUserSelect, isMinorAtUtcDate, publicUserSelect } from '@/server/userPrivacy';

export type PublicUser = Prisma.UserDataGetPayload<{ select: typeof publicUserSelect }>;
type SocialTx = Prisma.TransactionClient;
type CurrentUserSocialUser = CurrentUser;

const normalizeIds = (value: string[] | null | undefined): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
);

const addUniqueId = (value: string[] | null | undefined, id: string): string[] => {
  const normalizedId = id.trim();
  if (!normalizedId) return normalizeIds(value);
  return normalizeIds([...(value ?? []), normalizedId]);
};

const removeId = (value: string[] | null | undefined, id: string): string[] => {
  const normalizedId = id.trim();
  if (!normalizedId) return normalizeIds(value);
  return normalizeIds(value).filter((entry) => entry !== normalizedId);
};

const normalizeUserName = (user: Pick<PublicUser, 'firstName' | 'lastName' | 'userName'>): string => {
  const explicit = user.userName?.trim();
  if (explicit) return explicit.toLowerCase();
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toLowerCase();
};

const sortUsers = <T extends Pick<PublicUser, 'firstName' | 'lastName' | 'userName'>>(users: T[]): T[] => {
  return [...users].sort((a, b) => normalizeUserName(a).localeCompare(normalizeUserName(b)));
};

const mapUsersById = (users: PublicUser[]): Map<string, PublicUser> => {
  return new Map(users.map((user) => [user.id, user]));
};

const mapSocialUsersById = (users: CurrentUserSocialUser[]): Map<string, CurrentUserSocialUser> => {
  return new Map(users.map((user) => [user.id, user]));
};

const pickUsersByIds = (ids: string[], usersById: Map<string, PublicUser>): PublicUser[] => {
  return ids
    .map((id) => usersById.get(id))
    .filter((user): user is PublicUser => Boolean(user));
};

const findUsersByIds = async (tx: SocialTx, ids: string[]): Promise<PublicUser[]> => {
  const normalizedIds = normalizeIds(ids);
  if (!normalizedIds.length) return [];

  return tx.userData.findMany({
    where: { id: { in: normalizedIds } },
    select: publicUserSelect,
  });
};

const findSocialUsersByIds = async (tx: SocialTx, ids: string[]): Promise<CurrentUserSocialUser[]> => {
  const normalizedIds = normalizeIds(ids);
  if (!normalizedIds.length) return [];

  return tx.userData.findMany({
    where: { id: { in: normalizedIds } },
    select: currentUserSelect,
  });
};

const getActorAndTarget = async (
  tx: SocialTx,
  actorUserId: string,
  targetUserId: string,
): Promise<{ actor: CurrentUserSocialUser; target: CurrentUserSocialUser }> => {
  const actorId = actorUserId.trim();
  const targetId = targetUserId.trim();

  if (!actorId || !targetId) {
    throw new SocialGraphError(400, 'A valid user id is required.');
  }

  if (actorId === targetId) {
    throw new SocialGraphError(400, 'You cannot perform this action on your own profile.');
  }

  const users = await findSocialUsersByIds(tx, [actorId, targetId]);
  const usersById = mapSocialUsersById(users);
  const actor = usersById.get(actorId);
  const target = usersById.get(targetId);
  if (!actor || !target) {
    throw new SocialGraphError(404, 'User not found.');
  }

  return { actor, target };
};

const assertTargetIsNotMinor = (target: Pick<PublicUser, 'dateOfBirth'>): void => {
  if (isMinorAtUtcDate(target.dateOfBirth)) {
    throw new SocialGraphError(403, 'This action is not allowed for minor accounts.');
  }
};

const assertUsersAreNotBlocked = (
  actor: Pick<CurrentUserSocialUser, 'blockedUserIds' | 'id'>,
  target: Pick<CurrentUserSocialUser, 'blockedUserIds' | 'id'>,
): void => {
  const actorBlockedIds = normalizeIds(actor.blockedUserIds);
  const targetBlockedIds = normalizeIds(target.blockedUserIds);
  if (actorBlockedIds.includes(target.id) || targetBlockedIds.includes(actor.id)) {
    throw new SocialGraphError(403, 'This action is unavailable because one of these users has blocked the other.');
  }
};

export class SocialGraphError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SocialGraph {
  user: CurrentUserSocialUser;
  friends: PublicUser[];
  following: PublicUser[];
  followers: PublicUser[];
  incomingFriendRequests: PublicUser[];
  outgoingFriendRequests: PublicUser[];
  blocked: PublicUser[];
}

export const getSocialGraphForUser = async (userId: string): Promise<SocialGraph> => {
  const actorId = userId.trim();
  if (!actorId) {
    throw new SocialGraphError(400, 'A valid user id is required.');
  }

  const user = await prisma.userData.findUnique({
    where: { id: actorId },
    select: currentUserSelect,
  });

  if (!user) {
    throw new SocialGraphError(404, 'User not found.');
  }

  const followers = await prisma.userData.findMany({
    where: { followingIds: { has: actorId } },
    select: publicUserSelect,
  });

  const relatedIds = normalizeIds([
    ...normalizeIds(user.friendIds),
    ...normalizeIds(user.followingIds),
    ...normalizeIds(user.friendRequestIds),
    ...normalizeIds(user.friendRequestSentIds),
    ...normalizeIds(user.blockedUserIds),
    ...followers.map((row) => row.id),
  ]);

  const relatedUsers = await prisma.userData.findMany({
    where: { id: { in: relatedIds } },
    select: publicUserSelect,
  });

  const usersById = mapUsersById(relatedUsers);

  return {
    user,
    friends: sortUsers(pickUsersByIds(normalizeIds(user.friendIds), usersById)),
    following: sortUsers(pickUsersByIds(normalizeIds(user.followingIds), usersById)),
    followers: sortUsers(pickUsersByIds(normalizeIds(followers.map((row) => row.id)), usersById)),
    incomingFriendRequests: sortUsers(pickUsersByIds(normalizeIds(user.friendRequestIds), usersById)),
    outgoingFriendRequests: sortUsers(pickUsersByIds(normalizeIds(user.friendRequestSentIds), usersById)),
    blocked: sortUsers(pickUsersByIds(normalizeIds(user.blockedUserIds), usersById)),
  };
};

export const sendFriendRequest = async (actorUserId: string, targetUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, targetUserId);
    assertTargetIsNotMinor(target);
    assertUsersAreNotBlocked(actor as CurrentUserSocialUser, target as CurrentUserSocialUser);

    const actorFriendIds = normalizeIds(actor.friendIds);
    const actorSentIds = normalizeIds(actor.friendRequestSentIds);
    const actorIncomingIds = normalizeIds(actor.friendRequestIds);
    const targetIncomingIds = normalizeIds(target.friendRequestIds);

    if (actorFriendIds.includes(target.id)) {
      return actor;
    }

    if (actorIncomingIds.includes(target.id)) {
      throw new SocialGraphError(409, 'This user already sent you a friend request. Accept or decline it first.');
    }

    if (actorSentIds.includes(target.id) && targetIncomingIds.includes(actor.id)) {
      return actor;
    }

    const now = new Date();

    await tx.userData.update({
      where: { id: target.id },
      data: {
        friendRequestIds: addUniqueId(target.friendRequestIds, actor.id),
        updatedAt: now,
      },
    });

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        friendRequestSentIds: addUniqueId(actor.friendRequestSentIds, target.id),
        updatedAt: now,
      },
      select: currentUserSelect,
    });
  });
};

export const acceptFriendRequest = async (actorUserId: string, requesterUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, requesterUserId);
    assertUsersAreNotBlocked(actor as CurrentUserSocialUser, target as CurrentUserSocialUser);

    const actorFriends = normalizeIds(actor.friendIds);
    const actorIncoming = normalizeIds(actor.friendRequestIds);
    const actorOutgoing = normalizeIds(actor.friendRequestSentIds);

    const targetFriends = normalizeIds(target.friendIds);
    const targetIncoming = normalizeIds(target.friendRequestIds);
    const targetOutgoing = normalizeIds(target.friendRequestSentIds);

    const alreadyFriends = actorFriends.includes(target.id) && targetFriends.includes(actor.id);
    const hasPendingRequest = actorIncoming.includes(target.id) || targetOutgoing.includes(actor.id);

    if (!alreadyFriends && !hasPendingRequest) {
      throw new SocialGraphError(400, 'No pending friend request from this user.');
    }

    const now = new Date();

    await tx.userData.update({
      where: { id: target.id },
      data: {
        friendIds: addUniqueId(targetFriends, actor.id),
        friendRequestIds: removeId(targetIncoming, actor.id),
        friendRequestSentIds: removeId(targetOutgoing, actor.id),
        updatedAt: now,
      },
    });

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        friendIds: addUniqueId(actorFriends, target.id),
        friendRequestIds: removeId(actorIncoming, target.id),
        friendRequestSentIds: removeId(actorOutgoing, target.id),
        updatedAt: now,
      },
      select: currentUserSelect,
    });
  });
};

export const declineFriendRequest = async (actorUserId: string, requesterUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, requesterUserId);

    const now = new Date();

    await tx.userData.update({
      where: { id: target.id },
      data: {
        friendRequestIds: removeId(target.friendRequestIds, actor.id),
        friendRequestSentIds: removeId(target.friendRequestSentIds, actor.id),
        updatedAt: now,
      },
    });

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        friendRequestIds: removeId(actor.friendRequestIds, target.id),
        friendRequestSentIds: removeId(actor.friendRequestSentIds, target.id),
        updatedAt: now,
      },
      select: currentUserSelect,
    });
  });
};

export const removeFriend = async (actorUserId: string, friendUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, friendUserId);

    const now = new Date();

    await tx.userData.update({
      where: { id: target.id },
      data: {
        friendIds: removeId(target.friendIds, actor.id),
        friendRequestIds: removeId(target.friendRequestIds, actor.id),
        friendRequestSentIds: removeId(target.friendRequestSentIds, actor.id),
        updatedAt: now,
      },
    });

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        friendIds: removeId(actor.friendIds, target.id),
        friendRequestIds: removeId(actor.friendRequestIds, target.id),
        friendRequestSentIds: removeId(actor.friendRequestSentIds, target.id),
        updatedAt: now,
      },
      select: currentUserSelect,
    });
  });
};

export const followUser = async (actorUserId: string, targetUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, targetUserId);
    assertTargetIsNotMinor(target);
    assertUsersAreNotBlocked(actor as CurrentUserSocialUser, target as CurrentUserSocialUser);

    if (normalizeIds(actor.followingIds).includes(target.id)) {
      return actor;
    }

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        followingIds: addUniqueId(actor.followingIds, target.id),
        updatedAt: new Date(),
      },
      select: currentUserSelect,
    });
  });
};

export const unfollowUser = async (actorUserId: string, targetUserId: string): Promise<CurrentUserSocialUser> => {
  return prisma.$transaction(async (tx) => {
    const { actor, target } = await getActorAndTarget(tx, actorUserId, targetUserId);

    return tx.userData.update({
      where: { id: actor.id },
      data: {
        followingIds: removeId(actor.followingIds, target.id),
        updatedAt: new Date(),
      },
      select: currentUserSelect,
    });
  });
};
