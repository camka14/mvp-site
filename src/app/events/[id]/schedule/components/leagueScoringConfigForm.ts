import type { LeagueScoringConfig } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';

export const applyLeagueScoringConfigFieldChange = <
  K extends keyof LeagueScoringConfig,
>(
  current: LeagueScoringConfig | null | undefined,
  key: K,
  value: LeagueScoringConfig[K],
  persist: (next: LeagueScoringConfig) => void,
): LeagueScoringConfig => {
  const next: LeagueScoringConfig = {
    ...createLeagueScoringConfig(current ?? undefined),
    [key]: value,
  };
  persist(next);
  return next;
};

