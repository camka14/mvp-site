/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const chatGroupFindUniqueMock = jest.fn();
const chatGroupUpdateMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
      update: (...args: any[]) => chatGroupUpdateMock(...args),
    },
  },
}));

import { GET, POST } from '@/app/api/chat/groups/[id]/mute/route';

const getRequest = () => new NextRequest('http://localhost/api/chat/groups/chat_1/mute', { method: 'GET' });
const postRequest = (muted: boolean) => new NextRequest('http://localhost/api/chat/groups/chat_1/mute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ muted }),
});

describe('/api/chat/groups/[id]/mute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('returns current mute status for a member', async () => {
    chatGroupFindUniqueMock.mockResolvedValue({
      userIds: ['user_1', 'user_2'],
      mutedUserIds: ['user_1'],
    });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      chatId: 'chat_1',
      userId: 'user_1',
      muted: true,
    });
  });

  it('updates mute status for the current member only', async () => {
    chatGroupFindUniqueMock.mockResolvedValue({
      userIds: ['user_1', 'user_2'],
      mutedUserIds: ['user_2'],
    });
    chatGroupUpdateMock.mockResolvedValue({
      mutedUserIds: ['user_2', 'user_1'],
    });

    const response = await POST(postRequest(true), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(200);
    expect(chatGroupUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat_1' },
      data: expect.objectContaining({
        mutedUserIds: ['user_2', 'user_1'],
      }),
    }));

    await expect(response.json()).resolves.toMatchObject({ muted: true });
  });

  it('returns 403 for non-members', async () => {
    chatGroupFindUniqueMock.mockResolvedValue({
      userIds: ['user_2', 'user_3'],
      mutedUserIds: [],
    });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(403);
  });
});
