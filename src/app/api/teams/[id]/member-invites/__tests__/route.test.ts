/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const sendInviteEmailsMock = jest.fn();

const txMock = {
  canonicalTeams: {
    findUnique: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  invites: {
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  teamInviteEventSyncs: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
};

const prismaMock = {
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: (...args: any[]) => sendInviteEmailsMock(...args) }));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: () => 'http://localhost' }));

import { POST } from '@/app/api/teams/[id]/member-invites/route';

describe('/api/teams/[id]/member-invites POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'team-invite-route-test-secret';
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    sendInviteEmailsMock.mockResolvedValue([]);
    txMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Test team',
      division: 'Open',
      divisionTypeId: 'open',
      wins: null,
      losses: null,
      teamSize: 6,
      profileImageId: null,
      sport: 'Basketball',
      organizationId: 'org_1',
      createdBy: 'manager_1',
      openRegistration: false,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
    });
    txMock.teamRegistrations.findMany.mockResolvedValue([
      {
        id: 'team_1__manager_1',
        teamId: 'team_1',
        userId: 'manager_1',
        status: 'ACTIVE',
        isCaptain: true,
      },
    ]);
    txMock.teamStaffAssignments.findMany.mockResolvedValue([
      {
        id: 'team_1__MANAGER__manager_1',
        teamId: 'team_1',
        userId: 'manager_1',
        role: 'MANAGER',
        status: 'ACTIVE',
      },
    ]);
    txMock.invites.findFirst.mockResolvedValue(null);
    txMock.invites.count.mockResolvedValue(0);
    txMock.invites.create.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      email: 'free@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'free_1',
      createdBy: 'manager_1',
      linkVersion: 1,
      linkExpiresAt: new Date('2026-05-13T18:00:00.000Z'),
      createdAt: new Date('2026-04-29T18:00:00.000Z'),
      updatedAt: new Date('2026-04-29T18:00:00.000Z'),
    });
    txMock.authUser.findUnique.mockResolvedValue({
      email: 'free@example.com',
      passwordHash: 'hash',
      lastLogin: new Date('2026-01-01T00:00:00.000Z'),
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    txMock.teamInviteEventSyncs.findMany.mockResolvedValue([]);
    txMock.teamRegistrations.upsert.mockResolvedValue({});
    txMock.teamStaffAssignments.upsert.mockResolvedValue({});
    txMock.teamRegistrations.findUnique.mockResolvedValue({ id: 'team_1__free_1' });
    txMock.teams.findMany.mockResolvedValue([
      {
        id: 'event_team_1',
        eventId: 'event_1',
        playerIds: [],
        pending: [],
        playerRegistrationIds: [],
        division: 'Open',
        divisionTypeId: 'open',
      },
    ]);
    txMock.events.findMany.mockResolvedValue([{ id: 'event_1' }]);
    txMock.eventRegistrations.findUnique.mockResolvedValue(null);
    txMock.eventRegistrations.findMany.mockResolvedValue([{
      id: 'legacy_free_agent_registration',
      eventId: 'event_1',
      registrantId: 'free_1',
      parentId: null,
      registrantType: 'SELF',
      rosterRole: 'FREE_AGENT',
      status: 'STARTED',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
      slotId: null,
      occurrenceDate: null,
      createdBy: 'free_1',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    }]);
    txMock.eventRegistrations.upsert.mockResolvedValue({ id: 'legacy_free_agent_registration' });
    txMock.teams.update.mockResolvedValue({});
    txMock.teamInviteEventSyncs.upsert.mockResolvedValue({});
  });

  it('creates a canonical player invite without reserving selected event teams', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'free_1',
          role: 'player',
          eventTeamIds: ['event_team_1'],
        }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(txMock.teamRegistrations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        teamId: 'team_1',
        userId: 'free_1',
        status: 'INVITED',
      }),
      update: expect.objectContaining({
        status: 'INVITED',
      }),
    }));
    expect(txMock.teams.findMany).not.toHaveBeenCalled();
    expect(txMock.teams.update).not.toHaveBeenCalled();
    expect(txMock.eventRegistrations.upsert).not.toHaveBeenCalled();
    expect(txMock.teamInviteEventSyncs.upsert).not.toHaveBeenCalled();
    expect(payload.eventSyncs).toBeUndefined();
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'invite_1' })], 'http://localhost');
  });

  it('updates an existing canonical player invite without sending delivery again', async () => {
    const existingInvite = {
      id: 'invite_existing',
      type: 'TEAM',
      email: 'free@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'free_1',
      createdBy: 'manager_1',
      linkVersion: 1,
      linkExpiresAt: new Date('2026-05-13T18:00:00.000Z'),
      firstName: null,
      lastName: null,
      createdAt: new Date('2026-04-29T18:00:00.000Z'),
      updatedAt: new Date('2026-04-29T18:00:00.000Z'),
    };
    txMock.invites.findFirst.mockResolvedValue(existingInvite);
    txMock.invites.update.mockResolvedValue(existingInvite);

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'free_1',
          role: 'player',
        }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
    expect(payload.invite.id).toBe('invite_existing');
    expect(txMock.invites.create).not.toHaveBeenCalled();
    expect(txMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_existing' },
      data: expect.objectContaining({
        email: 'free@example.com',
        status: 'PENDING',
      }),
    });
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
  });

  it('preserves an invited staff role when the same account is also invited as a player', async () => {
    const existingInvite = {
      id: 'invite_existing_staff',
      type: 'TEAM',
      email: 'free@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'free_1',
      createdBy: 'manager_1',
      staffTypes: ['ASSISTANT_COACH'],
      linkVersion: 1,
      linkExpiresAt: new Date('2026-05-13T18:00:00.000Z'),
      firstName: null,
      lastName: null,
      createdAt: new Date('2026-04-29T18:00:00.000Z'),
      updatedAt: new Date('2026-04-29T18:00:00.000Z'),
    };
    txMock.invites.findFirst.mockResolvedValue(existingInvite);
    txMock.invites.update.mockResolvedValue(existingInvite);
    txMock.teamStaffAssignments.findMany.mockResolvedValue([
      {
        id: 'team_1__MANAGER__manager_1',
        teamId: 'team_1',
        userId: 'manager_1',
        role: 'MANAGER',
        status: 'ACTIVE',
      },
      {
        id: 'team_1__ASSISTANT_COACH__free_1',
        teamId: 'team_1',
        userId: 'free_1',
        role: 'ASSISTANT_COACH',
        status: 'INVITED',
      },
    ]);

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({ userId: 'free_1', role: 'player' }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(201);
    expect(txMock.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_existing_staff' },
      data: expect.objectContaining({ staffTypes: ['ASSISTANT_COACH'] }),
    }));
    expect(txMock.teamStaffAssignments.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'free_1', role: 'ASSISTANT_COACH' }),
      data: expect.objectContaining({ status: 'REMOVED' }),
    }));
  });

  it('rejects player invites when team registrations already fill the team', async () => {
    txMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Test team',
      division: 'Open',
      divisionTypeId: 'open',
      wins: null,
      losses: null,
      teamSize: 2,
      profileImageId: null,
      sport: 'Basketball',
      organizationId: 'org_1',
      createdBy: 'manager_1',
      openRegistration: false,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
    });
    txMock.teamRegistrations.findMany.mockResolvedValue([
      {
        id: 'team_1__manager_1',
        teamId: 'team_1',
        userId: 'manager_1',
        status: 'ACTIVE',
        isCaptain: true,
      },
      {
        id: 'team_1__pending_1',
        teamId: 'team_1',
        userId: 'pending_1',
        status: 'INVITED',
        isCaptain: false,
      },
    ]);

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'free_1',
          role: 'player',
        }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Team is full. Player invite was not sent.');
    expect(txMock.invites.create).not.toHaveBeenCalled();
    expect(txMock.teamRegistrations.upsert).not.toHaveBeenCalled();
  });

  it('creates a share-only person invite without a placeholder account', async () => {
    txMock.invites.create.mockResolvedValueOnce({
      id: 'invite_share_1',
      type: 'TEAM',
      email: null,
      phone: null,
      status: 'PENDING',
      teamId: 'team_1',
      userId: null,
      createdBy: 'manager_1',
      firstName: 'Jordan',
      lastName: 'Guest',
      linkVersion: 1,
      linkExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Jordan',
          lastName: 'Guest',
          role: 'player',
          shareOnly: true,
        }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.invite.userId).toBeNull();
    expect(payload.shareUrl).toMatch(/^http:\/\/localhost\/i\/invite_share_1\?/);
    expect(txMock.invites.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        email: null,
        firstName: 'Jordan',
        lastName: 'Guest',
      }),
    });
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
    expect(txMock.teamRegistrations.upsert).not.toHaveBeenCalled();
  });

  it('creates a claimable manager invite for a person without an account', async () => {
    txMock.invites.create.mockResolvedValueOnce({
      id: 'invite_manager_1',
      type: 'TEAM',
      email: 'morgan@qa.invalid',
      phone: '+15035550118',
      status: 'PENDING',
      staffTypes: ['MANAGER'],
      teamId: 'team_1',
      userId: null,
      createdBy: 'manager_1',
      firstName: 'Morgan',
      lastName: 'Reed',
      linkVersion: 1,
      linkExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/teams/team_1/member-invites', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Morgan',
          lastName: 'Reed',
          email: 'morgan@qa.invalid',
          phone: '+15035550118',
          role: 'team_manager',
        }),
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.shareUrl).toMatch(/^http:\/\/localhost\/i\/invite_manager_1\?/);
    expect(txMock.invites.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        email: 'morgan@qa.invalid',
        phone: '+15035550118',
        staffTypes: ['MANAGER'],
      }),
    });
    expect(txMock.teamStaffAssignments.upsert).not.toHaveBeenCalled();
    expect(txMock.teamRegistrations.upsert).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'invite_manager_1' })],
      'http://localhost',
    );
  });
});
