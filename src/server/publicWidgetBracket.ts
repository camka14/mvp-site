import { formatDisplayDateTime } from '@/lib/dateUtils';
import { inferDivisionDetails } from '@/lib/divisionTypes';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import {
  buildBracketDivisionOptions,
  collectConnectedBracketMatchIds,
  getBracketMatchDivisionId,
  getBracketRootMatches,
  hasBracketConnections,
  pickPreferredBracketRootMatch,
  toBracketDivisionKey,
} from '@/lib/bracketViewCore';
import {
  League,
  Match,
  Tournament,
} from '@/server/scheduler/types';
import { validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';

export type PublicWidgetDivisionOption = {
  value: string;
  label: string;
};

export type PublicBracketWidgetMatchCard = {
  id: string;
  matchId: number | null;
  fieldLabel: string;
  startLabel: string;
  team1Name: string;
  team2Name: string;
  team1Points: number[];
  team2Points: number[];
};

export type PublicBracketWidgetColumn = {
  label: string;
  matches: PublicBracketWidgetMatchCard[];
};

export type PublicBracketWidgetView = {
  divisionOptions: PublicWidgetDivisionOption[];
  selectedDivisionId: string | null;
  selectedDivisionName: string | null;
  winnersColumns: PublicBracketWidgetColumn[];
  losersColumns: PublicBracketWidgetColumn[];
  hasLosersBracket: boolean;
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const getDivisionLabel = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (!cleaned) {
      return null;
    }
    const inferred = inferDivisionDetails({ identifier: cleaned });
    return inferred.defaultName?.trim() || cleaned;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as { name?: unknown; id?: unknown; $id?: unknown; key?: unknown };
  const explicitName = normalizeToken(row.name);
  if (explicitName) {
    return explicitName;
  }

  const fallbackId = normalizeToken(row.id)
    ?? normalizeToken(row.$id)
    ?? normalizeToken(row.key);
  if (!fallbackId) {
    return null;
  }

  const inferred = inferDivisionDetails({ identifier: fallbackId });
  return inferred.defaultName?.trim() || fallbackId;
};

const getMatchDivisionLabel = (match: Match): string | null => (
  getDivisionLabel(match.division)
  ?? getDivisionLabel(match.team1?.division)
  ?? getDivisionLabel(match.team2?.division)
);

const getFieldLabel = (match: Match): string => {
  return getFieldDisplayName(
    {
      id: normalizeToken(match.field?.id),
      name: normalizeToken(match.field?.name) ?? '',
    },
    'Field TBD',
  );
};

const getFeedLabel = (
  previousMatch: Match,
  currentMatch: Match,
  slot: 'team1' | 'team2',
): string => {
  const winnerNextId = previousMatch.winnerNextMatch?.id ?? null;
  const loserNextId = previousMatch.loserNextMatch?.id ?? null;

  let prefix: 'Winner' | 'Loser';
  if (winnerNextId === currentMatch.id && loserNextId === currentMatch.id) {
    prefix = slot === 'team2' ? 'Loser' : 'Winner';
  } else if (loserNextId === currentMatch.id) {
    prefix = 'Loser';
  } else {
    prefix = 'Winner';
  }

  const matchNumber = Number.isFinite(previousMatch.matchId) ? previousMatch.matchId : null;
  return matchNumber ? `${prefix} of match #${matchNumber}` : `${prefix} TBD`;
};

const getTeamLabel = (
  currentMatch: Match,
  team: Match['team1'] | Match['team2'],
  previousMatch: Match | null | undefined,
  slot: 'team1' | 'team2',
): string => {
  const explicit = normalizeToken(team?.name);
  if (explicit) {
    return explicit;
  }
  if (previousMatch) {
    return getFeedLabel(previousMatch, currentMatch, slot);
  }
  return 'TBD';
};

const buildMatchCard = (
  match: Match,
): PublicBracketWidgetMatchCard => ({
  id: match.id,
  matchId: Number.isFinite(match.matchId) ? match.matchId ?? null : null,
  fieldLabel: getFieldLabel(match),
  startLabel: match.start instanceof Date && !Number.isNaN(match.start.getTime())
    ? formatDisplayDateTime(match.start)
    : 'Time TBD',
  team1Name: getTeamLabel(match, match.team1, match.previousLeftMatch, 'team1'),
  team2Name: getTeamLabel(match, match.team2, match.previousRightMatch, 'team2'),
  team1Points: Array.isArray(match.team1Points) ? match.team1Points : [],
  team2Points: Array.isArray(match.team2Points) ? match.team2Points : [],
});

const buildLaneColumns = (
  matchesById: Record<string, Match>,
  normalizedNodes: Record<string, { previousLeftId: string | null; previousRightId: string | null }>,
  losersBracket: boolean,
): PublicBracketWidgetColumn[] => {
  const laneMatches = Object.values(matchesById)
    .filter((match) => Boolean(match.losersBracket) === losersBracket)
    .sort((left, right) => {
      const leftId = Number.isFinite(left.matchId) ? Number(left.matchId) : Number.MAX_SAFE_INTEGER;
      const rightId = Number.isFinite(right.matchId) ? Number(right.matchId) : Number.MAX_SAFE_INTEGER;
      return leftId - rightId || left.id.localeCompare(right.id);
    });

  if (!laneMatches.length) {
    return [];
  }

  const laneMatchIdSet = new Set(laneMatches.map((match) => match.id));
  const roundById = new Map<string, number>();

  const getRound = (matchId: string): number => {
    const existing = roundById.get(matchId);
    if (typeof existing === 'number') {
      return existing;
    }

    const previousIds = [
      normalizedNodes[matchId]?.previousLeftId ?? null,
      normalizedNodes[matchId]?.previousRightId ?? null,
    ].filter((previousId): previousId is string => Boolean(previousId && laneMatchIdSet.has(previousId)));

    const round = previousIds.length
      ? Math.max(...previousIds.map((previousId) => getRound(previousId))) + 1
      : 0;
    roundById.set(matchId, round);
    return round;
  };

  laneMatches.forEach((match) => {
    getRound(match.id);
  });

  const matchesByRound = new Map<number, Match[]>();
  laneMatches.forEach((match) => {
    const round = roundById.get(match.id) ?? 0;
    const roundMatches = matchesByRound.get(round) ?? [];
    roundMatches.push(match);
    matchesByRound.set(round, roundMatches);
  });

  return Array.from(matchesByRound.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([round, roundMatches]) => ({
      label: losersBracket ? `Losers Round ${round + 1}` : `Round ${round + 1}`,
      matches: roundMatches.map((match) => buildMatchCard(match)),
    }));
};

export const buildPublicBracketWidgetView = (
  event: Tournament | League,
  requestedDivisionId?: string | null,
): PublicBracketWidgetView | null => {
  const bracketMatches = Object.values(event.matches ?? {}).filter(hasBracketConnections);
  if (!bracketMatches.length) {
    return null;
  }

  const bracketMatchesById = bracketMatches.reduce<Record<string, Match>>((acc, match) => {
    acc[match.id] = match;
    return acc;
  }, {});

  const divisionOptions = buildBracketDivisionOptions(bracketMatchesById, {
    resolveLabel: (match, divisionId) => getMatchDivisionLabel(match) ?? divisionId,
  });
  if (!divisionOptions.length) {
    return null;
  }

  const selectedDivisionId = divisionOptions.some((option) => option.value === requestedDivisionId)
    ? requestedDivisionId ?? null
    : divisionOptions[0].value;

  const rootMatches = getBracketRootMatches(bracketMatchesById);
  const rootsForDivision = selectedDivisionId
    ? rootMatches.filter((match) => toBracketDivisionKey(getBracketMatchDivisionId(match)) === selectedDivisionId)
    : rootMatches;
  const selectedRootMatch = pickPreferredBracketRootMatch(rootsForDivision);
  if (!selectedRootMatch) {
    return {
      divisionOptions,
      selectedDivisionId,
      selectedDivisionName: divisionOptions.find((option) => option.value === selectedDivisionId)?.label ?? null,
      winnersColumns: [],
      losersColumns: [],
      hasLosersBracket: false,
    };
  }

  const connectedMatchIds = collectConnectedBracketMatchIds(bracketMatchesById, selectedRootMatch.id);
  const selectedMatchesById = Array.from(connectedMatchIds).reduce<Record<string, Match>>((acc, matchId) => {
    if (bracketMatchesById[matchId]) {
      acc[matchId] = bracketMatchesById[matchId];
    }
    return acc;
  }, {});

  const graphNodes: BracketNode[] = Object.values(selectedMatchesById).map((match) => ({
    id: match.id,
    matchId: match.matchId ?? null,
    winnerNextMatchId: match.winnerNextMatch?.id ?? null,
    loserNextMatchId: match.loserNextMatch?.id ?? null,
    previousLeftId: match.previousLeftMatch?.id ?? null,
    previousRightId: match.previousRightMatch?.id ?? null,
  }));
  const graph = validateAndNormalizeBracketGraph(graphNodes);

  const winnersColumns = buildLaneColumns(selectedMatchesById, graph.normalizedById, false);
  const losersColumns = buildLaneColumns(selectedMatchesById, graph.normalizedById, true);

  return {
    divisionOptions,
    selectedDivisionId,
    selectedDivisionName: divisionOptions.find((option) => option.value === selectedDivisionId)?.label ?? null,
    winnersColumns,
    losersColumns,
    hasLosersBracket: losersColumns.length > 0,
  };
};
