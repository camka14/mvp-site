/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  pushDeviceTarget: {
    count: jest.fn(),
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const registerPushDeviceTargetMock = jest.fn();
const unregisterPushDeviceTargetMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/pushNotifications', () => ({
  registerPushDeviceTarget: (...args: any[]) => registerPushDeviceTargetMock(...args),
  unregisterPushDeviceTarget: (...args: any[]) => unregisterPushDeviceTargetMock(...args),
}));

import { DELETE, GET, POST } from '@/app/api/messaging/topics/[topicId]/subscriptions/route';

const postRequest = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/user_user_1/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const deleteRequest = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/user_user_1/subscriptions', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const getRequest = (query = '') => new NextRequest(`http://localhost/api/messaging/topics/user_user_1/subscriptions${query}`, {
  method: 'GET',
});

describe('/api/messaging/topics/[topicId]/subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    registerPushDeviceTargetMock.mockResolvedValue(undefined);
    unregisterPushDeviceTargetMock.mockResolvedValue(undefined);
    prismaMock.pushDeviceTarget.count.mockResolvedValue(0);
    prismaMock.pushDeviceTarget.findUnique.mockResolvedValue(null);
  });

  it('registers push token metadata when subscribing', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({ id: 'user_user_1', userIds: ['user_2'] });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_2', 'user_1'],
      hostId: 'user_2',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await POST(postRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    expect(registerPushDeviceTargetMock).toHaveBeenCalledWith({
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    });
  });

  it('removes push token metadata when unsubscribing', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({ id: 'user_user_1', userIds: ['user_1', 'user_2'] });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_2'],
      hostId: 'user_1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await DELETE(deleteRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    expect(unregisterPushDeviceTargetMock).toHaveBeenCalledWith({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    });
  });

  it('returns push target debug status for the current user', async () => {
    prismaMock.pushDeviceTarget.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prismaMock.pushDeviceTarget.findUnique.mockResolvedValue({
      id: 'target_1',
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      lastSeenAt: new Date('2024-01-03T00:00:00.000Z'),
    });

    const res = await GET(getRequest('?userId=user_1&pushToken=push_token_1'), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topicId: 'user_user_1',
      userId: 'user_1',
      hasAnyTargetForUser: true,
      hasTopicTargetForUser: true,
      hasProvidedTokenForUser: true,
      hasProvidedTokenOnTopic: true,
      tokenRecordPushTarget: 'user_user_1',
      tokenRecordPushPlatform: 'android',
    });
  });

  it('rejects non-admin user debug checks for another user id', async () => {
    const res = await GET(getRequest('?userId=another_user'), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(403);
  });
});
