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

  it('falls back to event maxParticipants when division capacity is missing', () => {
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

    expect(snapshot).toEqual({ capacity: 4, filled: 4 });
    expect(isDivisionAtCapacity(snapshot)).toBe(true);
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
});
