import { isMinorAtUtcDate } from '@/server/userPrivacy';

export type ChatParticipantUser = {
  id: string;
  dateOfBirth: Date | string | null;
  blockedUserIds?: string[] | null;
};

type ChatParticipantClient = {
  userData: {
    findMany: (args: any) => Promise<ChatParticipantUser[]>;
  };
};

export const normalizeChatParticipantIds = (value: string[] | null | undefined): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
);

export type CanonicalDirectMessagePair = {
  directUserIdA: string;
  directUserIdB: string;
};

const NON_DIRECT_CHAT_ID_PREFIXES = [
  'user_',
  'team_',
  'event_',
  'tournament_',
  'match_',
];

export const isDirectMessageCandidateGroupId = (value: string | null | undefined): boolean => {
  const normalizedId = value?.trim().toLowerCase() ?? '';
  return normalizedId.length > 0
    && !normalizedId.startsWith('team:')
    && !NON_DIRECT_CHAT_ID_PREFIXES.some((prefix) => normalizedId.startsWith(prefix));
};

export const getCanonicalDirectMessagePair = (
  value: string[] | null | undefined,
): CanonicalDirectMessagePair | null => {
  const participantIds = normalizeChatParticipantIds(value).sort((left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  if (participantIds.length !== 2) {
    return null;
  }
  return {
    directUserIdA: participantIds[0],
    directUserIdB: participantIds[1],
  };
};

export const getRetainedDirectMessagePair = (
  existing: { directUserIdA?: string | null; directUserIdB?: string | null },
  nextUserIds: string[] | null | undefined,
): CanonicalDirectMessagePair | null => {
  const nextPair = getCanonicalDirectMessagePair(nextUserIds);
  return nextPair
    && existing.directUserIdA === nextPair.directUserIdA
    && existing.directUserIdB === nextPair.directUserIdB
    ? nextPair
    : null;
};

export const hasBlockingChatRelationship = (users: Array<Pick<ChatParticipantUser, 'id' | 'blockedUserIds'>>): boolean => {
  const participantIds = new Set(users.map((user) => user.id));
  return users.some((user) => normalizeChatParticipantIds(user.blockedUserIds).some((blockedId) => participantIds.has(blockedId)));
};

export const getMinorChatParticipantIds = (
  users: Array<Pick<ChatParticipantUser, 'id' | 'dateOfBirth'>>,
): string[] => (
  users
    .filter((user) => isMinorAtUtcDate(user.dateOfBirth))
    .map((user) => user.id)
);

export const loadChatParticipants = async (
  client: ChatParticipantClient,
  userIds: string[],
): Promise<ChatParticipantUser[]> => {
  const normalizedUserIds = normalizeChatParticipantIds(userIds);
  if (!normalizedUserIds.length) {
    return [];
  }

  return client.userData.findMany({
    where: { id: { in: normalizedUserIds } },
    select: { id: true, dateOfBirth: true, blockedUserIds: true },
  });
};
