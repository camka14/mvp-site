/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  invites: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
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

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: (...args: any[]) => sendInviteEmailsMock(...args) }));
jest.mock('@/server/inviteUsers', () => ({
  ensureAuthUserAndUserDataByEmail: (...args: any[]) => ensureAuthUserAndUserDataByEmailMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
}));

import { POST } from '@/app/api/invites/route';

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
    prismaMock.invites.findFirst.mockResolvedValue(null);
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
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      organizationId: null,
      state: 'DRAFT',
    });
    canManageOrganizationMock.mockResolvedValue(true);
    canManageEventMock.mockResolvedValue(true);
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

  it('uses forwarded request origin when sending EVENT invite emails', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'inviter_1', isAdmin: false });
    ensureAuthUserAndUserDataByEmailMock.mockResolvedValue({ userId: 'user_1', authUserExisted: false });

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
        { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mvp.razumly.com' },
      ),
    );

    expect(res.status).toBe(201);
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([createdInvite], 'https://mvp.razumly.com');
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
      staffTypes: ['REFEREE'],
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
          staffTypes: ['REFEREE'],
          replaceStaffTypes: true,
        }],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.invites[0].type).toBe('STAFF');
    expect(prismaMock.events.findUnique).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      select: { id: true, hostId: true, organizationId: true, state: true },
    });
    expect(canManageEventMock).toHaveBeenCalledWith(
      { userId: 'host_1', isAdmin: false },
      expect.objectContaining({ id: 'event_1' }),
    );
    expect(prismaMock.staffMembers.upsert).not.toHaveBeenCalled();
    expect(prismaMock.invites.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STAFF',
        eventId: 'event_1',
        organizationId: null,
        staffTypes: ['REFEREE'],
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
      staffTypes: ['REFEREE'],
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
  });
});
