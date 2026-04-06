/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    authUser: {
      findUnique: jest.fn(),
    },
    organizations: {
      findUnique: jest.fn(),
    },
    staffMembers: {
      findUnique: jest.fn(),
    },
    invites: {
      findMany: jest.fn(),
    },
  },
}));

import { canManageOrganization } from '@/server/accessControl';

describe('canManageOrganization', () => {
  it('allows verified razumly admins to manage any organization', async () => {
    const allowed = await canManageOrganization(
      { userId: 'raz_admin_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1', hostIds: [], officialIds: [] },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue({
            email: 'admin@razumly.com',
            emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        invites: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    );

    expect(allowed).toBe(true);
  });

  it('still allows direct organization owners without consulting razumly admin lookup', async () => {
    const authUserLookup = jest.fn();
    const allowed = await canManageOrganization(
      { userId: 'owner_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1', hostIds: [], officialIds: [] },
      {
        authUser: {
          findUnique: authUserLookup,
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn(),
        },
        invites: {
          findMany: jest.fn(),
        },
      },
    );

    expect(allowed).toBe(true);
    expect(authUserLookup).not.toHaveBeenCalled();
  });
});
