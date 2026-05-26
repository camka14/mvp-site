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
    organizationRoles: {
      findFirst: jest.fn(),
    },
    organizationRolePermissions: {
      findFirst: jest.fn(),
    },
    invites: {
      findMany: jest.fn(),
    },
  },
}));

import { canManageEvent, canManageOrganization, canOfficialOrganization } from '@/server/accessControl';

describe('canManageOrganization', () => {
  it('allows verified razumly admins to manage any organization', async () => {
    const allowed = await canManageOrganization(
      { userId: 'raz_admin_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
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
        organizationRoles: {
          findFirst: jest.fn(),
        },
        organizationRolePermissions: {
          findFirst: jest.fn(),
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
      { id: 'org_1', ownerId: 'owner_1' },
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
        organizationRoles: {
          findFirst: jest.fn(),
        },
        organizationRolePermissions: {
          findFirst: jest.fn(),
        },
        invites: {
          findMany: jest.fn(),
        },
      },
    );

    expect(allowed).toBe(true);
    expect(authUserLookup).not.toHaveBeenCalled();
  });

  it('allows staff with an assigned role permission to manage an organization', async () => {
    const allowed = await canManageOrganization(
      { userId: 'staff_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn().mockResolvedValue({
            organizationId: 'org_1',
            userId: 'staff_1',
            types: ['OFFICIAL'],
            roleId: 'role_manager',
          }),
        },
        organizationRoles: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'role_manager',
            organizationId: 'org_1',
          }),
        },
        organizationRolePermissions: {
          findFirst: jest.fn().mockResolvedValue({
            permission: 'organization.manage',
          }),
        },
        invites: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    );

    expect(allowed).toBe(true);
  });

  it('denies staff when their assigned role lacks the management permission', async () => {
    const allowed = await canManageOrganization(
      { userId: 'official_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn().mockResolvedValue({
            organizationId: 'org_1',
            userId: 'official_1',
            types: ['OFFICIAL'],
            roleId: 'role_official',
          }),
        },
        organizationRoles: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'role_official',
            organizationId: 'org_1',
          }),
        },
        organizationRolePermissions: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        invites: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    );

    expect(allowed).toBe(false);
  });

  it('allows active official staff membership to grant organization official access', async () => {
    const allowed = await canOfficialOrganization(
      { userId: 'official_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn().mockResolvedValue({
            organizationId: 'org_1',
            userId: 'official_1',
            types: ['OFFICIAL'],
          }),
        },
        organizationRoles: {
          findFirst: jest.fn(),
        },
        organizationRolePermissions: {
          findFirst: jest.fn(),
        },
        invites: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    );

    expect(allowed).toBe(true);
  });

  it('blocks permission access while a staff invite is still pending', async () => {
    const rolePermissionLookup = jest.fn().mockResolvedValue({
      permission: 'organization.manage',
    });
    const allowed = await canManageOrganization(
      { userId: 'staff_1', isAdmin: false },
      { id: 'org_1', ownerId: 'owner_1' },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        organizations: {
          findUnique: jest.fn(),
        },
        staffMembers: {
          findUnique: jest.fn().mockResolvedValue({
            organizationId: 'org_1',
            userId: 'staff_1',
            types: ['STAFF'],
            roleId: 'role_staff',
          }),
        },
        organizationRoles: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'role_staff',
            organizationId: 'org_1',
          }),
        },
        organizationRolePermissions: {
          findFirst: rolePermissionLookup,
        },
        invites: {
          findMany: jest.fn().mockResolvedValue([{
            organizationId: 'org_1',
            userId: 'staff_1',
            type: 'STAFF',
            status: 'PENDING',
          }]),
        },
      },
    );

    expect(allowed).toBe(false);
    expect(rolePermissionLookup).not.toHaveBeenCalled();
  });
});

describe('canManageEvent', () => {
  it('allows verified razumly admins to manage standalone draft events', async () => {
    const organizationLookup = jest.fn();
    const allowed = await canManageEvent(
      { userId: 'raz_admin_1', isAdmin: false },
      {
        hostId: 'host_1',
        assistantHostIds: [],
        organizationId: null,
      },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue({
            email: 'admin@razumly.com',
            emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
            sessionVersion: 0,
          }),
        },
        organizations: {
          findUnique: organizationLookup,
        },
      },
    );

    expect(allowed).toBe(true);
    expect(organizationLookup).not.toHaveBeenCalled();
  });

  it('allows verified razumly admins to manage events with missing organization rows', async () => {
    const allowed = await canManageEvent(
      { userId: 'raz_admin_1', isAdmin: false },
      {
        hostId: 'host_1',
        assistantHostIds: [],
        organizationId: 'missing_org',
      },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue({
            email: 'admin@razumly.com',
            emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
            sessionVersion: 0,
          }),
        },
        organizations: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    );

    expect(allowed).toBe(true);
  });

  it('denies standalone events to unverified razumly emails', async () => {
    const allowed = await canManageEvent(
      { userId: 'raz_admin_1', isAdmin: false },
      {
        hostId: 'host_1',
        assistantHostIds: [],
        organizationId: null,
      },
      {
        authUser: {
          findUnique: jest.fn().mockResolvedValue({
            email: 'admin@razumly.com',
            emailVerifiedAt: null,
            sessionVersion: 0,
          }),
        },
        organizations: {
          findUnique: jest.fn(),
        },
      },
    );

    expect(allowed).toBe(false);
  });
});
