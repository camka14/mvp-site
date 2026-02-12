/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const sendPushToUsersMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args) }));

import { POST } from '@/app/api/messaging/topics/[topicId]/messages/route';

const requestFor = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/topic_1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/messaging/topics/[topicId]/messages POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 2,
      tokenCount: 2,
      successCount: 2,
      failureCount: 0,
      prunedTokenCount: 0,
    });
  });

  it('resolves recipients from topic membership and excludes sender', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({ userIds: ['user_1', 'user_2', 'user_3'] });

    const res = await POST(requestFor({ title: 'New message', body: 'Hello' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_2', 'user_3'],
      title: 'New message',
      body: 'Hello',
    }));
    expect(json.recipientUserIds).toEqual(['user_2', 'user_3']);
  });

  it('rejects sender spoofing for non-admin sessions', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });

    const res = await POST(requestFor({ title: 'x', body: 'y', senderId: 'user_999' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });

    expect(res.status).toBe(403);
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });
});
