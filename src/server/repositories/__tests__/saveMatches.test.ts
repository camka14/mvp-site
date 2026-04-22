/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { saveMatches } from '@/server/repositories/events';

describe('saveMatches', () => {
  it('replaces persisted match segments and incidents in batches when bulk writes are available', async () => {
    const client = {
      matches: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      matchSegments: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        upsert: jest.fn(),
      },
      matchIncidents: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
    };

    await saveMatches('event_1', [
      {
        id: 'match_1',
        matchId: 1,
        locked: false,
        losersBracket: false,
        team1Points: [25, 18],
        team2Points: [21, 16],
        setResults: [1, 1],
        segments: [
          {
            id: 'match_1_segment_1',
            sequence: 1,
            status: 'COMPLETE',
            scores: { team_1: 25, team_2: 21 },
            winnerEventTeamId: 'team_1',
            startedAt: '2026-04-22T18:00:00.000Z',
            endedAt: '2026-04-22T18:20:00.000Z',
          },
          {
            id: 'match_1_segment_2',
            sequence: 2,
            status: 'IN_PROGRESS',
            scores: { team_1: 18, team_2: 16 },
            winnerEventTeamId: null,
            startedAt: '2026-04-22T18:22:00.000Z',
            endedAt: null,
          },
        ],
        incidents: [
          {
            id: 'incident_1',
            segmentId: 'match_1_segment_2',
            eventTeamId: 'team_1',
            eventRegistrationId: 'registration_1',
            participantUserId: 'player_1',
            officialUserId: 'official_1',
            incidentType: 'POINT',
            sequence: 1,
            linkedPointDelta: 1,
          },
        ],
      },
      {
        id: 'match_2',
        matchId: 2,
        locked: true,
        losersBracket: false,
        team1Points: [],
        team2Points: [],
        setResults: [],
      },
    ] as any, client as any);

    expect(client.matches.upsert).toHaveBeenCalledTimes(2);

    expect(client.matchSegments.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_1'] } },
    });
    expect(client.matchSegments.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'COMPLETE',
          scores: { team_1: 25, team_2: 21 },
          winnerEventTeamId: 'team_1',
        }),
        expect.objectContaining({
          id: 'match_1_segment_2',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 2,
          status: 'IN_PROGRESS',
          scores: { team_1: 18, team_2: 16 },
          winnerEventTeamId: null,
        }),
      ],
    });
    expect(client.matchSegments.upsert).not.toHaveBeenCalled();

    expect(client.matchIncidents.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_1'] } },
    });
    expect(client.matchIncidents.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'incident_1',
          eventId: 'event_1',
          matchId: 'match_1',
          segmentId: 'match_1_segment_2',
          incidentType: 'POINT',
          linkedPointDelta: 1,
        }),
      ],
    });
    expect(client.matchIncidents.upsert).not.toHaveBeenCalled();
  });
});
