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
