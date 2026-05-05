/** @jest-environment node */

import {
  TournamentPoolValidationError,
  assignRegisteredTeamToTournamentPool,
  buildGeneratedTournamentPools,
} from '@/server/events/tournamentPools';

describe('tournamentPools', () => {
  it('generates alphabetic pools with even team and advancement counts', () => {
    const pools = buildGeneratedTournamentPools({
      eventId: 'event_1',
      bracket: {
        id: 'event_1__division__open',
        key: 'open',
        name: 'Open',
        maxParticipants: 12,
        playoffTeamCount: 6,
        poolCount: 3,
      },
    });

    expect(pools).toEqual([
      expect.objectContaining({
        key: 'open_pool_a',
        name: 'Open Pool A',
        kind: 'LEAGUE',
        maxParticipants: 4,
        playoffTeamCount: 2,
        playoffPlacementDivisionIds: ['event_1__division__open', 'event_1__division__open'],
      }),
      expect.objectContaining({
        key: 'open_pool_b',
        name: 'Open Pool B',
        maxParticipants: 4,
        playoffTeamCount: 2,
      }),
      expect.objectContaining({
        key: 'open_pool_c',
        name: 'Open Pool C',
        maxParticipants: 4,
        playoffTeamCount: 2,
      }),
    ]);
  });

  it('rejects pool counts that cannot evenly divide registration capacity', () => {
    expect(() => buildGeneratedTournamentPools({
      eventId: 'event_1',
      bracket: {
        id: 'event_1__division__open',
        key: 'open',
        name: 'Open',
        maxParticipants: 10,
        playoffTeamCount: 4,
        poolCount: 3,
      },
    })).toThrow(TournamentPoolValidationError);
  });

  it('assigns a registered team to the least-filled generated pool', async () => {
    const update = jest.fn().mockResolvedValue({});
    const assignedPoolId = await assignRegisteredTeamToTournamentPool({
      eventId: 'event_1',
      bracketDivisionId: 'event_1__division__open',
      eventTeamId: 'event_team_3',
      client: {
        divisions: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'pool_a',
              key: 'open_pool_a',
              name: 'Open Pool A',
              kind: 'LEAGUE',
              maxParticipants: 4,
              playoffPlacementDivisionIds: ['event_1__division__open'],
              teamIds: ['event_team_1', 'event_team_2'],
            },
            {
              id: 'pool_b',
              key: 'open_pool_b',
              name: 'Open Pool B',
              kind: 'LEAGUE',
              maxParticipants: 4,
              playoffPlacementDivisionIds: ['event_1__division__open'],
              teamIds: ['event_team_4'],
            },
          ]),
          update,
        },
      },
    } as any);

    expect(assignedPoolId).toBe('pool_b');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pool_b' },
      data: {
        teamIds: ['event_team_4', 'event_team_3'],
        updatedAt: expect.any(Date),
      },
    });
  });
});
