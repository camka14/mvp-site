/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
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
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => {
  const actual = jest.requireActual('@/lib/permissions');
  return {
    ...actual,
    requireSession: requireSessionMock,
  };
});
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));

import { PATCH as patchUserById } from '@/app/api/users/[id]/route';

const buildJsonRequest = (url: string, body: unknown, method = 'PATCH'): NextRequest => (
  new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
);

describe('PATCH /api/users/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      appleSubject: null,
      googleSubject: null,
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      requiredProfileFieldsCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
  });

  it('returns 409 when requested username already exists for a different user', async () => {
    prismaMock.userData.findFirst.mockResolvedValue({ id: 'user_other' });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { userName: 'TakenName' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Username already in use.');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });

  it('updates profile when username is available', async () => {
    prismaMock.userData.findFirst.mockResolvedValue(null);
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      firstName: 'Test',
      lastName: 'User',
      userName: 'updated_name',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { userName: 'updated_name' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.user.$id).toBe('user_1');
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ userName: 'updated_name' }),
    }));
    expect(prismaMock.authUser.update).not.toHaveBeenCalled();
  });

  it('syncs the auth display name when profile names change', async () => {
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      firstName: 'Samuel',
      lastName: 'Razumovskiy',
      userName: 'testuser',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', {
        data: { firstName: 'Samuel', lastName: 'Razumovskiy' },
      }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.authUser.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ name: 'Samuel Razumovskiy' }),
    }));
  });

  it('rejects setting homePageOrganizationId when the user is not an org owner/host/official', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'other_user',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { homePageOrganizationId: 'org_1' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('owners, hosts, or officials');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });

  it('allows setting homePageOrganizationId when the user is a host', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'other_user',
    });
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      organizationId: 'org_1',
      userId: 'user_1',
      types: ['HOST'],
    });
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      homePageOrganizationId: 'org_1',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { homePageOrganizationId: 'org_1' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ homePageOrganizationId: 'org_1' }),
    }));
  });

  it('allows clearing homePageOrganizationId', async () => {
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      homePageOrganizationId: null,
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { homePageOrganizationId: null } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ homePageOrganizationId: null }),
    }));
  });

  it('returns 403 when a non-admin attempts to update another user', async () => {
    await expect(
      patchUserById(
        buildJsonRequest('http://localhost/api/users/user_2', { data: { teamIds: [] } }),
        { params: Promise.resolve({ id: 'user_2' }) },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });

  it('rejects direct teamIds patches because membership is derived', async () => {
    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { teamIds: ['team_1'] } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('teamIds is derived');
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });
});
