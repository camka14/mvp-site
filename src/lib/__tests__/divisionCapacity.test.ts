import {
  buildDivisionCapacityBreakdown,
  isDivisionAtCapacity,
  resolveDivisionCapacitySnapshot,
} from '@/lib/divisionCapacity';

describe('divisionCapacity', () => {
  it('returns null snapshot for single-division events', () => {
    const snapshot = resolveDivisionCapacitySnapshot({
      event: {
        singleDivision: true,
        maxParticipants: 12,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            maxParticipants: 8,
            teamIds: ['team_1'],
          } as any,
        ],
      },
      divisionId: 'open',
    });

    expect(snapshot).toBeNull();
    expect(
      buildDivisionCapacityBreakdown({
        event: {
          singleDivision: true,
          maxParticipants: 12,
          divisionDetails: [
            {
              id: 'event_1__division__open',
              key: 'open',
              name: 'Open',
              maxParticipants: 8,
              teamIds: ['team_1'],
            } as any,
          ],
        },
        excludePlayoffs: true,
      }),
    ).toEqual([]);
  });

  it('returns null snapshot when event is missing', () => {
    const snapshot = resolveDivisionCapacitySnapshot({
      event: null,
      divisionId: 'open',
    });

    expect(snapshot).toBeNull();
  });

  it('matches division snapshot by token (extract from id)', () => {
    const snapshot = resolveDivisionCapacitySnapshot({
      event: {
        singleDivision: false,
        maxParticipants: 12,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            maxParticipants: 8,
            teamIds: ['team_1', 'team_2', 'team_2'],
          } as any,
        ],
      },
      divisionId: 'open',
    });

    expect(snapshot).toEqual({ capacity: 8, filled: 2 });
    expect(isDivisionAtCapacity(snapshot)).toBe(false);
  });

  it('returns zero capacity when division capacity is missing', () => {
    const snapshot = resolveDivisionCapacitySnapshot({
      event: {
        singleDivision: false,
        maxParticipants: 4,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            maxParticipants: null,
            teamIds: ['t1', 't2', 't3', 't4'],
          } as any,
        ],
      },
      divisionId: 'event_1__division__open',
    });

    expect(snapshot).toEqual({ capacity: 0, filled: 4 });
    expect(isDivisionAtCapacity(snapshot)).toBe(false);
  });

  it('filters filled counts to eligibleTeamIds when provided', () => {
    const snapshot = resolveDivisionCapacitySnapshot({
      event: {
        singleDivision: false,
        maxParticipants: 12,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            maxParticipants: 8,
            teamIds: ['team_1', 'team_2', 'team_3'],
          } as any,
        ],
      },
      divisionId: 'open',
      eligibleTeamIds: ['team_2', 'team_missing'],
    });

    expect(snapshot).toEqual({ capacity: 8, filled: 1 });
    expect(isDivisionAtCapacity(snapshot)).toBe(false);

    const breakdown = buildDivisionCapacityBreakdown({
      event: {
        singleDivision: false,
        maxParticipants: 12,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            maxParticipants: 8,
            teamIds: ['team_1', 'team_2', 'team_3'],
          } as any,
        ],
      },
      excludePlayoffs: true,
      eligibleTeamIds: ['team_2', 'team_missing'],
    });

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.filled).toBe(1);
  });

  it('excludes playoff divisions from breakdown when requested', () => {
    const breakdown = buildDivisionCapacityBreakdown({
      event: {
        singleDivision: false,
        maxParticipants: 6,
        divisionDetails: [
          {
            id: 'event_1__division__open',
            key: 'open',
            name: 'Open',
            kind: 'LEAGUE',
            maxParticipants: 6,
            teamIds: ['team_1'],
          } as any,
          {
            id: 'event_1__division__playoff',
            key: 'playoff',
            name: 'Playoff',
            kind: 'PLAYOFF',
            maxParticipants: 6,
            teamIds: ['team_2'],
          } as any,
        ],
      },
      excludePlayoffs: true,
    });

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.divisionId).toBe('event_1__division__open');
  });

  it('shows tournament pool-play bracket capacities instead of generated pools', () => {
    const bracketId = 'event_1__division__c_skill_open_age_18plus';
    const poolAId = `${bracketId}_pool_a`;
    const poolBId = `${bracketId}_pool_b`;
    const event = {
      eventType: 'TOURNAMENT',
      includePlayoffsOrPools: true,
      includePlayoffs: true,
      singleDivision: false,
      maxParticipants: 8,
      divisionDetails: [
        {
          id: poolAId,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'CoEd Open - 18+ Pool A',
          kind: 'LEAGUE',
          maxParticipants: 4,
          playoffPlacementDivisionIds: [bracketId, bracketId],
          teamIds: ['team_1', 'stale_team'],
        } as any,
        {
          id: poolBId,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'CoEd Open - 18+ Pool B',
          kind: 'LEAGUE',
          maxParticipants: 4,
          playoffPlacementDivisionIds: [bracketId, bracketId],
          teamIds: ['team_2'],
        } as any,
      ],
      playoffDivisionDetails: [
        {
          id: bracketId,
          key: 'c_skill_open_age_18plus',
          name: 'CoEd Open - 18+',
          kind: 'PLAYOFF',
          maxParticipants: 2,
          teamIds: ['team_3'],
        } as any,
      ],
    };

    const breakdown = buildDivisionCapacityBreakdown({
      event,
      excludePlayoffs: true,
      eligibleTeamIds: ['team_1', 'team_2', 'team_3'],
    });

    expect(breakdown).toEqual([
      expect.objectContaining({
        divisionId: bracketId,
        name: 'CoEd Open - 18+',
        kind: 'PLAYOFF',
        capacity: 8,
        filled: 3,
      }),
    ]);

    expect(resolveDivisionCapacitySnapshot({
      event,
      divisionId: poolAId,
      eligibleTeamIds: ['team_1', 'team_2', 'team_3'],
    })).toEqual({ capacity: 8, filled: 3 });
  });
});
