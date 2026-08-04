import {
  calculateTimedMatchDurationMinutes,
  resolveDivisionCompetitionPhase,
} from '@/lib/divisionPhaseSettings';

describe('resolveDivisionCompetitionPhase', () => {
  it.each([
    [{ eventType: 'LEAGUE', divisionKind: 'LEAGUE' }, 'LEAGUE'],
    [{ eventType: 'LEAGUE', divisionKind: 'PLAYOFF' }, 'PLAYOFF'],
    [{ eventType: 'LEAGUE', divisionKind: 'LEAGUE', hasBracketLinks: true }, 'PLAYOFF'],
    [{ eventType: 'TOURNAMENT', divisionKind: 'LEAGUE' }, 'POOL'],
    [{ eventType: 'TOURNAMENT', divisionKind: 'PLAYOFF' }, 'BRACKET'],
    [{ eventType: 'TOURNAMENT', divisionKind: 'LEAGUE', hasBracketLinks: true }, 'BRACKET'],
  ] as const)('resolves %o as %s', (input, expected) => {
    expect(resolveDivisionCompetitionPhase(input)).toBe(expected);
  });
});

describe('calculateTimedMatchDurationMinutes', () => {
  it.each([
    [{ segmentCount: 1, segmentLengthMinutes: 20, segmentBreakMinutes: 5 }, 20],
    [{ segmentCount: 2, segmentLengthMinutes: 45, segmentBreakMinutes: 15 }, 105],
    [{ segmentCount: 4, segmentLengthMinutes: 12, segmentBreakMinutes: 2 }, 54],
    [{ segmentCount: 3, segmentLengthMinutes: 10, segmentBreakMinutes: 0 }, 30],
  ])('calculates %o as %i minutes', (input, expected) => {
    expect(calculateTimedMatchDurationMinutes(input)).toBe(expected);
  });

  it('returns null until segment count and segment length are valid', () => {
    expect(calculateTimedMatchDurationMinutes({
      segmentCount: null,
      segmentLengthMinutes: 20,
      segmentBreakMinutes: 5,
    })).toBeNull();
    expect(calculateTimedMatchDurationMinutes({
      segmentCount: 2,
      segmentLengthMinutes: 0,
      segmentBreakMinutes: 5,
    })).toBeNull();
  });
});
