/** @jest-environment node */

const prismaMock = {
  $executeRaw: jest.fn(),
  pushDeviceTarget: {
    deleteMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/notificationPreferences', () => ({
  filterUserIdsForNotificationChannel: jest.fn(),
}));
jest.mock('@/server/firebaseAdmin', () => ({
  getFirebaseMessagingClient: jest.fn(),
  isFirebaseMessagingEnabled: jest.fn(),
}));

import {
  unregisterPushDeviceTarget,
  unregisterPushDeviceTargetForUser,
} from '@/server/pushNotifications';

describe('push device target cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.pushDeviceTarget.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('scopes token cleanup to the authorized user IDs', async () => {
    await unregisterPushDeviceTarget({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
    });

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    const [query, token, userIds] = prismaMock.$executeRaw.mock.calls[0];
    expect(query.join('')).toContain('"userId" = ANY');
    expect(token).toBe('push_token_1');
    expect(userIds).toEqual(['user_1']);
  });

  it('does not perform a token-only delete without an authorized user', async () => {
    await unregisterPushDeviceTarget({
      userIds: [],
      pushToken: 'another_users_push_token',
    });

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('uses the authenticated account in the logout-specific delete', async () => {
    await unregisterPushDeviceTargetForUser({
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    });

    expect(prismaMock.pushDeviceTarget.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        pushToken: 'push_token_1',
        pushTarget: 'user_user_1',
      },
    });
  });
});
