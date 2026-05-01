import type { Match } from '@/types';

import { resolveDivisionLabel } from './MatchCard';

const getDisplayDivisionKey = (match: Match): string | null => {
  if (!match.division) {
    return null;
  }

  const label = resolveDivisionLabel(match.division).trim();
  if (!label || label === 'TBD') {
    return null;
  }

  return label.toLowerCase();
};

export const shouldDisplayMatchDivisionBadges = (matches: Match[]): boolean => {
  const divisionKeys = new Set<string>();

  matches.forEach((match) => {
    const divisionKey = getDisplayDivisionKey(match);
    if (divisionKey) {
      divisionKeys.add(divisionKey);
    }
  });

  return divisionKeys.size > 1;
};
