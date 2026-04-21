/** @jest-environment node */

import { NextRequest } from 'next/server';

const teamFindUniqueMock = jest.fn();
const teamFindManyMock = jest.fn();
const organizationFindFirstMock = jest.fn();
const parentChildLinkFindFirstMock = jest.fn();
const eventsFindManyMock = jest.fn();
const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();

const prismaMock = {
  teams: {
    findUnique: (...args: any[]) => teamFindUniqueMock(...args),
    findMany: (...args: any[]) => teamFindManyMock(...args),
  },
  organizations: {
    findFirst: (...args: any[]) => organizationFindFirstMock(...args),
  },
  parentChildLinks: {
    findFirst: (...args: any[]) => parentChildLinkFindFirstMock(...args),
  },
  events: {
    findMany: (...args: any[]) => eventsFindManyMock(...args),
  },
  userData: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
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
    parentChildLinkFindFirstMock.mockResolvedValue(null);
    organizationFindFirstMock.mockResolvedValue({
      id: 'org_1',
      ownerId: 'org_owner_1',
      hostIds: [],
      officialIds: [],
    });
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
    expect(payload).toEqual({ users: [], eventIds: [], freeAgentIds: [] });
    expect(organizationFindFirstMock).toHaveBeenCalledWith({
      where: { teamIds: { has: 'team_1' } },
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
});
