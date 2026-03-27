/** @jest-environment node */

import { NextRequest } from 'next/server';

const chatGroupFindManyMock = jest.fn();
const messagesGroupByMock = jest.fn();
const messagesFindManyMock = jest.fn();
const requireSessionMock = jest.fn();
const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));
const withLegacyFieldsMock = jest.fn((row: any) => ({ ...row, $id: row.id }));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findMany: (...args: any[]) => chatGroupFindManyMock(...args),
    },
    messages: {
      groupBy: (...args: any[]) => messagesGroupByMock(...args),
      findMany: (...args: any[]) => messagesFindManyMock(...args),
    },
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/server/legacyFormat', () => ({
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
  withLegacyFields: (row: any) => withLegacyFieldsMock(row),
}));

import { GET } from '@/app/api/chat/groups/route';

describe('/api/chat/groups GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns unread counts and last message summary without per-group fanout', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    chatGroupFindManyMock.mockResolvedValue([
      { id: 'chat_1', userIds: ['user_1', 'user_2'], updatedAt: new Date('2026-03-20T00:00:00.000Z') },
      { id: 'chat_2', userIds: ['user_1', 'user_3'], updatedAt: new Date('2026-03-19T00:00:00.000Z') },
    ]);
    messagesGroupByMock.mockResolvedValue([
      { chatId: 'chat_1', _count: { _all: 3 } },
    ]);
    messagesFindManyMock.mockResolvedValue([
      {
        id: 'msg_1',
        chatId: 'chat_1',
        userId: 'user_2',
        body: 'hello',
        sentTime: new Date('2026-03-21T12:00:00.000Z'),
        readByIds: ['user_2'],
      },
      {
        id: 'msg_2',
        chatId: 'chat_2',
        userId: 'user_3',
        body: 'world',
        sentTime: new Date('2026-03-21T10:00:00.000Z'),
        readByIds: ['user_3'],
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/chat/groups?userId=user_1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(messagesGroupByMock).toHaveBeenCalledTimes(1);
    expect(messagesFindManyMock).toHaveBeenCalledTimes(1);
    expect(json.groups).toHaveLength(2);
    expect(json.groups[0].unreadCount).toBe(3);
    expect(json.groups[0].lastMessage?.$id).toBe('msg_1');
    expect(json.groups[1].unreadCount).toBe(0);
    expect(json.groups[1].lastMessage?.$id).toBe('msg_2');
  });

  it('returns 403 when requesting another user without admin access', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_a', isAdmin: false });

    const response = await GET(new NextRequest('http://localhost/api/chat/groups?userId=user_b'));

    expect(response.status).toBe(403);
    expect(chatGroupFindManyMock).not.toHaveBeenCalled();
    expect(messagesGroupByMock).not.toHaveBeenCalled();
    expect(messagesFindManyMock).not.toHaveBeenCalled();
  });
});
