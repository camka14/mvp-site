/** @jest-environment node */

import { NextRequest } from 'next/server';

const teamFindUniqueMock = jest.fn();
const teamFindManyMock = jest.fn();
const canonicalTeamFindUniqueMock = jest.fn();
const teamRegistrationsFindManyMock = jest.fn();
const teamStaffAssignmentsFindManyMock = jest.fn();
const organizationFindUniqueMock = jest.fn();
const parentChildLinkFindFirstMock = jest.fn();
const eventsFindManyMock = jest.fn();
const eventRegistrationsFindManyMock = jest.fn();
const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();

const prismaMock = {
  teams: {
    findUnique: (...args: any[]) => teamFindUniqueMock(...args),
    findMany: (...args: any[]) => teamFindManyMock(...args),
  },
  canonicalTeams: {
    findUnique: (...args: any[]) => canonicalTeamFindUniqueMock(...args),
  },
  teamRegistrations: {
    findMany: (...args: any[]) => teamRegistrationsFindManyMock(...args),
  },
  teamStaffAssignments: {
    findMany: (...args: any[]) => teamStaffAssignmentsFindManyMock(...args),
  },
  organizations: {
    findUnique: (...args: any[]) => organizationFindUniqueMock(...args),
  },
  parentChildLinks: {
    findFirst: (...args: any[]) => parentChildLinkFindFirstMock(...args),
  },
  events: {
    findMany: (...args: any[]) => eventsFindManyMock(...args),
  },
  eventRegistrations: {
    findMany: (...args: any[]) => eventRegistrationsFindManyMock(...args),
  },
  userData: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })),
}));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
}));
jest.mock('@/server/userPrivacy', () => ({
  applyUserPrivacyList: (users: any[]) => users,
  createVisibilityContext: jest.fn(),
  publicUserSelect: { id: true },
}));

import { GET } from '@/app/api/teams/[id]/invite-free-agents/route';

describe('/api/teams/[id]/invite-free-agents GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teamFindUniqueMock.mockResolvedValue({
      id: 'team_1',
      playerIds: ['captain_1', 'player_2'],
      captainId: 'captain_1',
      managerId: 'captain_1',
      headCoachId: null,
      coachIds: [],
    });
    teamFindManyMock.mockResolvedValue([]);
    eventsFindManyMock.mockResolvedValue([]);
    eventRegistrationsFindManyMock.mockResolvedValue([]);
    parentChildLinkFindFirstMock.mockResolvedValue(null);
    canonicalTeamFindUniqueMock.mockResolvedValue({
      organizationId: 'org_1',
    });
    teamRegistrationsFindManyMock.mockResolvedValue([]);
    teamStaffAssignmentsFindManyMock.mockResolvedValue([]);
    organizationFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      ownerId: 'org_owner_1',
      hostIds: [],
      officialIds: [],
    });
  });

  it('loads canonical organization teams instead of returning 404', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    teamFindUniqueMock.mockResolvedValueOnce(null);
    canonicalTeamFindUniqueMock.mockResolvedValueOnce({
      id: 'canonical_team_1',
      name: 'Canonical Team',
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
    teamRegistrationsFindManyMock.mockResolvedValue([
      {
        id: 'canonical_team_1__manager_1',
        teamId: 'canonical_team_1',
        userId: 'manager_1',
        status: 'ACTIVE',
        isCaptain: true,
      },
    ]);
    teamStaffAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'canonical_team_1__MANAGER__manager_1',
        teamId: 'canonical_team_1',
        userId: 'manager_1',
        role: 'MANAGER',
        status: 'ACTIVE',
      },
    ]);
    teamFindManyMock.mockResolvedValueOnce([{ id: 'event_team_1' }]);
    eventRegistrationsFindManyMock.mockResolvedValueOnce([]);
    eventsFindManyMock.mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/canonical_team_1/invite-free-agents'),
      { params: Promise.resolve({ id: 'canonical_team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      users: [],
      eventIds: [],
      freeAgentIds: [],
      eventTeams: [],
      freeAgentEventsByUserId: {},
      freeAgentEventTeamIdsByUserId: {},
    });
    expect(teamFindManyMock).toHaveBeenCalledWith({
      where: { parentTeamId: { in: ['canonical_team_1'] } },
      select: { id: true },
    });
    expect(eventRegistrationsFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        registrantType: 'TEAM',
        registrantId: { in: ['canonical_team_1', 'event_team_1'] },
        rosterRole: 'PARTICIPANT',
      }),
    }));
    expect(eventsFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: [] },
      }),
    }));
  });

  it('allows organization owners to view invite free agents for org teams', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'org_owner_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValue(true);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/invite-free-agents'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      users: [],
      eventIds: [],
      freeAgentIds: [],
      eventTeams: [],
      freeAgentEventsByUserId: {},
      freeAgentEventTeamIdsByUserId: {},
    });
    expect(canonicalTeamFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'team_1' },
      select: { organizationId: true },
    });
    expect(organizationFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { id: true, ownerId: true, hostIds: true, officialIds: true },
    });
    expect(canManageOrganizationMock).toHaveBeenCalledWith(
      { userId: 'org_owner_1', isAdmin: false },
      { id: 'org_1', ownerId: 'org_owner_1', hostIds: [], officialIds: [] },
    );
    expect(parentChildLinkFindFirstMock).not.toHaveBeenCalled();
  });

  it('keeps returning 403 for unrelated viewers', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'viewer_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/invite-free-agents'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(parentChildLinkFindFirstMock).toHaveBeenCalledWith({
      where: {
        parentId: 'viewer_1',
        childId: { in: ['captain_1', 'player_2'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('returns future event-team options and free-agent source event mappings', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    const start = new Date('2026-06-01T16:00:00.000Z');
    teamFindManyMock
      .mockResolvedValueOnce([{ id: 'event_team_1' }])
      .mockResolvedValueOnce([{
        id: 'event_team_1',
        eventId: 'event_1',
        name: 'Test team snapshot',
        parentTeamId: 'team_1',
      }]);
    eventsFindManyMock.mockResolvedValueOnce([{
      id: 'event_1',
      name: 'Future Event',
      start,
      end: null,
    }]);
    eventRegistrationsFindManyMock
      .mockResolvedValueOnce([
        { eventId: 'event_1', registrantId: 'event_team_1' },
      ])
      .mockResolvedValueOnce([
      { eventId: 'event_1', registrantId: 'free_registration' },
      ]);
    prismaMock.userData.findMany.mockResolvedValueOnce([
      { id: 'free_registration', firstName: 'Reg', lastName: 'Agent' },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1/invite-free-agents'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.eventTeams).toEqual([{
      eventId: 'event_1',
      eventTeamId: 'event_team_1',
      eventName: 'Future Event',
      eventStart: '2026-06-01T16:00:00.000Z',
      eventEnd: null,
      teamName: 'Test team snapshot',
    }]);
    expect(payload.freeAgentIds).toEqual(['free_registration']);
    expect(payload.freeAgentEventsByUserId).toEqual({
      free_registration: ['event_1'],
    });
    expect(payload.freeAgentEventTeamIdsByUserId).toEqual({
      free_registration: ['event_team_1'],
    });
    expect(payload.users.map((row: any) => row.$id)).toEqual(['free_registration']);
  });
});
