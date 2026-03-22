/** @jest-environment node */

import crypto from 'crypto';
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

  it('stores invite-provided names when creating auth and profile records', async () => {
    const tx: any = {
      authUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
        update: jest.fn(),
      },
      userData: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
        update: jest.fn(),
      },
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'user_abc' }),
      },
    };

    const now = new Date('2020-01-01T00:00:00.000Z');
    await ensureAuthUserAndUserDataByEmail(tx, 'casey@example.com', now, {
      firstName: 'Casey',
      lastName: 'Official',
    });

    expect(tx.authUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Casey Official',
        }),
      }),
    );
    expect(tx.userData.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'Casey',
          lastName: 'Official',
          userName: expect.stringMatching(/^casey\.official\d{4}$/),
        }),
      }),
    );
  });

  it('backfills missing names for existing placeholder rows without overriding populated values', async () => {
    const tx: any = {
      authUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_abc',
          email: 'casey@example.com',
          name: null,
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'user_abc' }),
      },
      userData: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_abc',
          firstName: null,
          lastName: 'Existing',
          userName: 'invited-userabc',
        }),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'user_abc' }),
      },
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sensitive_1', userId: 'user_abc', email: 'casey@example.com' }),
        upsert: jest.fn().mockResolvedValue({ id: 'sensitive_1' }),
      },
    };

    const now = new Date('2020-01-01T00:00:00.000Z');
    await ensureAuthUserAndUserDataByEmail(tx, 'casey@example.com', now, {
      firstName: 'Casey',
      lastName: 'Official',
    });

    expect(tx.authUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_abc' },
        data: expect.objectContaining({ name: 'Casey Official' }),
      }),
    );
    expect(tx.userData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_abc' },
        data: expect.objectContaining({ firstName: 'Casey' }),
      }),
    );
    expect(tx.userData.update.mock.calls[0]?.[0]?.data?.lastName).toBeUndefined();
  });

  it('retries username generation when first.last#### collides', async () => {
    const randomIntSpy = jest.spyOn(crypto, 'randomInt')
      .mockReturnValueOnce(1234)
      .mockReturnValueOnce(4321);

    try {
      const tx: any = {
        authUser: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
          update: jest.fn(),
        },
        userData: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn()
            .mockResolvedValueOnce({ id: 'existing_user' })
            .mockResolvedValueOnce(null),
          create: jest.fn().mockResolvedValue({ id: 'user_abc' }),
          update: jest.fn(),
        },
        sensitiveUserData: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'user_abc' }),
        },
      };

      const now = new Date('2020-01-01T00:00:00.000Z');
      await ensureAuthUserAndUserDataByEmail(tx, 'casey@example.com', now, {
        firstName: 'Casey',
        lastName: 'Official',
      });

      expect(tx.userData.findFirst).toHaveBeenCalledTimes(2);
      expect(tx.userData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userName: 'casey.official4321',
          }),
        }),
      );
    } finally {
      randomIntSpy.mockRestore();
    }
  });
});

