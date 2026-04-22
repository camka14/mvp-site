import { formatDisplayDateTime } from '@/lib/dateUtils';
import { inferDivisionDetails } from '@/lib/divisionTypes';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { normalizeBracketSeed } from '@/lib/bracketSeeds';
import type {
  BracketCanvasConnection,
  BracketCanvasContentSize,
  BracketCanvasMetrics,
  BracketCanvasPosition,
} from '@/lib/bracketCanvasLayout';
import { buildBracketCanvasLayout } from '@/lib/bracketCanvasLayout';
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
  Division,
  League,
  Match,
  Tournament,
} from '@/server/scheduler/types';

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

export type PublicBracketWidgetLane = {
  matchIds: string[];
  cardsById: Record<string, PublicBracketWidgetMatchCard>;
  metrics: BracketCanvasMetrics;
  positionById: Record<string, BracketCanvasPosition>;
  contentSize: BracketCanvasContentSize;
  connections: BracketCanvasConnection[];
};

export type PublicBracketWidgetView = {
  divisionOptions: PublicWidgetDivisionOption[];
  selectedDivisionId: string | null;
  selectedDivisionName: string | null;
  winnersLane: PublicBracketWidgetLane | null;
  losersLane: PublicBracketWidgetLane | null;
  hasLosersBracket: boolean;
};

type BracketTeamSlot = 'team1' | 'team2';

type PlayoffBracketSlot = {
  matchId: string;
  slot: BracketTeamSlot;
  seed: number | null;
  divisionId: string;
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

const normalizeDivisionIdentifier = (value: unknown): string => (
  normalizeToken(value)?.toLowerCase() ?? ''
);

const divisionsEquivalent = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = normalizeDivisionIdentifier(left);
  const normalizedRight = normalizeDivisionIdentifier(right);
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
};

const extractDivisionIdentifier = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const row = value as { id?: unknown; $id?: unknown; key?: unknown };
  const candidates = [row.id, row.$id, row.key];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
};

const extractEntityId = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const row = value as { id?: unknown; $id?: unknown };
  const candidates = [row.id, row.$id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
};

const hasResolvedMatchLink = (
  idValue: unknown,
  relationValue: unknown,
  matchesById: Record<string, Match>,
): boolean => {
  const explicitId = normalizeToken(idValue);
  if (explicitId && matchesById[explicitId]) {
    return true;
  }
  if (idValue === null || (typeof idValue === 'string' && idValue.trim().length === 0)) {
    return false;
  }
  const relationId = extractEntityId(relationValue);
  return relationId.length > 0 && Boolean(matchesById[relationId]);
};

