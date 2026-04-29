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
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    sendInviteEmailsMock.mockResolvedValue([]);
    txMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Test team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
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
    txMock.invites.create.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      email: 'free@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'free_1',
      createdBy: 'manager_1',
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
        divisionTypeName: 'Open',
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

  it('creates a player invite and reserves selected future event teams as pending', async () => {
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
    expect(txMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_1' },
      data: expect.objectContaining({
        pending: ['free_1'],
      }),
    }));
    expect(txMock.eventRegistrations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'legacy_free_agent_registration' },
      create: expect.objectContaining({
        id: 'legacy_free_agent_registration',
        eventId: 'event_1',
        registrantId: 'free_1',
        rosterRole: 'PARTICIPANT',
        status: 'STARTED',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'team_1__free_1',
      }),
      update: expect.objectContaining({
        rosterRole: 'PARTICIPANT',
        status: 'STARTED',
        eventTeamId: 'event_team_1',
      }),
    }));
    expect(txMock.teamInviteEventSyncs.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        inviteId: 'invite_1',
        canonicalTeamId: 'team_1',
        eventId: 'event_1',
        eventTeamId: 'event_team_1',
        userId: 'free_1',
        eventTeamHadUser: false,
        eventTeamHadPendingUser: false,
        status: 'PENDING',
      }),
    }));
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'invite_1' })], 'http://localhost');
  });

  it('rejects player invites when team registrations already fill the team', async () => {
    txMock.canonicalTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Test team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
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
          eventTeamIds: [],
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
});
