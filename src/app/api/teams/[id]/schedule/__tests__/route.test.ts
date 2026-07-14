/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  canonicalTeams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  matches: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const evaluateRazumlyAdminAccessMock = jest.fn();
const getEventOfficialIdsByEventIdsMock = jest.fn();
const withDerivedEventParticipantIdsMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const isAdminOnlyCanonicalTeamMock = jest.fn();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));
jest.mock('@/server/razumlyAdmin', () => ({
  evaluateRazumlyAdminAccess: (...args: any[]) => evaluateRazumlyAdminAccessMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  withDerivedEventParticipantIds: (...args: any[]) => withDerivedEventParticipantIdsMock(...args),
}));
jest.mock('@/server/officials/eventOfficials', () => ({
  getEventOfficialIdsByEventIds: (...args: any[]) => getEventOfficialIdsByEventIdsMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  getEventTeamsDelegate: (client: any) => client?.teams ?? null,
  isAdminOnlyCanonicalTeam: (...args: any[]) => isAdminOnlyCanonicalTeamMock(...args),
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId,
}));

import { GET } from '@/app/api/teams/[id]/schedule/route';

describe('GET /api/teams/[id]/schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'viewer_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(false);
    evaluateRazumlyAdminAccessMock.mockResolvedValue({ allowed: false, email: null, verified: false });
    getEventOfficialIdsByEventIdsMock.mockResolvedValue(new Map());
    withDerivedEventParticipantIdsMock.mockImplementation(async (events) => events);
    isAdminOnlyCanonicalTeamMock.mockReturnValue(false);
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'canonical_team_1',
      name: 'Summit United',
      parentTeamId: null,
      visibility: 'PUBLIC',
    });
    prismaMock.canonicalTeams.findUnique.mockResolvedValue(null);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      { id: 'canonical_team_1', name: 'Summit United' },
    ]);
    prismaMock.organizations.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.OR) {
        return [{ id: 'event_team_1', parentTeamId: 'canonical_team_1' }];
      }
      if (args?.where?.id) {
        return [
          { id: 'event_team_1', name: 'Summit United', parentTeamId: 'canonical_team_1' },
          { id: 'event_team_2', name: 'Riverside FC', parentTeamId: 'canonical_team_2' },
        ];
      }
      return [];
    });
  });

  it('returns events and matches filtered to canonical and event-team IDs', async () => {
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      { eventId: 'event_1' },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        fieldId: 'field_1',
        team1Id: 'event_team_1',
        team2Id: 'event_team_2',
        teamOfficialId: null,
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T11:00:00Z'),
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        state: 'PUBLISHED',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: ['field_1'],
        teamIds: ['event_team_1', 'event_team_2'],
      },
    ]);
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_1', name: 'Field 1' },
    ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/teams/canonical_team_1/schedule?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z&limit=50',
      ),
      { params: Promise.resolve({ id: 'canonical_team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0]).toEqual(expect.objectContaining({
      start: '2026-03-01T10:00:00.000Z',
      end: '2026-03-01T11:00:00.000Z',
    }));
    expect(json.fields).toHaveLength(1);
    expect(json.teams).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'canonical_team_1', name: 'Summit United' }),
      expect.objectContaining({ id: 'event_team_1', name: 'Summit United' }),
      expect.objectContaining({ id: 'event_team_2', name: 'Riverside FC' }),
    ]));

    expect(prismaMock.teams.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: { in: ['canonical_team_1'] } },
            { parentTeamId: { in: ['canonical_team_1'] } },
          ],
        },
      }),
    );
    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registrantId: { in: ['canonical_team_1', 'event_team_1'] },
          registrantType: 'TEAM',
        }),
      }),
    );
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { team1Id: { in: ['canonical_team_1', 'event_team_1'] } },
            { team2Id: { in: ['canonical_team_1', 'event_team_1'] } },
            { teamOfficialId: { in: ['canonical_team_1', 'event_team_1'] } },
          ]),
          AND: expect.any(Array),
        }),
        take: 50,
      }),
    );
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
          id: { in: ['event_1'] },
          AND: expect.any(Array),
        }),
        take: 50,
      }),
    );
  });

  it('includes events discovered only through team matches', async () => {
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_2',
        eventId: 'event_2',
        fieldId: null,
        team1Id: 'event_team_1',
        team2Id: 'event_team_3',
        teamOfficialId: null,
        start: new Date('2026-04-01T10:00:00Z'),
        end: new Date('2026-04-01T11:00:00Z'),
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_2',
        name: 'Match Only Event',
        state: 'PUBLISHED',
        start: new Date('2026-04-01T10:00:00Z'),
        end: new Date('2026-04-01T12:00:00Z'),
        fieldIds: [],
        teamIds: ['event_team_1'],
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/canonical_team_1/schedule'),
      { params: Promise.resolve({ id: 'canonical_team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].id).toBe('event_2');
    expect(json.matches).toHaveLength(1);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['event_2'] },
        }),
      }),
    );
  });

  it('returns 404 when the team does not exist', async () => {
    loadCanonicalTeamByIdMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/missing_team/schedule'),
      { params: Promise.resolve({ id: 'missing_team' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Not found');
    expect(prismaMock.eventRegistrations.findMany).not.toHaveBeenCalled();
  });

  it('hides admin-only teams from unauthorized viewers', async () => {
    isAdminOnlyCanonicalTeamMock.mockReturnValue(true);
    prismaMock.canonicalTeams.findUnique.mockResolvedValue({ organizationId: 'org_1' });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });

    const response = await GET(
      new NextRequest('http://localhost/api/teams/canonical_team_1/schedule'),
      { params: Promise.resolve({ id: 'canonical_team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Not found');
    expect(evaluateRazumlyAdminAccessMock).toHaveBeenCalledWith('viewer_1');
    expect(hasOrgPermissionMock).toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.findMany).not.toHaveBeenCalled();
  });
});
