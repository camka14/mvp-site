/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  invites: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  organizationRoles: {
    findFirst: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const sendInviteEmailsMock = jest.fn();
const ensureAuthUserAndUserDataByEmailMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const canManageEventMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: (...args: any[]) => sendInviteEmailsMock(...args) }));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: (...args: any[]) => ensureAuthUserAndUserDataByEmailMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null),
  normalizeIdList: (value: unknown) => (
    Array.isArray(value)
      ? Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
      : []
  ),
}));

import { GET, POST } from '@/app/api/invites/route';

const jsonRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('/api/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.invites.findFirst.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.staffMembers.upsert.mockResolvedValue({});
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      playerIds: [],
      pending: [],
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.organizationRoles.findFirst.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      state: 'DRAFT',
    });
    canManageOrganizationMock.mockResolvedValue(true);
    canManageEventMock.mockResolvedValue(true);
    hasOrgPermissionMock.mockResolvedValue(true);
    loadCanonicalTeamByIdMock.mockResolvedValue(null);
  });

  it('scopes broad non-admin invite listing to the current session user', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    prismaMock.invites.findMany.mockResolvedValue([{
      id: 'invite_1',
      type: 'TEAM',
      email: 'user@example.com',
      status: 'PENDING',
      eventId: null,
      organizationId: null,
      teamId: 'team_1',
      userId: 'user_1',
      createdBy: 'manager_1',
      firstName: null,
      lastName: null,
      staffTypes: [],
      createdAt,
      updatedAt: createdAt,
    }]);

    const res = await GET(new NextRequest('http://localhost/api/invites?type=TEAM'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.invites.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        type: 'TEAM',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0].$id).toBe('invite_1');
  });

  it('allows team managers to list pending invites for their team', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      managerId: 'manager_1',
      captainId: '',
      headCoachId: null,
      coachIds: [],
      staffAssignments: [],
    });

    const res = await GET(new NextRequest('http://localhost/api/invites?teamId=team_1&type=TEAM'));

    expect(res.status).toBe(200);
    expect(loadCanonicalTeamByIdMock).toHaveBeenCalledWith('team_1', prismaMock);
    expect(prismaMock.invites.findMany).toHaveBeenCalledWith({
      where: {
        type: 'TEAM',
        teamId: 'team_1',
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects non-admin invite listing for a different user', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });

    const res = await GET(new NextRequest('http://localhost/api/invites?userId=user_2&type=TEAM'));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(prismaMock.invites.findMany).not.toHaveBeenCalled();
  });

  it('returns a consistent { invites: [] } response shape even for a single TEAM invite', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: true });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    prismaMock.invites.create.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      email: 'test@example.com',
      status: 'PENDING',
      eventId: null,
      organizationId: null,
      teamId: 'team_1',
      userId: 'user_1',
      createdBy: 'inviter_1',
      firstName: 'Test',
      lastName: 'User',
      createdAt,
      updatedAt: createdAt,
    });
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'TEAM', teamId: 'team_1', email: 'test@example.com', firstName: 'Test', lastName: 'User' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(Array.isArray(json.invites)).toBe(true);
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0].$id).toBe('invite_1');
    expect(json.invites[0].$createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(json.invites[0].type).toBe('TEAM');

    expect(ensureAuthUserAndUserDataByEmailMock).toHaveBeenCalledWith(
      prismaMock,
      'test@example.com',
      expect.any(Date),
      {
        firstName: 'Test',
        lastName: 'User',
      },
    );
    expect(prismaMock.teams.findUnique).toHaveBeenCalledWith({ where: { id: 'team_1' } });
    expect(prismaMock.invites.create).toHaveBeenCalledTimes(1);
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([], 'http://localhost');
  });

  it('sends email when a TEAM invite targets an invite-placeholder auth account', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_placeholder',
      email: 'placeholder@example.com',
      passwordHash: '__NO_PASSWORD__',
      lastLogin: null,
      emailVerifiedAt: null,
    });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_placeholder',
      type: 'TEAM',
      email: 'placeholder@example.com',
      status: 'PENDING',
      eventId: null,
      organizationId: null,
      teamId: 'team_1',
      userId: 'user_placeholder',
      createdBy: 'captain_1',
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([createdInvite]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'TEAM', teamId: 'team_1', userId: 'user_placeholder' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].$id).toBe('invite_placeholder');
    expect(ensureAuthUserAndUserDataByEmailMock).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([createdInvite], 'http://localhost');
  });

  it('does not send delivery again when a TEAM user-id invite already exists', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'player@example.com',
      passwordHash: 'hash',
      lastLogin: new Date('2026-01-01T00:00:00.000Z'),
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const existingInvite = {
      id: 'invite_existing_team',
      type: 'TEAM',
      email: 'player@example.com',
      status: 'PENDING',
      eventId: null,
      organizationId: null,
      teamId: 'team_1',
      userId: 'user_existing',
      createdBy: 'captain_1',
      firstName: null,
      lastName: null,
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.findFirst.mockResolvedValue(existingInvite);
    prismaMock.invites.update.mockResolvedValue(existingInvite);
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'TEAM', teamId: 'team_1', userId: 'user_existing' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].$id).toBe('invite_existing_team');
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
    expect(prismaMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_existing_team' },
      data: expect.objectContaining({
        email: 'player@example.com',
        status: 'PENDING',
      }),
    });
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([], 'http://localhost');
  });

  it('uses forwarded request origin when sending EVENT invite emails', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: false });
    const originalBaseUrl = process.env.PUBLIC_WEB_BASE_URL;
    process.env.PUBLIC_WEB_BASE_URL = 'https://bracket-iq.com';

    try {
      const createdAt = new Date('2020-01-01T00:00:00.000Z');
      const createdInvite = {
        id: 'invite_forwarded',
        type: 'EVENT',
        email: 'forwarded@example.com',
        status: 'PENDING',
        eventId: 'event_1',
        organizationId: null,
        teamId: null,
        userId: 'user_1',
        createdBy: 'inviter_1',
        firstName: null,
        lastName: null,
        createdAt,
        updatedAt: createdAt,
      };
      prismaMock.invites.create.mockResolvedValue(createdInvite);
      sendInviteEmailsMock.mockResolvedValue([createdInvite]);

      const res = await POST(
        jsonRequest(
          { invites: [{ type: 'EVENT', eventId: 'event_1', email: 'forwarded@example.com' }] },
          { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'bracket-iq.com' },
        ),
      );

      expect(res.status).toBe(201);
      expect(sendInviteEmailsMock).toHaveBeenCalledWith([createdInvite], 'https://bracket-iq.com');
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.PUBLIC_WEB_BASE_URL;
      } else {
        process.env.PUBLIC_WEB_BASE_URL = originalBaseUrl;
      }
    }
  });

  it('returns FAILED status when invite email delivery fails', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: false });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_failed_email',
      type: 'EVENT',
      email: 'failed@example.com',
      status: 'PENDING',
      eventId: 'event_1',
      organizationId: null,
      teamId: null,
      userId: 'user_1',
      createdBy: 'inviter_1',
      firstName: 'Fail',
      lastName: 'Case',
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([{ ...createdInvite, status: 'FAILED' }]);

    const res = await POST(
      jsonRequest({
        invites: [{ type: 'EVENT', eventId: 'event_1', email: 'failed@example.com', firstName: 'Fail', lastName: 'Case' }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0]).toEqual(expect.objectContaining({
      $id: 'invite_failed_email',
      status: 'FAILED',
    }));
  });

  it('creates an event-scoped STAFF invite without an organizationId', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_staff_1', authUserExisted: false });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_staff_event_1',
      type: 'STAFF',
      email: 'staff@example.com',
      status: 'PENDING',
      eventId: 'event_1',
      organizationId: null,
      teamId: null,
      userId: 'user_staff_1',
      createdBy: 'host_1',
      firstName: 'Sam',
      lastName: 'Staff',
      staffTypes: ['OFFICIAL'],
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([createdInvite]);

    const res = await POST(
      jsonRequest({
        invites: [{
          type: 'STAFF',
          eventId: 'event_1',
          email: 'staff@example.com',
          firstName: 'Sam',
          lastName: 'Staff',
          staffTypes: ['OFFICIAL'],
          replaceStaffTypes: true,
        }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].type).toBe('STAFF');
    expect(prismaMock.events.findUnique).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      select: { id: true, hostId: true, assistantHostIds: true, organizationId: true, state: true },
    });
    expect(canManageEventMock).toHaveBeenCalledWith(
      { userId: 'host_1', isAdmin: false },
      expect.objectContaining({ id: 'event_1' }),
      prismaMock,
    );
    expect(prismaMock.staffMembers.upsert).not.toHaveBeenCalled();
    expect(prismaMock.invites.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STAFF',
        eventId: 'event_1',
        organizationId: null,
        staffTypes: ['OFFICIAL'],
        userId: 'user_staff_1',
      }),
    });
  });

  it('rejects organization-scoped STAFF invites for the organization owner', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      passwordHash: 'hash',
      lastLogin: new Date('2020-01-01T00:00:00.000Z'),
      emailVerifiedAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const res = await POST(
      jsonRequest({
        invites: [{
          type: 'STAFF',
          organizationId: 'org_1',
          userId: 'owner_1',
          staffTypes: ['HOST'],
        }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('Organization owner already has staff access');
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      { userId: 'owner_1', isAdmin: false },
      expect.objectContaining({ id: 'org_1', ownerId: 'owner_1' }),
      'staff.manage',
      prismaMock,
    );
    expect(prismaMock.staffMembers.upsert).not.toHaveBeenCalled();
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
  });

  it('uses organization role selection as the source of staff type for organization STAFF invites', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_staff_1', authUserExisted: true });
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_scheduler',
      name: 'Scheduler',
      kind: 'STAFF',
      systemKey: null,
    });
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      roleId: 'role_host',
      types: ['HOST'],
    });

    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const createdInvite = {
      id: 'invite_staff_org_role',
      type: 'STAFF',
      email: 'staff@example.com',
      status: 'PENDING',
      eventId: null,
      organizationId: 'org_1',
      teamId: null,
      userId: 'user_staff_1',
      createdBy: 'owner_1',
      firstName: 'Sam',
      lastName: 'Staff',
      staffTypes: ['STAFF'],
      createdAt,
      updatedAt: createdAt,
    };
    prismaMock.invites.create.mockResolvedValue(createdInvite);
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{
          type: 'STAFF',
          organizationId: 'org_1',
          email: 'staff@example.com',
          firstName: 'Sam',
          lastName: 'Staff',
          staffTypes: ['HOST'],
          roleId: 'role_scheduler',
          replaceStaffTypes: true,
        }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].staffTypes).toEqual(['STAFF']);
    expect(prismaMock.organizationRoles.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'role_scheduler',
        organizationId: 'org_1',
      },
      select: {
        id: true,
        name: true,
        kind: true,
        systemKey: true,
      },
    });
    expect(prismaMock.staffMembers.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: 'org_1',
          userId: 'user_staff_1',
        },
      },
      create: expect.objectContaining({
        organizationId: 'org_1',
        userId: 'user_staff_1',
        types: ['STAFF'],
        roleId: 'role_scheduler',
      }),
      update: expect.objectContaining({
        types: { set: ['STAFF'] },
        roleId: 'role_scheduler',
      }),
    });
    expect(prismaMock.invites.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        staffTypes: ['STAFF'],
        userId: 'user_staff_1',
      }),
    });
  });

  it('replaces staff types on an existing event-scoped STAFF invite when requested', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_staff_1', authUserExisted: true });
    prismaMock.invites.findFirst.mockResolvedValue({
      id: 'invite_existing',
      type: 'STAFF',
      eventId: 'event_1',
      organizationId: null,
      userId: 'user_staff_1',
      firstName: 'Sam',
      lastName: 'Staff',
      staffTypes: ['OFFICIAL'],
    });
    prismaMock.invites.update.mockResolvedValue({
      id: 'invite_existing',
      type: 'STAFF',
      eventId: 'event_1',
      organizationId: null,
      userId: 'user_staff_1',
      firstName: 'Sam',
      lastName: 'Staff',
      status: 'PENDING',
      email: 'staff@example.com',
      staffTypes: ['HOST'],
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{
          type: 'STAFF',
          eventId: 'event_1',
          email: 'staff@example.com',
          staffTypes: ['HOST'],
          replaceStaffTypes: true,
        }],
      }),
    );

    expect(res.status).toBe(201);
    expect(prismaMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_existing' },
      data: expect.objectContaining({
        email: 'staff@example.com',
        staffTypes: ['HOST'],
      }),
    });
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([], 'http://localhost');
  });

  it('silently skips STAFF invite entries by userId when no email can be resolved', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
    sendInviteEmailsMock.mockResolvedValue([]);

    const res = await POST(
      jsonRequest({
        invites: [{
          type: 'STAFF',
          eventId: 'event_1',
          userId: 'child_profile_only_1',
          staffTypes: ['OFFICIAL'],
        }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites).toEqual([]);
    expect(prismaMock.invites.create).not.toHaveBeenCalled();
    expect(prismaMock.invites.update).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([], 'http://localhost');
  });

  it('rolls back earlier staged invites when a later invite in the batch fails validation', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });

    const stagedInvites: Array<{ id: string }> = [];
    const committedInviteIds: string[] = [];
    const txMock = {
      ...prismaMock,
      invites: {
        ...prismaMock.invites,
        create: jest.fn(),
      },
      teams: {
        ...prismaMock.teams,
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1',
          playerIds: [],
          pending: [],
        }),
      },
    };

    ensureAuthUserAndUserDataByEmailMock
      .mockResolvedValueOnce({ userId: 'user_ok', authUserExisted: false })
      .mockResolvedValueOnce({ userId: 'user_invalid', authUserExisted: false });

    prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
      txMock.invites.create.mockImplementation(async ({ data }: any) => {
        const record = {
          ...data,
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
          updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        };
        stagedInvites.push({ id: record.id });
        return record;
      });

      try {
        const result = await fn(txMock);
        committedInviteIds.push(...stagedInvites.map((invite) => invite.id));
        return result;
      } catch (error) {
        return Promise.reject(error);
      }
    });

    const res = await POST(
      jsonRequest({
        invites: [
          { type: 'TEAM', teamId: 'team_1', email: 'ok@example.com' },
          { type: 'TEAM', email: 'broken@example.com' },
        ],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Team invites require teamId' });
    expect(txMock.invites.create).toHaveBeenCalledTimes(1);
    expect(committedInviteIds).toEqual([]);
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
  });
});
