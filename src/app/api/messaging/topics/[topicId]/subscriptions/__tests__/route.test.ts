/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
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

import { DELETE, POST } from '@/app/api/messaging/topics/[topicId]/subscriptions/route';

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

describe('/api/messaging/topics/[topicId]/subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    registerPushDeviceTargetMock.mockResolvedValue(undefined);
    unregisterPushDeviceTargetMock.mockResolvedValue(undefined);
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
});
