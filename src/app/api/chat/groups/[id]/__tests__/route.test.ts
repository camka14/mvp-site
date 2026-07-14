/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const chatGroupFindUniqueMock = jest.fn();
const chatGroupUpdateMock = jest.fn();
const userDataFindManyMock = jest.fn();
const messagesCountMock = jest.fn();
const messagesFindFirstMock = jest.fn();
const isChatGroupMemberMock = jest.fn();
const archiveChatGroupMock = jest.fn();
const withLegacyFieldsMock = jest.fn((row: any) => ({ ...row, $id: row.id }));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
      update: (...args: any[]) => chatGroupUpdateMock(...args),
    },
    userData: {
      findMany: (...args: any[]) => userDataFindManyMock(...args),
    },
    messages: {
      count: (...args: any[]) => messagesCountMock(...args),
      findFirst: (...args: any[]) => messagesFindFirstMock(...args),
    },
  },
}));

jest.mock('@/server/chatAccess', () => ({
  ...jest.requireActual('@/server/chatAccess'),
  isChatGroupMember: (...args: any[]) => isChatGroupMemberMock(...args),
}));

jest.mock('@/server/legacyFormat', () => ({
  stripLegacyFieldsDeep: (value: any) => value,
  withLegacyFields: (row: any) => withLegacyFieldsMock(row),
}));

jest.mock('@/server/moderation', () => ({
  archiveChatGroup: (...args: any[]) => archiveChatGroupMock(...args),
}));

import { DELETE, GET, PATCH } from '@/app/api/chat/groups/[id]/route';

const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/chat/groups/chat_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const existingGroup = (overrides: Record<string, unknown> = {}) => ({
  id: 'chat_1',
  name: null,
  userIds: ['user_1', 'user_2'],
  hostId: 'user_1',
  teamId: null,
  archivedAt: null,
  ...overrides,
});

describe('/api/chat/groups/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    isChatGroupMemberMock.mockResolvedValue(true);
  });

  it('returns the authoritative unread count and latest-message summary', async () => {
    const group = existingGroup();
    const lastMessage = {
      id: 'message_2',
      chatId: 'chat_1',
      userId: 'user_2',
      body: 'Latest update',
      sentTime: new Date('2026-07-14T08:00:00.000Z'),
      readByIds: [],
      removedAt: null,
    };
    chatGroupFindUniqueMock.mockResolvedValue(group);
    messagesCountMock.mockResolvedValue(3);
    messagesFindFirstMock.mockResolvedValue(lastMessage);

    const response = await GET(
      new NextRequest('http://localhost/api/chat/groups/chat_1'),
      { params: Promise.resolve({ id: 'chat_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      id: 'chat_1',
      unreadCount: 3,
      lastMessage: expect.objectContaining({
        id: 'message_2',
        $id: 'message_2',
        body: 'Latest update',
      }),
    }));
    expect(messagesCountMock).toHaveBeenCalledWith({
      where: {
        chatId: 'chat_1',
        userId: { not: 'user_1' },
        removedAt: null,
        NOT: { readByIds: { has: 'user_1' } },
      },
    });
    expect(messagesFindFirstMock).toHaveBeenCalledWith({
      where: { chatId: 'chat_1', removedAt: null },
      orderBy: [{ sentTime: 'desc' }, { id: 'desc' }],
    });
  });

  it('rejects adding a minor participant to a non-team chat', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup());
    userDataFindManyMock.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'user_2', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('team chats');
    expect(chatGroupUpdateMock).not.toHaveBeenCalled();
  });

  it('clears the direct-message pair when its membership becomes a group', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({
      directUserIdA: 'user_1',
      directUserIdB: 'user_2',
    }));
    userDataFindManyMock.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_3', dateOfBirth: new Date('1992-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);
    chatGroupUpdateMock.mockImplementation(async ({ data }: any) => existingGroup(data));

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'user_2', 'user_3'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(200);
    expect(chatGroupUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userIds: ['user_1', 'user_2', 'user_3'],
        directUserIdA: null,
        directUserIdB: null,
      }),
    }));
  });

  it('rejects a team-chat host attempting to mutate roster-managed membership', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({ teamId: 'team_1' }));

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('roster');
    expect(chatGroupUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects a team-chat host attempting to archive the deterministic team chat', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({
      id: 'team:team_1',
      teamId: null,
    }));

    const response = await DELETE(
      new NextRequest('http://localhost/api/chat/groups/team:team_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'team:team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('roster');
    expect(archiveChatGroupMock).not.toHaveBeenCalled();
  });

  it('allows an administrator to repair a roster-managed team chat', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
    const updatedGroup = existingGroup({
      teamId: 'team_1',
      userIds: ['user_1', 'minor_1'],
    });
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({ teamId: 'team_1' }));
    chatGroupUpdateMock.mockResolvedValue(updatedGroup);
    userDataFindManyMock.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(200);
    expect(chatGroupUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat_1' },
      data: expect.objectContaining({ userIds: ['user_1', 'minor_1'] }),
    }));
  });
});
