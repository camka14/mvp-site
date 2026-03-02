import { TournamentConfig } from '@/types';

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasMultipleSetTargets = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 1;

export const hasSetBasedTournamentSignals = (
  config?: Partial<TournamentConfig> | null,
): boolean => {
  if (!config || typeof config !== 'object') {
    return false;
  }

  if (config.usesSets === true) {
    return true;
  }

  const winnerSetCount = toFiniteNumber(config.winnerSetCount);
  if (winnerSetCount !== null && winnerSetCount > 1) {
    return true;
  }

  const loserSetCount = toFiniteNumber(config.loserSetCount);
  if (loserSetCount !== null && loserSetCount > 1) {
    return true;
  }

  if (
    hasMultipleSetTargets(config.winnerBracketPointsToVictory) ||
    hasMultipleSetTargets(config.loserBracketPointsToVictory)
  ) {
    return true;
  }

  const setDurationMinutes = toFiniteNumber(config.setDurationMinutes);
  return setDurationMinutes !== null && setDurationMinutes > 0;
};

export const resolveTournamentSetMode = (
  sportRequiresSets: boolean,
  config?: Partial<TournamentConfig> | null,
): boolean => sportRequiresSets || hasSetBasedTournamentSignals(config);
