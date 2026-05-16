import type { Division, Event, Match } from '@/types';
import { normalizeBracketSeed } from '@/lib/bracketSeeds';

export type BracketTeamSlot = 'team1' | 'team2';

type PlayoffBracketSlot = {
  matchId: string;
  slot: BracketTeamSlot;
  seed: number | null;
  playoffDivisionId: string;
};

const normalizeDivisionIdentifier = (value: unknown): string => String(value ?? '').trim().toLowerCase();

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
  const row = value as Record<string, unknown>;
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
  const row = value as Record<string, unknown>;
  const candidates = [row.$id, row.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
};

const normalizeMatchRefId = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const hasResolvedMatchLink = (
  idValue: unknown,
  relationValue: unknown,
  matchesById: Record<string, Match>,
): boolean => {
  const id = normalizeMatchRefId(idValue);
  if (id.length > 0 && Boolean(matchesById[id])) {
    return true;
  }
  if (idValue === null || (typeof idValue === 'string' && idValue.trim().length === 0)) {
    return false;
  }
  const relationId = extractEntityId(relationValue);
  return relationId.length > 0 && Boolean(matchesById[relationId]);
};

const normalizeDivisionDetailsList = (input: unknown): Division[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const id = extractDivisionIdentifier(row.id ?? row.$id ?? row.key);
      const key = typeof row.key === 'string' ? row.key.trim() : undefined;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const playoffPlacementDivisionIds = Array.isArray(row.playoffPlacementDivisionIds)
        ? row.playoffPlacementDivisionIds
            .map((divisionId) => (typeof divisionId === 'string' ? divisionId.trim() : ''))
            .filter((divisionId) => divisionId.length > 0)
        : [];
      const playoffTeamCount = typeof row.playoffTeamCount === 'number' && Number.isFinite(row.playoffTeamCount)
        ? Math.max(0, Math.trunc(row.playoffTeamCount))
        : undefined;
      return {
        ...(row as Partial<Division>),
        id: id || key || '',
        key,
        name,
        playoffPlacementDivisionIds,
        playoffTeamCount,
      } as Division;
    })
    .filter((entry): entry is Division => entry !== null);
};

const extractEventDivisionOrder = (divisions: Event['divisions'] | undefined): string[] => {
  if (!Array.isArray(divisions)) {
    return [];
  }
  return divisions
    .map((division) => extractDivisionIdentifier(division))
    .filter((divisionId) => divisionId.length > 0);
};

const collectAllDivisionDetails = (tournament: Event): Division[] => {
  const primary = normalizeDivisionDetailsList(tournament.divisionDetails);
  const playoff = normalizeDivisionDetailsList(tournament.playoffDivisionDetails);
  const divisionsFromEvent = normalizeDivisionDetailsList(
    Array.isArray(tournament.divisions)
      ? tournament.divisions.filter((entry) => entry && typeof entry === 'object')
      : [],
  );
  return [...primary, ...playoff, ...divisionsFromEvent];
};

const resolveDivisionDisplayName = (detail: Division, allDivisionDetails: Division[]): string => {
  const explicitName = String(detail.name ?? '').trim();
  if (explicitName.length > 0) {
    return explicitName;
  }

  const fallbackIdentifier = extractDivisionIdentifier(detail);
  if (fallbackIdentifier.length > 0) {
    const matched = allDivisionDetails.find((candidate) =>
      divisionsEquivalent(candidate.id, fallbackIdentifier) ||
      divisionsEquivalent(candidate.key, fallbackIdentifier),
    );
    const matchedName = String(matched?.name ?? '').trim();
    if (matchedName.length > 0) {
      return matchedName;
    }
    return fallbackIdentifier;
  }

  return 'TBD';
};

