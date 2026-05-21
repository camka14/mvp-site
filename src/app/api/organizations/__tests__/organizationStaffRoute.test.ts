/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  organizationRoles: {
    findFirst: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: unknown[]) => hasOrgPermissionMock(...args),
}));

import { PATCH } from '@/app/api/organizations/[id]/staff/route';

describe('/api/organizations/[id]/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      id: 'staff_1',
      organizationId: 'org_1',
      userId: 'user_1',
      types: ['STAFF'],
      roleId: null,
    });
  });

  it('rejects assigning a role that does not belong to the organization', async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/staff', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: 'user_1',
          roleId: 'role_other_org',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Role not found');
    expect(prismaMock.staffMembers.update).not.toHaveBeenCalled();
  });

  it('updates the staff member role and derives the staff type from the selected role', async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_official',
      name: 'Official',
      kind: 'OFFICIAL',
      systemKey: 'OFFICIAL',
    });
    prismaMock.staffMembers.update.mockResolvedValue({
      id: 'staff_1',
      organizationId: 'org_1',
      userId: 'user_1',
      types: ['OFFICIAL'],
      roleId: 'role_official',
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/staff', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: 'user_1',
          roleId: 'role_official',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.staffMember.roleId).toBe('role_official');
    expect(prismaMock.organizationRoles.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'role_official',
        organizationId: 'org_1',
      },
      select: {
        id: true,
        name: true,
        kind: true,
        systemKey: true,
      },
    });
    expect(prismaMock.staffMembers.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'staff_1' },
      data: expect.objectContaining({
        types: ['OFFICIAL'],
        roleId: 'role_official',
      }),
    }));
  });
});
