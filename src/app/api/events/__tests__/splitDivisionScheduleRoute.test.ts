/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  volleyBallTeams: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  matches: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  leagueScoringConfigs: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: any[]) => acquireEventLockMock(...args),
}));

import { POST as schedulePost } from '@/app/api/events/[eventId]/schedule/route';

const jsonRequest = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event schedule route - split divisions regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    acquireEventLockMock.mockResolvedValue(undefined);
    prismaMock.events.update.mockResolvedValue(undefined);
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.matches.deleteMany.mockResolvedValue(undefined);
    prismaMock.matches.upsert.mockResolvedValue(undefined);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.leagueScoringConfigs.findUnique.mockResolvedValue(null);
  });

  it('keeps matches separated by division when scheduling a split-division league', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      name: 'Split Division League',
      description: 'Regression coverage for split divisions',
      start: new Date('2026-01-03T09:00:00.000Z'),
      end: new Date('2026-02-28T13:00:00.000Z'),
      location: 'Main Gym',
      coordinates: null,
      price: 0,
      minAge: null,
      maxAge: null,
      rating: null,
      imageId: '',
      hostId: 'host_1',
      state: 'UNPUBLISHED',
      maxParticipants: 4,
      teamSizeLimit: 2,
      restTimeMinutes: 0,
      teamSignup: true,
      singleDivision: false,
      waitListIds: [],
      freeAgentIds: [],
      teamIds: ['team_beginner_1', 'team_beginner_2', 'team_advanced_1', 'team_advanced_2'],
      userIds: [],
      fieldIds: ['field_beginner', 'field_advanced'],
      timeSlotIds: ['slot_beginner', 'slot_advanced'],
      refereeIds: [],
      registrationIds: [],
      cancellationRefundHours: null,
      registrationCutoffHours: null,
      seedColor: null,
      eventType: 'LEAGUE',
      sportId: 'sport_1',
      leagueScoringConfigId: null,
      organizationId: null,
      requiredTemplateIds: [],
      allowPaymentPlans: false,
      installmentCount: 0,
      installmentDueDates: [],
      installmentAmounts: [],
      allowTeamSplitDefault: false,
      divisions: ['beginner', 'advanced'],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsRef: false,
      usesSets: false,
      matchDurationMinutes: 60,
      setDurationMinutes: 0,
      setsPerMatch: 0,
      pointsToVictory: [],
      winnerSetCount: null,
      loserSetCount: null,
      doubleElimination: false,
      fieldCount: 2,
      prize: null,
      winnerBracketPointsToVictory: [],
      loserBracketPointsToVictory: [],
    });

    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'event_1__division__beginner',
        key: 'beginner',
        name: 'Beginner',
        fieldIds: ['field_beginner'],
      },
      {
        id: 'event_1__division__advanced',
        key: 'advanced',
        name: 'Advanced',
        fieldIds: ['field_advanced'],
      },
    ]);

    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_beginner',
        fieldNumber: 1,
        organizationId: null,
        divisions: ['beginner'],
        name: 'Court Beginner',
      },
      {
        id: 'field_advanced',
        fieldNumber: 2,
        organizationId: null,
        divisions: ['advanced'],
        name: 'Court Advanced',
      },
    ]);

    prismaMock.volleyBallTeams.findMany.mockResolvedValue([
      {
        id: 'team_beginner_1',
        seed: 1,
        captainId: 'captain_beginner_1',
        division: 'beginner',
        wins: 0,
        losses: 0,
        name: 'Beginner Team 1',
        playerIds: [],
      },
      {
        id: 'team_beginner_2',
        seed: 2,
        captainId: 'captain_beginner_2',
        division: 'beginner',
        wins: 0,
        losses: 0,
        name: 'Beginner Team 2',
        playerIds: [],
      },
      {
        id: 'team_advanced_1',
        seed: 1,
        captainId: 'captain_advanced_1',
        division: 'advanced',
        wins: 0,
        losses: 0,
        name: 'Advanced Team 1',
        playerIds: [],
      },
      {
        id: 'team_advanced_2',
        seed: 2,
        captainId: 'captain_advanced_2',
        division: 'advanced',
        wins: 0,
        losses: 0,
        name: 'Advanced Team 2',
        playerIds: [],
      },
    ]);

    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_beginner',
        dayOfWeek: 5,
        daysOfWeek: [5],
        startDate: new Date('2026-01-03T00:00:00.000Z'),
        endDate: new Date('2026-02-28T00:00:00.000Z'),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        scheduledFieldId: 'field_beginner',
        divisions: ['beginner'],
      },
      {
        id: 'slot_advanced',
        dayOfWeek: 5,
        daysOfWeek: [5],
        startDate: new Date('2026-01-03T00:00:00.000Z'),
        endDate: new Date('2026-02-28T00:00:00.000Z'),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        scheduledFieldId: 'field_advanced',
        divisions: ['advanced'],
      },
    ]);

    const res = await schedulePost(
      jsonRequest('http://localhost/api/events/event_1/schedule', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.matches.upsert).toHaveBeenCalledTimes(2);

    const persistedDivisions = prismaMock.matches.upsert.mock.calls
      .map((call) => call[0].create.division)
      .sort();
    expect(persistedDivisions).toEqual(['advanced', 'beginner']);

    const returnedDivisions = (Array.isArray(json.matches) ? json.matches : [])
      .map((match: any) => match.division)
      .filter(Boolean)
      .sort();
    expect(returnedDivisions).toEqual(['advanced', 'beginner']);
  });
});
