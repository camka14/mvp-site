import {
  filterValidNextMatchCandidates,
  validateAndNormalizeBracketGraph,
} from '@/server/matches/bracketGraph';

describe('bracket graph validation', () => {
  it('allows winner and loser to flow to the same next match', () => {
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
    expect(result.incomingCountById.match_2).toBe(1);
    expect(result.normalizedById.match_2).toEqual({
      previousLeftId: 'match_1',
      previousRightId: null,
      incomingCount: 1,
    });
  });

  it('still rejects targets with more than two unique incoming matches', () => {
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
});
