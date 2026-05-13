import {
  canIncreaseSetScore,
  getSetScoreState,
  isReachableSetScore,
  resolveSetVictoryTarget,
} from '../matchSetScoring';

describe('matchSetScoring', () => {
  it('resolves the configured target for each set with last-target fallback', () => {
    expect(resolveSetVictoryTarget([21, 21, 15], 0)).toBe(21);
    expect(resolveSetVictoryTarget([21, 21, 15], 2)).toBe(15);
    expect(resolveSetVictoryTarget([21, 21, 15], 4)).toBe(15);
  });

  it('treats the victory target as the final score when the leader already wins by two', () => {
    const state = getSetScoreState(21, 19, 21);

    expect(state.hasVictoryCondition).toBe(true);
    expect(state.isValidFinalScore).toBe(true);
    expect(state.requiredWinningScore).toBe(21);
    expect(isReachableSetScore(22, 19, 21)).toBe(false);
  });

  it('allows extended scoring only when needed to win by two', () => {
    expect(isReachableSetScore(21, 20, 21)).toBe(true);
    expect(isReachableSetScore(22, 20, 21)).toBe(true);
    expect(isReachableSetScore(23, 20, 21)).toBe(false);
    expect(isReachableSetScore(23, 21, 21)).toBe(true);
  });

  it('blocks further increases once the current score is a valid final set score', () => {
    expect(canIncreaseSetScore(20, 20, 21, 21, 20, 21)).toBe(true);
    expect(canIncreaseSetScore(21, 20, 22, 20, 21)).toBe(true);
    expect(canIncreaseSetScore(22, 20, 23, 20, 21)).toBe(false);
  });
});