const formatOrdinalPlacement = (position: number): string => {
  const value = Math.max(1, Math.trunc(position || 1));
  const modHundred = value % 100;
  if (modHundred >= 11 && modHundred <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

const orderDivisionDetailsForMappings = (divisionIds: string[], divisions: Division[]): Division[] => {
  if (divisions.length === 0) {
    return [];
  }
  const remaining = [...divisions];
  const ordered: Division[] = [];

  divisionIds.forEach((divisionId) => {
    const matchedIndex = remaining.findIndex((division) =>
      divisionsEquivalent(division.id, divisionId),
    );
    if (matchedIndex >= 0) {
      ordered.push(remaining.splice(matchedIndex, 1)[0]);
    }
  });

  return [...ordered, ...remaining];
};

const resolveDivisionDisplayName = (division: Division, allDivisionDetails: Division[]): string => {
  const explicitName = normalizeToken(division.name);
  if (explicitName) {
    return explicitName;
  }

  const fallbackIdentifier = extractDivisionIdentifier(division);
  if (fallbackIdentifier.length > 0) {
    const matched = allDivisionDetails.find((candidate) =>
      divisionsEquivalent(candidate.id, fallbackIdentifier),
    );
    const matchedName = normalizeToken(matched?.name);
    if (matchedName) {
      return matchedName;
    }
    return fallbackIdentifier;
  }

  return 'TBD';
};

const buildMappedPlacementLabelsForPlayoffDivision = (
  playoffDivisionId: string,
  sourceDivisions: Division[],
  allDivisionDetails: Division[],
  eventPlayoffTeamCount?: number,
  options?: {
    implicitSelfMappings?: boolean;
  },
): string[] => {
  const allowImplicitSelfMappings = Boolean(options?.implicitSelfMappings);
  const resolvePlacementMappings = (division: Division): string[] => {
    const explicitMappings = Array.isArray(division.playoffPlacementDivisionIds)
      ? division.playoffPlacementDivisionIds
      : [];
    const hasExplicitMapping = explicitMappings.some((divisionId) => normalizeDivisionIdentifier(divisionId).length > 0);
    if (hasExplicitMapping || !allowImplicitSelfMappings) {
      return explicitMappings;
    }

    const divisionPlayoffTeamCount = typeof division.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
      ? Math.max(0, Math.trunc(division.playoffTeamCount))
      : undefined;
    const placementLimit = divisionPlayoffTeamCount ?? eventPlayoffTeamCount ?? 0;
    if (placementLimit <= 0) {
      return [];
    }
    return Array.from({ length: placementLimit }, () => division.id);
  };

  const labels: string[] = [];
  const maxPlacementIndex = sourceDivisions.reduce((maxValue, division) => {
    const mappedLength = resolvePlacementMappings(division).length;
    const divisionPlayoffTeamCount = typeof division.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
      ? Math.max(0, Math.trunc(division.playoffTeamCount))
      : undefined;
    return Math.max(maxValue, Math.max(mappedLength, divisionPlayoffTeamCount ?? eventPlayoffTeamCount ?? 0));
  }, 0);

  for (let placementIndex = 0; placementIndex < maxPlacementIndex; placementIndex += 1) {
    for (const division of sourceDivisions) {
      const mappedDivisionIds = resolvePlacementMappings(division);
      const divisionPlayoffTeamCount = typeof division.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
        ? Math.max(0, Math.trunc(division.playoffTeamCount))
        : undefined;
      const placementLimit = divisionPlayoffTeamCount ?? eventPlayoffTeamCount ?? mappedDivisionIds.length;
      if (placementIndex >= placementLimit) {
        continue;
      }
      const mappedDivisionId = mappedDivisionIds[placementIndex] ?? '';
      if (!divisionsEquivalent(mappedDivisionId, playoffDivisionId)) {
        continue;
      }
      labels.push(
        `${formatOrdinalPlacement(placementIndex + 1)} place (${resolveDivisionDisplayName(division, allDivisionDetails)})`,
      );
    }
  }

  return labels;
};

const resolveEntrantSlotSeeds = (
  match: Match,
  leftEntrantSlot: boolean,
  rightEntrantSlot: boolean,
): { team1Seed: number | null; team2Seed: number | null } => {
  const team1Seed = normalizeBracketSeed(match.team1Seed);
  const team2Seed = normalizeBracketSeed(match.team2Seed);
  if (leftEntrantSlot === rightEntrantSlot) {
    return { team1Seed, team2Seed };
  }

  const seedCount = Number(typeof team1Seed === 'number') + Number(typeof team2Seed === 'number');
  if (seedCount !== 1) {
    return { team1Seed, team2Seed };
  }

  const carriedSeed = team1Seed ?? team2Seed;
  if (leftEntrantSlot) {
    return {
      team1Seed: carriedSeed,
      team2Seed: null,
    };
  }
  return {
    team1Seed: null,
    team2Seed: carriedSeed,
  };
};

const buildLeaguePlayoffPlaceholderAssignments = (
  event: League,
  matches: Match[],
): Record<string, string> => {
  if (!event.includePlayoffs || matches.length === 0) {
    return {};
  }

  const orderedDivisions = orderDivisionDetailsForMappings(
    event.divisions.map((division) => division.id),
    event.divisions,
  );
  if (orderedDivisions.length === 0) {
    return {};
  }

  const allDivisionDetails = [...event.divisions, ...event.playoffDivisions];
  const matchesById = Object.fromEntries(matches.map((match) => [match.id, match]));
  const slots: PlayoffBracketSlot[] = [];

  matches.forEach((match) => {
    if (match.losersBracket) {
      return;
    }
    const divisionId = extractDivisionIdentifier(match.division);
    if (divisionId.length === 0) {
      return;
    }
    const leftEntrantSlot = !hasResolvedMatchLink(
      (match as { previousLeftId?: unknown }).previousLeftId,
      match.previousLeftMatch,
      matchesById,
    );
    const rightEntrantSlot = !hasResolvedMatchLink(
      (match as { previousRightId?: unknown }).previousRightId,
      match.previousRightMatch,
      matchesById,
    );
    if (!leftEntrantSlot && !rightEntrantSlot) {
      return;
    }
    const { team1Seed, team2Seed } = resolveEntrantSlotSeeds(match, leftEntrantSlot, rightEntrantSlot);
    if (leftEntrantSlot) {
      slots.push({ matchId: match.id, slot: 'team1', seed: team1Seed, divisionId });
    }
    if (rightEntrantSlot) {
      slots.push({ matchId: match.id, slot: 'team2', seed: team2Seed, divisionId });
    }
  });

  if (slots.length === 0) {
    return {};
  }

  const slotsByDivision = new Map<string, PlayoffBracketSlot[]>();
  slots.forEach((slot) => {
    const normalizedDivisionId = normalizeDivisionIdentifier(slot.divisionId);
    if (normalizedDivisionId.length === 0) {
      return;
    }
    const bucket = slotsByDivision.get(normalizedDivisionId) ?? [];
    bucket.push(slot);
    slotsByDivision.set(normalizedDivisionId, bucket);
  });

  const result: Record<string, string> = {};
  slotsByDivision.forEach((divisionSlots, divisionId) => {
    const labels = buildMappedPlacementLabelsForPlayoffDivision(
      divisionId,
      orderedDivisions,
      allDivisionDetails,
      event.playoffTeamCount,
      { implicitSelfMappings: !event.splitLeaguePlayoffDivisions },
    );
    if (labels.length === 0) {
      return;
    }
    divisionSlots.forEach((slot) => {
      if (typeof slot.seed !== 'number' || !Number.isFinite(slot.seed) || slot.seed < 1) {
        return;
      }
      const label = labels[slot.seed - 1];
      if (!label) {
        return;
      }
      result[`${slot.matchId}:${slot.slot}`] = label;
    });
  });

  return result;
};

const getFieldLabel = (match: Match): string => (
  getFieldDisplayName(
    {
      id: normalizeToken(match.field?.id),
      name: normalizeToken(match.field?.name) ?? '',
    },
    'Field TBD',
  )
);

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
  placeholder?: string,
): string => {
  const explicit = normalizeToken(team?.name);
  if (explicit) {
    return explicit;
  }
  const normalizedPlaceholder = normalizeToken(placeholder);
  if (normalizedPlaceholder) {
    return normalizedPlaceholder;
  }
  if (previousMatch) {
    return getFeedLabel(previousMatch, currentMatch, slot);
  }
  return 'TBD';
};

const buildMatchCard = (
  match: Match,
  placeholderAssignments: Record<string, string>,
): PublicBracketWidgetMatchCard => ({
  id: match.id,
  matchId: Number.isFinite(match.matchId) ? match.matchId ?? null : null,
  fieldLabel: getFieldLabel(match),
  startLabel: match.start instanceof Date && !Number.isNaN(match.start.getTime())
    ? formatDisplayDateTime(match.start)
    : 'Time TBD',
  team1Name: getTeamLabel(
    match,
    match.team1,
    match.previousLeftMatch,
    'team1',
    placeholderAssignments[`${match.id}:team1`],
  ),
  team2Name: getTeamLabel(
    match,
    match.team2,
    match.previousRightMatch,
    'team2',
    placeholderAssignments[`${match.id}:team2`],
  ),
  team1Points: Array.isArray(match.team1Points) ? match.team1Points : [],
  team2Points: Array.isArray(match.team2Points) ? match.team2Points : [],
});

const buildLane = (
  matchesById: Record<string, Match>,
  options: {
    losersBracket: boolean;
    rootMatchId?: string | null;
    placeholderAssignments?: Record<string, string>;
  },
): PublicBracketWidgetLane | null => {
  const layout = buildBracketCanvasLayout(matchesById, {
    isLosersBracket: options.losersBracket,
    rootMatchId: options.rootMatchId,
    allowRelationFallbackWhenIdBlank: true,
  });
  const matchIds = Object.keys(layout.positionById);
  if (!matchIds.length) {
    return null;
  }

  return {
    matchIds,
    cardsById: Object.fromEntries(
      matchIds
        .map((matchId) => {
          const match = layout.treeById[matchId];
          return match ? [matchId, buildMatchCard(match, options.placeholderAssignments ?? {})] : null;
        })
        .filter((entry): entry is [string, PublicBracketWidgetMatchCard] => Boolean(entry)),
    ),
    metrics: layout.metrics,
    positionById: layout.positionById,
    contentSize: layout.contentSize,
    connections: layout.connections,
  };
};

export const buildPublicBracketWidgetView = (
  event: Tournament | League,
  requestedDivisionId?: string | null,
): PublicBracketWidgetView | null => {
  const isLeagueEvent = event instanceof League || (event as { eventType?: unknown }).eventType === 'LEAGUE';
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
      winnersLane: null,
      losersLane: null,
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
  const hasLosersMatches = Object.values(selectedMatchesById).some((match) => Boolean(match.losersBracket));
  const placeholderAssignments = isLeagueEvent
    ? buildLeaguePlayoffPlaceholderAssignments(event as League, Object.values(selectedMatchesById))
    : {};

  const winnersLane = buildLane(selectedMatchesById, {
    losersBracket: false,
    rootMatchId: selectedRootMatch.id,
    placeholderAssignments,
  });
  const losersLane = hasLosersMatches
    ? buildLane(selectedMatchesById, {
        losersBracket: true,
        placeholderAssignments,
      })
    : null;

  return {
    divisionOptions,
    selectedDivisionId,
    selectedDivisionName: divisionOptions.find((option) => option.value === selectedDivisionId)?.label ?? null,
    winnersLane,
    losersLane,
    hasLosersBracket: Boolean(losersLane && losersLane.matchIds.length > 0),
  };
};
