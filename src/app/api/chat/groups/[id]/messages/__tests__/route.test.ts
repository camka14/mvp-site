/** @jest-environment node */

import { NextRequest } from 'next/server';

const chatGroupFindUniqueMock = jest.fn();
const messagesFindManyMock = jest.fn();
const messagesCountMock = jest.fn();
const requireSessionMock = jest.fn();
const ensureUserHasAcceptedChatTermsMock = jest.fn();
const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
    },
    messages: {
      findMany: (...args: any[]) => messagesFindManyMock(...args),
      count: (...args: any[]) => messagesCountMock(...args),
    },
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/server/chatAccess', () => ({
  ensureUserHasAcceptedChatTerms: (...args: any[]) => ensureUserHasAcceptedChatTermsMock(...args),
}));

jest.mock('@/server/legacyFormat', () => ({
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
}));

import { GET } from '@/app/api/chat/groups/[id]/messages/route';

const requestFor = (query = '') => new NextRequest(`http://localhost/api/chat/groups/chat_1/messages${query}`);

describe('/api/chat/groups/[id]/messages GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureUserHasAcceptedChatTermsMock.mockResolvedValue(undefined);
  });

  it('returns indexed pagination metadata for authorized members', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    chatGroupFindUniqueMock.mockResolvedValue({ id: 'chat_1', userIds: ['user_1'] });
    messagesCountMock.mockResolvedValue(45);
    messagesFindManyMock.mockResolvedValue([
      { id: 'm_1', chatId: 'chat_1', body: 'hello', userId: 'user_2', sentTime: new Date('2026-03-06T01:00:00.000Z') },
      { id: 'm_2', chatId: 'chat_1', body: 'world', userId: 'user_1', sentTime: new Date('2026-03-06T00:59:00.000Z') },
    ]);

    const response = await GET(requestFor('?limit=20&index=20&order=desc'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(ensureUserHasAcceptedChatTermsMock).toHaveBeenCalledWith('user_1');
    expect(messagesFindManyMock).toHaveBeenCalledWith({
      where: { chatId: 'chat_1', removedAt: null },
      orderBy: { sentTime: 'desc' },
      skip: 20,
      take: 20,
    });
    expect(json.pagination).toEqual({
      index: 20,
      limit: 20,
      totalCount: 45,
      nextIndex: 22,
      remainingCount: 23,
      hasMore: true,
      order: 'desc',
    });
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].$id).toBe('m_1');
  });

  it('returns 403 for users outside the chat group', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    chatGroupFindUniqueMock.mockResolvedValue({ id: 'chat_1', userIds: ['user_1', 'user_2'] });

    const response = await GET(requestFor(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(403);
    expect(messagesFindManyMock).not.toHaveBeenCalled();
    expect(messagesCountMock).not.toHaveBeenCalled();
  });

  it('normalizes invalid pagination query parameters', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    chatGroupFindUniqueMock.mockResolvedValue({ id: 'chat_1', userIds: ['user_1'] });
    messagesCountMock.mockResolvedValue(1);
    messagesFindManyMock.mockResolvedValue([
      { id: 'm_1', chatId: 'chat_1', body: 'only', userId: 'user_1', sentTime: new Date('2026-03-06T01:00:00.000Z') },
    ]);

    const response = await GET(requestFor('?limit=0&index=-5&order=invalid'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(messagesFindManyMock).toHaveBeenCalledWith({
      where: { chatId: 'chat_1', removedAt: null },
      orderBy: { sentTime: 'asc' },
      skip: 0,
      take: 1,
    });
    expect(json.pagination).toEqual({
      index: 0,
      limit: 1,
      totalCount: 1,
      nextIndex: 1,
      remainingCount: 0,
      hasMore: false,
      order: 'asc',
    });
  });

  it('lets admins inspect archived chats and removed messages', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
    chatGroupFindUniqueMock.mockResolvedValue({
      id: 'chat_1',
      userIds: ['user_1'],
      archivedAt: new Date('2026-04-14T00:00:00.000Z'),
    });
    messagesCountMock.mockResolvedValue(1);
    messagesFindManyMock.mockResolvedValue([
      {
        id: 'm_removed',
        chatId: 'chat_1',
        body: 'removed for moderation',
        userId: 'user_2',
        sentTime: new Date('2026-04-14T01:00:00.000Z'),
        removedAt: new Date('2026-04-14T02:00:00.000Z'),
      },
    ]);

    const response = await GET(requestFor('?limit=10&index=0&order=asc'), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(ensureUserHasAcceptedChatTermsMock).not.toHaveBeenCalled();
    expect(messagesFindManyMock).toHaveBeenCalledWith({
      where: { chatId: 'chat_1' },
      orderBy: { sentTime: 'asc' },
      skip: 0,
      take: 10,
    });
    expect(json.messages[0].$id).toBe('m_removed');
  });

  it('returns the thrown chat-terms response instead of a 500', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    ensureUserHasAcceptedChatTermsMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Chat terms acceptance required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(requestFor(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Chat terms acceptance required');
    expect(chatGroupFindUniqueMock).not.toHaveBeenCalled();
  });
});
