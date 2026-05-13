export type SetScoreState = {
  target: number | null;
  leaderScore: number;
  trailingScore: number;
  margin: number;
  hasVictoryCondition: boolean;
  isValidFinalScore: boolean;
  requiredWinningScore: number | null;
};

const nonNegativeInt = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const positiveIntOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

export const resolveSetVictoryTarget = (
  targets: unknown,
  segmentIndex: number,
): number | null => {
  if (!Array.isArray(targets) || targets.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.trunc(segmentIndex));
  return positiveIntOrNull(targets[index] ?? targets[targets.length - 1]);
};

export const getSetScoreState = (
  team1Score: unknown,
  team2Score: unknown,
  target: unknown,
): SetScoreState => {
  const normalizedTarget = positiveIntOrNull(target);
  const first = nonNegativeInt(team1Score);
  const second = nonNegativeInt(team2Score);
  const leaderScore = Math.max(first, second);
  const trailingScore = Math.min(first, second);
  const margin = leaderScore - trailingScore;
  const hasVictoryCondition = Boolean(normalizedTarget && leaderScore >= normalizedTarget && margin >= 2);
  const requiredWinningScore = hasVictoryCondition && normalizedTarget
    ? Math.max(normalizedTarget, trailingScore + 2)
    : null;

  return {
    target: normalizedTarget,
    leaderScore,
    trailingScore,
    margin,
    hasVictoryCondition,
    isValidFinalScore: Boolean(requiredWinningScore && leaderScore === requiredWinningScore),
    requiredWinningScore,
  };
};

export const isReachableSetScore = (
  team1Score: unknown,
  team2Score: unknown,
  target: unknown,
): boolean => {
  const state = getSetScoreState(team1Score, team2Score, target);
  return !state.hasVictoryCondition || state.isValidFinalScore;
};

export const canIncreaseSetScore = (
  currentTeam1Score: unknown,
  currentTeam2Score: unknown,
  nextTeam1Score: unknown,
  nextTeam2Score: unknown,
  target: unknown,
): boolean => {
  if (!positiveIntOrNull(target)) {
    return true;
  }
  if (getSetScoreState(currentTeam1Score, currentTeam2Score, target).isValidFinalScore) {
    return false;
  }
  return isReachableSetScore(nextTeam1Score, nextTeam2Score, target);
};
