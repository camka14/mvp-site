/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: jest.fn(),
}));
jest.mock('@/server/publicOrganizationCatalog', () => ({
  getPublicOrganizationBySlug: jest.fn(),
}));

import { ensureGuestChildUserData } from '@/server/publicGuestRegistration';

describe('public guest registration helpers', () => {
  it('creates child UserData without creating email-backed sensitive data', async () => {
    const tx = {
      userData: {
        create: jest.fn().mockResolvedValue({}),
      },
      sensitiveUserData: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
      authUser: {
        create: jest.fn(),
      },
    };

    const result = await ensureGuestChildUserData(tx as any, {
      firstName: 'Casey',
      lastName: 'Parent',
      dateOfBirth: new Date('2015-05-10T00:00:00.000Z'),
    }, new Date('2026-06-16T00:00:00.000Z'));

    expect(result.userId).toEqual(expect.any(String));
    expect(tx.userData.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Casey',
        lastName: 'Parent',
        dateOfBirth: new Date('2015-05-10T00:00:00.000Z'),
        userName: expect.stringMatching(/^guest-child-/),
      }),
    });
    expect(tx.sensitiveUserData.create).not.toHaveBeenCalled();
    expect(tx.sensitiveUserData.upsert).not.toHaveBeenCalled();
    expect(tx.authUser.create).not.toHaveBeenCalled();
  });
});
