/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { loadEventForMatchMutation, saveMatches } from '@/server/repositories/events';

const createClient = () => {
  const eventMatches = [
    {
      id: 'match_target',
      eventId: 'event_1',
      matchId: 1,
      division: 'open',
      team1Id: 'team_1',
      team2Id: 'team_2',
      fieldId: 'field_1',
      start: new Date('2026-04-22T18:00:00.000Z'),
      end: new Date('2026-04-22T19:00:00.000Z'),
      team1Points: [25],
      team2Points: [21],
      setResults: [1],
      locked: false,
      losersBracket: false,
      officialCheckedIn: false,
      officialIds: null,
      createdAt: null,
      updatedAt: null,
    },
    {
      id: 'match_other',
      eventId: 'event_1',
      matchId: 2,
      division: 'open',
      team1Id: 'team_2',
      team2Id: 'team_1',
      fieldId: 'field_1',
      start: new Date('2026-04-22T19:00:00.000Z'),
      end: new Date('2026-04-22T20:00:00.000Z'),
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      locked: false,
      losersBracket: false,
      officialCheckedIn: false,
      officialIds: null,
      createdAt: null,
      updatedAt: null,
    },
  ];

  return {
    events: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'event_1',
        name: 'Test Event',
        start: new Date('2026-04-22T18:00:00.000Z'),
        end: new Date('2026-04-22T21:00:00.000Z'),
        eventType: 'TOURNAMENT',
        state: 'PUBLISHED',
        divisions: ['open'],
        fieldIds: ['field_1'],
        teamIds: ['team_1', 'team_2'],
        timeSlotIds: [],
        officialIds: [],
        waitListIds: [],
        freeAgentIds: [],
        requiredTemplateIds: [],
        organizationId: null,
        sportId: null,
        teamSignup: true,
        doubleElimination: false,
        usesSets: false,
        setDurationMinutes: 0,
        matchDurationMinutes: 60,
        restTimeMinutes: 0,
        leagueScoringConfigId: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    divisions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    fields: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'field_1',
          organizationId: null,
          divisions: ['open'],
          name: 'Court A',
          rentalSlotIds: [],
          createdAt: null,
          updatedAt: null,
        },
      ]),
    },
    teams: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'team_1',
          captainId: 'captain_1',
          division: 'open',
          name: 'Team One',
          playerIds: ['player_1', 'player_2'],
        },
        {
          id: 'team_2',
          captainId: 'captain_2',
          division: 'open',
          name: 'Team Two',
          playerIds: ['player_3', 'player_4'],
        },
      ]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    matches: {
      findMany: jest.fn().mockImplementation((args?: Record<string, any>) => {
        if (args?.where?.eventId === 'event_1') {
          return Promise.resolve(eventMatches);
        }
        return Promise.resolve([]);
      }),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    leagueScoringConfigs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    matchSegments: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'segment_target_1',
          matchId: 'match_target',
          sequence: 1,
          status: 'COMPLETE',
          scores: { team_1: 25, team_2: 21 },
          winnerEventTeamId: 'team_1',
          startedAt: new Date('2026-04-22T18:00:00.000Z'),
          endedAt: new Date('2026-04-22T18:20:00.000Z'),
          createdAt: new Date('2026-04-22T18:00:00.000Z'),
          updatedAt: new Date('2026-04-22T18:20:00.000Z'),
        },
      ]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    matchIncidents: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'incident_target_1',
          matchId: 'match_target',
          segmentId: 'segment_target_1',
          eventTeamId: 'team_1',
          eventRegistrationId: 'registration_1',
          participantUserId: 'player_1',
          officialUserId: 'official_1',
          incidentType: 'POINT',
          sequence: 1,
          linkedPointDelta: 1,
          createdAt: new Date('2026-04-22T18:05:00.000Z'),
          updatedAt: new Date('2026-04-22T18:05:00.000Z'),
        },
      ]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    eventRegistrations: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
};

describe('loadEventForMatchMutation', () => {
  it('hydrates only the target match child rows and skips unrelated roster detail', async () => {
    const client = createClient();

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(client.matchSegments.findMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.matchIncidents.findMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.userData.findMany).not.toHaveBeenCalled();
    expect(client.eventRegistrations.findMany).not.toHaveBeenCalled();

    expect(loaded.matches.match_target.segments).toHaveLength(1);
    expect(loaded.matches.match_target.incidents).toHaveLength(1);
    expect(loaded.matches.match_other.segments).toEqual([]);
    expect(loaded.matches.match_other.incidents).toEqual([]);

    await saveMatches('event_1', Object.values(loaded.matches), client as any);

    expect(client.matchSegments.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.matchIncidents.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
  });
});