const orderDivisionDetailsForMappings = (eventDivisionIds: string[], divisionDetails: Division[]): Division[] => {
  if (divisionDetails.length === 0) {
    return [];
  }
  const remaining = [...divisionDetails];
  const ordered: Division[] = [];

  eventDivisionIds.forEach((divisionId) => {
    const matchedIndex = remaining.findIndex((detail) =>
      divisionsEquivalent(detail.id, divisionId) ||
      divisionsEquivalent(detail.key, divisionId),
    );
    if (matchedIndex >= 0) {
      ordered.push(remaining.splice(matchedIndex, 1)[0]);
    }
  });

  return [...ordered, ...remaining];
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

const buildMappedPlacementLabelsForPlayoffDivision = (
  playoffDivisionId: string,
  mappingDivisionDetails: Division[],
  allDivisionDetails: Division[],
  eventPlayoffTeamCount?: number,
  options?: {
    implicitSelfMappings?: boolean;
  },
): string[] => {
  const allowImplicitSelfMappings = Boolean(options?.implicitSelfMappings);
  const resolvePlacementMappings = (detail: Division): string[] => {
    const explicitMappings = Array.isArray(detail.playoffPlacementDivisionIds)
      ? detail.playoffPlacementDivisionIds
      : [];
    const hasExplicitMapping = explicitMappings.some((divisionId) => normalizeDivisionIdentifier(divisionId).length > 0);
    if (hasExplicitMapping || !allowImplicitSelfMappings) {
      return explicitMappings;
    }

    const detailTeamCount = typeof detail.playoffTeamCount === 'number'
      ? Math.max(0, Math.trunc(detail.playoffTeamCount))
      : undefined;
    const placementLimit = detailTeamCount ?? eventPlayoffTeamCount ?? 0;
    if (placementLimit <= 0) {
      return [];
    }
    return Array.from({ length: placementLimit }, () => detail.id);
  };

  const labels: string[] = [];
  const maxPlacementIndex = mappingDivisionDetails.reduce((maxValue, detail) => {
    const mappedLength = resolvePlacementMappings(detail).length;
    const detailTeamCount = typeof detail.playoffTeamCount === 'number'
      ? Math.max(0, Math.trunc(detail.playoffTeamCount))
      : undefined;
    return Math.max(maxValue, Math.max(mappedLength, detailTeamCount ?? eventPlayoffTeamCount ?? 0));
  }, 0);

  for (let placementIndex = 0; placementIndex < maxPlacementIndex; placementIndex += 1) {
    for (const detail of mappingDivisionDetails) {
      const mappedDivisionIds = resolvePlacementMappings(detail);
      const detailTeamCount = typeof detail.playoffTeamCount === 'number'
        ? Math.max(0, Math.trunc(detail.playoffTeamCount))
        : undefined;
      const placementLimit = detailTeamCount ?? eventPlayoffTeamCount ?? mappedDivisionIds.length;
      if (placementIndex >= placementLimit) {
        continue;
      }
      const mappedPlayoffDivisionId = mappedDivisionIds[placementIndex] ?? '';
      if (!divisionsEquivalent(mappedPlayoffDivisionId, playoffDivisionId)) {
        continue;
      }
      labels.push(
        `${formatOrdinalPlacement(placementIndex + 1)} place (${resolveDivisionDisplayName(detail, allDivisionDetails)})`,
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

const buildLeaguePlayoffPlaceholderAssignments = ({
  eventDivisionIds,
  divisionDetails,
  allDivisionDetails,
  eventPlayoffTeamCount,
  splitLeaguePlayoffDivisions,
  slots,
}: {
  eventDivisionIds: string[];
  divisionDetails: Division[];
  allDivisionDetails: Division[];
  eventPlayoffTeamCount?: number;
  splitLeaguePlayoffDivisions?: boolean;
  slots: PlayoffBracketSlot[];
}): Record<string, string> => {
  if (divisionDetails.length === 0 || slots.length === 0) {
    return {};
  }

  const orderedDetails = orderDivisionDetailsForMappings(eventDivisionIds, divisionDetails);
  if (orderedDetails.length === 0) {
    return {};
  }

  const slotsByPlayoffDivision = new Map<string, PlayoffBracketSlot[]>();
  slots.forEach((slot) => {
    const normalizedPlayoffDivisionId = normalizeDivisionIdentifier(slot.playoffDivisionId);
    if (normalizedPlayoffDivisionId.length === 0) {
      return;
    }
    const existing = slotsByPlayoffDivision.get(normalizedPlayoffDivisionId) ?? [];
    existing.push(slot);
    slotsByPlayoffDivision.set(normalizedPlayoffDivisionId, existing);
  });
  if (slotsByPlayoffDivision.size === 0) {
    return {};
  }

  const result: Record<string, string> = {};
  slotsByPlayoffDivision.forEach((divisionSlots, playoffDivisionId) => {
    const labels = buildMappedPlacementLabelsForPlayoffDivision(
      playoffDivisionId,
      orderedDetails,
      allDivisionDetails,
      eventPlayoffTeamCount,
      { implicitSelfMappings: !splitLeaguePlayoffDivisions },
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

export const buildLeaguePlayoffPlaceholderAssignmentsForMatches = ({
  tournament,
  matchesById,
}: {
  tournament: Event;
  matchesById: Record<string, Match>;
}): Record<string, string> => {
  if (!tournament.includePlayoffs) {
    return {};
  }
  const eventDivisionIds = extractEventDivisionOrder(tournament.divisions);
  const allDivisionDetails = collectAllDivisionDetails(tournament);
  const divisionDetails = (() => {
    const explicit = normalizeDivisionDetailsList(tournament.divisionDetails);
    if (explicit.length > 0) {
      return explicit;
    }
    return allDivisionDetails;
  })();
  if (divisionDetails.length === 0) {
    return {};
  }

  const slots: PlayoffBracketSlot[] = [];
  Object.values(matchesById).forEach((match) => {
    if (match.losersBracket) {
      return;
    }
    const playoffDivisionId = extractDivisionIdentifier(match.division);
    if (playoffDivisionId.length === 0) {
      return;
    }
    const leftEntrantSlot = !hasResolvedMatchLink(match.previousLeftId, match.previousLeftMatch, matchesById);
    const rightEntrantSlot = !hasResolvedMatchLink(match.previousRightId, match.previousRightMatch, matchesById);
    if (!leftEntrantSlot && !rightEntrantSlot) {
      return;
    }
    const { team1Seed, team2Seed } = resolveEntrantSlotSeeds(match, leftEntrantSlot, rightEntrantSlot);
    if (leftEntrantSlot) {
      slots.push({ matchId: match.$id, slot: 'team1', seed: team1Seed, playoffDivisionId });
    }
    if (rightEntrantSlot) {
      slots.push({ matchId: match.$id, slot: 'team2', seed: team2Seed, playoffDivisionId });
    }
  });
  if (slots.length === 0) {
    return {};
  }

  const eventPlayoffTeamCount = typeof tournament.playoffTeamCount === 'number' &&
    Number.isFinite(tournament.playoffTeamCount)
    ? Math.max(0, Math.trunc(tournament.playoffTeamCount))
    : undefined;

  return buildLeaguePlayoffPlaceholderAssignments({
    eventDivisionIds,
    divisionDetails,
    allDivisionDetails,
    eventPlayoffTeamCount,
    splitLeaguePlayoffDivisions: Boolean(tournament.splitLeaguePlayoffDivisions),
    slots,
  });
};
