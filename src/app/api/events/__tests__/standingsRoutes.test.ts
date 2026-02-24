/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
};

const divisionsMock = {
  update: jest.fn(),
};

const prismaMock = {
  events: eventsMock,
  divisions: divisionsMock,
  $transaction: jest.fn(async (callback: any) => callback({
    events: eventsMock,
    divisions: divisionsMock,
  })),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const acquireEventLockMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();
const saveMatchesMock = jest.fn();
const saveTeamRecordsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: canManageEventMock }));
jest.mock('@/server/repositories/locks', () => ({ acquireEventLock: acquireEventLockMock }));
jest.mock('@/server/repositories/events', () => ({
  loadEventWithRelations: (...args: any[]) => loadEventWithRelationsMock(...args),
  saveMatches: (...args: any[]) => saveMatchesMock(...args),
  saveTeamRecords: (...args: any[]) => saveTeamRecordsMock(...args),
}));

import { GET as standingsGet, PATCH as standingsPatch } from '@/app/api/events/[eventId]/standings/route';
import { POST as standingsConfirm } from '@/app/api/events/[eventId]/standings/confirm/route';

const buildLeagueFixture = () => {
  const division: any = {
    id: 'division_1',
    name: 'Division 1',
    playoffTeamCount: 2,
    playoffPlacementDivisionIds: ['playoff_1', 'playoff_1'],
    standingsOverrides: null,
    standingsConfirmedAt: null,
    standingsConfirmedBy: null,
  };
  const team1: any = {
    id: 'team_1',
    name: 'Team 1',
    division,
    matches: [],
    seed: 0,
    captainId: 'captain_1',
    playerIds: [],
    wins: 0,
    losses: 0,
  };
  const team2: any = {
    id: 'team_2',
    name: 'Team 2',
    division,
    matches: [],
    seed: 0,
    captainId: 'captain_2',
    playerIds: [],
    wins: 0,
    losses: 0,
  };
  const match: any = {
    id: 'match_1',
    division,
    team1,
    team2,
    team1Points: [21, 21, 15],
    team2Points: [10, 19, 21],
    setResults: [1, 1, 2],
    previousLeftMatch: null,
    previousRightMatch: null,
    winnerNextMatch: null,
    loserNextMatch: null,
  };
  team1.matches = [match];
  team2.matches = [match];

  return {
    id: 'event_1',
    eventType: 'LEAGUE',
    includePlayoffs: false,
    playoffTeamCount: 2,
    divisions: [division],
    playoffDivisions: [],
    teams: {
      [team1.id]: team1,
      [team2.id]: team2,
    },
    matches: {
      [match.id]: match,
    },
    leagueScoringConfig: {
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
    },
  };
};

const makePatchRequest = (body: unknown) => new NextRequest('http://localhost/api/events/event_1/standings', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const makePostRequest = (body: unknown) => new NextRequest('http://localhost/api/events/event_1/standings/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('standings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    acquireEventLockMock.mockResolvedValue(undefined);
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      state: 'PUBLISHED',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue(buildLeagueFixture());
    divisionsMock.update.mockResolvedValue({});
  });

  it('GET requires host/admin authorization for standings access', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const res = await standingsGet(
      new NextRequest('http://localhost/api/events/event_1/standings?divisionId=division_1', { method: 'GET' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(403);
    expect(loadEventWithRelationsMock).not.toHaveBeenCalled();
  });

  it('PATCH saves absolute points overrides and returns deltas', async () => {
    const res = await standingsPatch(
      makePatchRequest({
        divisionId: 'division_1',
        pointsOverrides: [{ teamId: 'team_1', points: 10 }],
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'division_1' },
        data: expect.objectContaining({
          standingsOverrides: { team_1: 10 },
        }),
      }),
    );

    const json = await res.json();
    const team1 = json.division.standings.find((row: any) => row.teamId === 'team_1');
    expect(team1).toBeTruthy();
    expect(team1.basePoints).toBe(3);
    expect(team1.finalPoints).toBe(10);
    expect(team1.pointsDelta).toBe(7);
  });

  it('POST confirm persists metadata and skips reassignment when disabled', async () => {
    const res = await standingsConfirm(
      makePostRequest({
        divisionId: 'division_1',
        applyReassignment: false,
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'division_1' },
        data: expect.objectContaining({
          standingsConfirmedBy: 'host_1',
        }),
      }),
    );
    expect(saveMatchesMock).not.toHaveBeenCalled();
    expect(saveTeamRecordsMock).not.toHaveBeenCalled();

    const json = await res.json();
    expect(json.applyReassignment).toBe(false);
    expect(json.seededTeamIds).toEqual([]);
  });
});
