/** @jest-environment node */

import { NextRequest } from 'next/server';

const chatGroupFindUniqueMock = jest.fn();
const messagesCreateMock = jest.fn();
const userDataFindManyMock = jest.fn();
const requireSessionMock = jest.fn();
const ensureUserHasAcceptedChatTermsMock = jest.fn();
const getChatGroupMemberIdsMock = jest.fn();
const isChatGroupMemberMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
    },
    messages: {
      create: (...args: any[]) => messagesCreateMock(...args),
    },
    userData: {
      findMany: (...args: any[]) => userDataFindManyMock(...args),
    },
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/server/chatAccess', () => ({
  ensureUserHasAcceptedChatTerms: (...args: any[]) => ensureUserHasAcceptedChatTermsMock(...args),
  getChatGroupMemberIds: (...args: any[]) => getChatGroupMemberIdsMock(...args),
  isChatGroupMember: (...args: any[]) => isChatGroupMemberMock(...args),
}));

jest.mock('@/server/legacyFormat', () => ({
  parseDateInput: (value?: string) => (value ? new Date(value) : null),
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));

import { POST } from '@/app/api/messages/route';

const createRequest = (body: unknown) => new NextRequest('http://localhost/api/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/messages POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureUserHasAcceptedChatTermsMock.mockResolvedValue(undefined);
    isChatGroupMemberMock.mockResolvedValue(true);
    getChatGroupMemberIdsMock.mockResolvedValue(['captain_1', 'player_1']);
    userDataFindManyMock.mockResolvedValue([
      { id: 'captain_1', blockedUserIds: [] },
      { id: 'player_1', blockedUserIds: [] },
    ]);
  });

  it('denies a stale attacker before writing a message to a roster-managed team chat', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'stale_attacker', isAdmin: false });
    const staleTeamChat = {
      id: 'team:team_1',
      teamId: 'team_1',
      hostId: 'captain_1',
      userIds: ['captain_1', 'stale_attacker'],
      archivedAt: null,
    };
    chatGroupFindUniqueMock.mockResolvedValue(staleTeamChat);
    isChatGroupMemberMock.mockResolvedValue(false);

    const response = await POST(createRequest({
      id: 'injected_message_1',
      body: 'I should not be allowed to write here.',
      userId: 'stale_attacker',
      chatId: 'team:team_1',
    }));

    expect(response.status).toBe(403);
    expect(isChatGroupMemberMock).toHaveBeenCalledWith(
      { userId: 'stale_attacker', isAdmin: false },
      staleTeamChat,
    );
    expect(getChatGroupMemberIdsMock).not.toHaveBeenCalled();
    expect(userDataFindManyMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('uses canonical team members for the blocking check after access is granted', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    const staleTeamChat = {
      id: 'team:team_1',
      teamId: 'team_1',
      hostId: 'captain_1',
      userIds: ['captain_1', 'player_1', 'stale_attacker'],
      archivedAt: null,
    };
    chatGroupFindUniqueMock.mockResolvedValue(staleTeamChat);
    getChatGroupMemberIdsMock.mockResolvedValue(['captain_1', 'player_1', 'guardian_1']);
    userDataFindManyMock.mockResolvedValue([
      { id: 'captain_1', blockedUserIds: [] },
      { id: 'player_1', blockedUserIds: [] },
      { id: 'guardian_1', blockedUserIds: [] },
    ]);
    messagesCreateMock.mockResolvedValue({
      id: 'message_1',
      chatId: 'team:team_1',
      userId: 'captain_1',
      body: 'Practice update',
    });

    const response = await POST(createRequest({
      id: 'message_1',
      body: 'Practice update',
      userId: 'captain_1',
      chatId: 'team:team_1',
    }));

    expect(response.status).toBe(201);
    expect(getChatGroupMemberIdsMock).toHaveBeenCalledWith(staleTeamChat);
    expect(userDataFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['captain_1', 'player_1', 'guardian_1'] } },
      select: { id: true, blockedUserIds: true },
    });
    expect(messagesCreateMock).toHaveBeenCalled();
  });
});
