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
      teamIds: ['legacy_only'],
    });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { userId: 'user_1', teamId: 'team_current' },
    ]);

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { userName: 'updated_name' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.user.id).toBe('user_1');
    expect(json.user.teamIds).toEqual(['team_current']);
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ userName: 'updated_name' }),
    }));
    expect(prismaMock.authUser.update).not.toHaveBeenCalled();
  });

  it('rejects a future date of birth before updating the profile', async () => {
    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { dateOfBirth: '2999-01-01' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('dateOfBirth cannot be in the future.');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
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

  it('rejects setting homePageOrganizationId when the user is not an organization member', async () => {
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
    expect(json.error).toContain('organization members');
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

  it('updates onboardingIntent when the selection is valid', async () => {
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      onboardingIntent: 'INDIVIDUAL_EVENTS',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { onboardingIntent: 'individual_events' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ onboardingIntent: 'INDIVIDUAL_EVENTS' }),
    }));
  });

  it('rejects invalid onboardingIntent values', async () => {
    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { onboardingIntent: 'something_else' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('onboardingIntent is invalid.');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });

  it('updates accountVisibility when the value is valid', async () => {
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      accountVisibility: 'PRIVATE_TO_ORGS',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { accountVisibility: 'private' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ accountVisibility: 'PRIVATE_TO_ORGS' }),
    }));
  });

  it('rejects invalid accountVisibility values', async () => {
    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { accountVisibility: 'friends_only' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('accountVisibility is invalid.');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
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

  it('rejects client attempts to self-assert verification or Stripe connection state', async () => {
    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', {
        data: {
          dobVerified: true,
          dobVerifiedAt: '2026-07-11T00:00:00.000Z',
          ageVerificationProvider: 'client',
          hasStripeAccount: true,
        },
      }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.fields).toEqual([
      'dobVerified',
      'dobVerifiedAt',
      'ageVerificationProvider',
      'hasStripeAccount',
    ]);
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });
});
