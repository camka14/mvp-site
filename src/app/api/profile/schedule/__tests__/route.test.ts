/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  userData: {
    findUnique: jest.fn(),
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
  volleyBallTeams: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/legacyFormat', () => ({
  parseDateInput: (value: unknown) => {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  withLegacyList: (rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })),
}));

import { GET } from '@/app/api/profile/schedule/route';

describe('GET /api/profile/schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.teams.findMany.mockReset();
    prismaMock.volleyBallTeams.findMany.mockReset();
  });

  it('returns batched participant schedule payload', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: ['team_1'],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Test Event',
        state: 'PUBLISHED',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: ['field_1'],
        teamIds: ['team_1'],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        fieldId: 'field_1',
        team1Id: 'team_1',
        team2Id: 'team_2',
        teamRefereeId: null,
        refereeId: 'user_1',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T11:00:00Z'),
      },
    ]);
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_1', fieldNumber: 1, name: 'Field 1' },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([
      { id: 'team_1', name: 'Team One' },
      { id: 'team_2', name: 'Team Two' },
    ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/profile/schedule?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z&limit=50',
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.matches).toHaveLength(1);
    expect(json.fields).toHaveLength(1);
    expect(json.teams).toHaveLength(2);

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
          OR: expect.arrayContaining([
            { userIds: { has: 'user_1' } },
            { freeAgentIds: { has: 'user_1' } },
            { waitListIds: { has: 'user_1' } },
            { refereeIds: { has: 'user_1' } },
            { teamIds: { hasSome: ['team_1'] } },
          ]),
          AND: expect.any(Array),
        }),
        take: 50,
      }),
    );
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: { in: ['event_1'] },
          OR: expect.arrayContaining([
            { refereeId: 'user_1' },
            { team1Id: { in: ['team_1'] } },
            { team2Id: { in: ['team_1'] } },
            { teamRefereeId: { in: ['team_1'] } },
          ]),
        }),
      }),
    );
  });

  it('returns 404 when the user record does not exist', async () => {
    prismaMock.userData.findUnique.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('User not found');
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('does not query matches, fields, or teams when no events are found', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toEqual([]);
    expect(json.matches).toEqual([]);
    expect(prismaMock.matches.findMany).not.toHaveBeenCalled();
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
    expect(prismaMock.teams.findMany).not.toHaveBeenCalled();
  });

  it('falls back to legacy volleyBallTeams delegate when teams delegate is unavailable', async () => {
    const originalTeamsDelegate = prismaMock.teams;
    (prismaMock as any).teams = undefined;

    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: ['team_1'],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: [],
        teamIds: ['team_1'],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.volleyBallTeams.findMany.mockResolvedValue([{ id: 'team_1', name: 'Legacy Team' }]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.teams).toHaveLength(1);
    expect(prismaMock.volleyBallTeams.findMany).toHaveBeenCalled();

    (prismaMock as any).teams = originalTeamsDelegate;
  });
});
