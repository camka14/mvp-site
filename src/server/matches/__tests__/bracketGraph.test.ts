import {
  filterValidNextMatchCandidates,
  validateAndNormalizeBracketGraph,
} from '@/server/matches/bracketGraph';

describe('bracket graph validation', () => {
  it('preserves both incoming slots when winner and loser flow to the same next match', () => {
    const result = validateAndNormalizeBracketGraph([
      {
        id: 'match_1',
        matchId: 1,
        winnerNextMatchId: 'match_2',
        loserNextMatchId: 'match_2',
      },
      {
        id: 'match_2',
        matchId: 2,
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.incomingCountById.match_2).toBe(2);
    expect(result.normalizedById.match_2).toEqual({
      previousLeftId: 'match_1',
      previousRightId: 'match_1',
      incomingCount: 2,
    });
  });

  it('still rejects targets with more than two incoming matches', () => {
    const result = validateAndNormalizeBracketGraph([
      { id: 'match_1', matchId: 1, winnerNextMatchId: 'match_4' },
      { id: 'match_2', matchId: 2, winnerNextMatchId: 'match_4' },
      { id: 'match_3', matchId: 3, winnerNextMatchId: 'match_4' },
      { id: 'match_4', matchId: 4 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_OVER_CAPACITY',
          nodeId: 'match_4',
        }),
      ]),
    );
  });
});

describe('bracket candidate filtering', () => {
  it('includes same-target candidate when opposite lane already points there', () => {
    const candidates = filterValidNextMatchCandidates({
      sourceId: 'match_1',
      lane: 'winner',
      nodes: [
        { id: 'match_1', matchId: 1, loserNextMatchId: 'match_2' },
        { id: 'match_2', matchId: 2 },
        { id: 'match_3', matchId: 3 },
      ],
    });

    expect(candidates).toContain('match_2');
  });

  it('ignores stale reverse links when source next pointers moved to different targets', () => {
    const candidates = filterValidNextMatchCandidates({
      sourceId: 'match_60',
      lane: 'winner',
      nodes: [
        { id: 'match_52', matchId: 52, winnerNextMatchId: 'match_58' },
        { id: 'match_54', matchId: 54, winnerNextMatchId: 'match_65', loserNextMatchId: 'match_59' },
        { id: 'match_58', matchId: 58, previousLeftId: 'match_52', previousRightId: 'match_54' },
        { id: 'match_59', matchId: 59 },
        { id: 'match_60', matchId: 60, winnerNextMatchId: 'match_61' },
        { id: 'match_61', matchId: 61 },
        { id: 'match_65', matchId: 65 },
      ],
    });

    expect(candidates).toContain('match_58');
  });
});
