/** @jest-environment node */

import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';

describe('ensureAuthUserAndUserDataByEmail', () => {
  it('does not derive public UserData.userName from email', async () => {
    const tx: any = {
      authUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
      },
      userData: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
      },
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sensitive_1', userId: 'user_abc', email: 'test@example.com' }),
        upsert: jest.fn().mockResolvedValue({ id: 'sensitive_1' }),
      },
    };

    const now = new Date('2020-01-01T00:00:00.000Z');
    await ensureAuthUserAndUserDataByEmail(tx, 'Test@Example.com', now);

    expect(tx.userData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userName: expect.stringMatching(/^invited-/),
        }),
      }),
    );

    const createdUserName = tx.userData.create.mock.calls[0]?.[0]?.data?.userName as string;
    expect(createdUserName).not.toBe('test');
  });
});

