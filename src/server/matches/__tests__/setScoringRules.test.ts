import { resolveSetCompletionForMatch } from '../setScoringRules';

describe('resolveSetCompletionForMatch', () => {
  const event = {
    usesSets: true,
    pointsToVictory: [21, 21, 15],
  };
  const match = {
    team1Id: 'team_1',
    team2Id: 'team_2',
    resolvedMatchRules: { scoringModel: 'SETS', setPointTargets: [21, 21, 15] },
  };

  it('completes a volleyball set at 21 with a two-point lead', () => {
    expect(resolveSetCompletionForMatch({
      event,
      match,
      sequence: 1,
      scores: { team_1: 21, team_2: 15 },
    })).toEqual({ winnerEventTeamId: 'team_1', target: 21 });
  });

  it('waits for a valid win-by-two final score', () => {
    expect(resolveSetCompletionForMatch({
      event,
      match,
      sequence: 1,
      scores: { team_1: 21, team_2: 20 },
    })).toBeNull();
    expect(resolveSetCompletionForMatch({
      event,
      match,
      sequence: 1,
      scores: { team_1: 22, team_2: 20 },
    })).toEqual({ winnerEventTeamId: 'team_1', target: 21 });
  });
});
