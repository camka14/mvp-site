import { prisma } from '@/lib/prisma';
import {
  buildChatTermsRequiredPayload,
  hasAcceptedCurrentChatTerms,
} from '@/server/chatTerms';
import { getCurrentTeamChatMemberIds } from '@/server/teamChatSync';
import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

type UserLookupClient = typeof prisma | {
  userData: {
    findUnique: (args: {
      where: { id: string };
      select: { chatTermsAcceptedAt: true; chatTermsVersion: true };
    }) => Promise<{
      chatTermsAcceptedAt: Date | null;
      chatTermsVersion: string | null;
    } | null>;
  };
};

export const ensureUserHasAcceptedChatTerms = async (
  userId: string,
  client: UserLookupClient = prisma,
) => {
  const user = await client.userData.findUnique({
    where: { id: userId },
    select: { chatTermsAcceptedAt: true, chatTermsVersion: true },
  });
  if (!hasAcceptedCurrentChatTerms(user)) {
    throw new Response(JSON.stringify(buildChatTermsRequiredPayload()), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
};

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

export type ChatGroupAccessRecord = {
  id?: string | null;
  hostId?: string | null;
  teamId?: string | null;
  userIds?: string[] | null;
};

const TEAM_CHAT_GROUP_ID_PREFIX = 'team:';

const normalizeIds = (ids: string[] | null | undefined): string[] => (
  Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)))
);

export const isReservedTeamChatGroupId = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().toLowerCase().startsWith(TEAM_CHAT_GROUP_ID_PREFIX)
);

export const isTeamChatGroup = (group: ChatGroupAccessRecord): boolean => (
  (typeof group.teamId === 'string' && group.teamId.trim().length > 0)
  || isReservedTeamChatGroupId(group.id)
);

export const getTeamIdForChatGroup = (group: ChatGroupAccessRecord): string | null => {
  const teamId = group.teamId?.trim();
  if (teamId) {
    return teamId;
  }

  const groupId = group.id?.trim();
  if (!groupId || !isReservedTeamChatGroupId(groupId)) {
    return null;
  }

  const teamIdFromGroupId = groupId.slice(TEAM_CHAT_GROUP_ID_PREFIX.length).trim();
  return teamIdFromGroupId || null;
};

/**
 * Resolves membership from the canonical team roster for team chats. Generic
 * chat groups continue to use their stored membership list. A null result is
 * intentionally fail-closed: it must never fall back to an old team row.
 */
export const getChatGroupMemberIds = async (
  group: ChatGroupAccessRecord,
  client: any = prisma,
): Promise<string[] | null> => {
  const teamId = getTeamIdForChatGroup(group);
  if (!teamId) {
    return normalizeIds([...(group.userIds ?? []), group.hostId ?? '']);
  }

  try {
    return await getCurrentTeamChatMemberIds(client, teamId);
  } catch {
    return null;
  }
};

export const isChatGroupMember = async (
  session: SessionLike,
  group: ChatGroupAccessRecord,
  client: any = prisma,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }

  const memberIds = await getChatGroupMemberIds(group, client);
  return memberIds?.includes(session.userId) ?? false;
};

/**
 * Identifies team chats a user may need to see. Guardians inherit the chats
 * of their actively linked minor children, then every candidate is still
 * checked against the authoritative roster before it is returned.
 */
export const getChatTeamIdsForUser = async (
  userId: string,
  client: any = prisma,
): Promise<string[]> => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return [];
  }

  try {
    const childLinks = client?.parentChildLinks?.findMany
      ? await client.parentChildLinks.findMany({
        where: { parentId: normalizedUserId, status: 'ACTIVE' },
        select: { childId: true },
      })
      : [];
    const relatedUserIds = Array.from(new Set([
      normalizedUserId,
      ...childLinks
        .map((link: { childId?: unknown }) => String(link.childId ?? '').trim())
        .filter(Boolean),
    ]));
    const teamIdsByUserId = await getCanonicalTeamIdsByUserIds(relatedUserIds, client);
    return Array.from(new Set(
      relatedUserIds.flatMap((relatedUserId) => teamIdsByUserId.get(relatedUserId) ?? []),
    ));
  } catch {
    // A listing must not use the persisted ChatGroup membership as a fallback.
    return [];
  }
};

export const canManageChatGroup = (session: SessionLike, group: ChatGroupAccessRecord): boolean => (
  session.isAdmin || (!isTeamChatGroup(group) && group.hostId === session.userId)
);
