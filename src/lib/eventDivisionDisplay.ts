import type { Division, Event } from '@/types';
import {
  extractDivisionTokenFromId,
  inferDivisionDetails,
  looksLikeLegacyDivisionMetadataLabel,
} from '@/lib/divisionTypes';

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const startCase = (value: string): string => (
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(' ')
);

const aliasesForIdentifier = (value: unknown): string[] => {
  const normalized = normalizeDivisionKey(value);
  if (!normalized) {
    return [];
  }
  const aliases = new Set([normalized]);
  const token = extractDivisionTokenFromId(normalized);
  if (token) {
    aliases.add(token);
  }
  return Array.from(aliases);
};

const aliasesForDivision = (division: Pick<Division, 'id' | 'key'>): string[] => {
  const aliases = new Set<string>();
  aliasesForIdentifier(division.id).forEach((alias) => aliases.add(alias));
  aliasesForIdentifier(division.key).forEach((alias) => aliases.add(alias));
  return Array.from(aliases);
};

const getDivisionIdFromEventEntry = (entry: Event['divisions'][number]): string | null => {
  if (typeof entry === 'string') {
    return normalizeDivisionKey(entry);
  }
  return normalizeDivisionKey(entry?.id)
    ?? normalizeDivisionKey(entry?.key)
    ?? normalizeDivisionKey(entry?.name);
};

const isPlayoffDivision = (division: Pick<Division, 'kind'> | null | undefined): boolean => (
  normalizeDivisionKey(division?.kind) === 'playoff'
);

const tournamentPoolSuffixRegex = /(?:^|[\s_-]+)pool[\s_-]*[a-z0-9]+$/i;

const stripTournamentPoolSuffix = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(tournamentPoolSuffixRegex);
  if (!match || match.index == null) {
    return null;
  }
  const stripped = trimmed.slice(0, match.index).trim();
  return stripped.length > 0 ? stripped : null;
};

const inferBracketIdFromPoolId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const stripped = stripTournamentPoolSuffix(trimmed);
  return stripped && stripped !== trimmed ? stripped : null;
};

const getFirstPlacementDivisionId = (division: Pick<Division, 'playoffPlacementDivisionIds'>): string | null => {
  if (!Array.isArray(division.playoffPlacementDivisionIds)) {
    return null;
  }
  return division.playoffPlacementDivisionIds
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .find((entry) => entry.length > 0) ?? null;
};

const getTournamentPoolBracketId = (division: Division): string | null => (
  getFirstPlacementDivisionId(division)
  ?? inferBracketIdFromPoolId(division.id)
  ?? inferBracketIdFromPoolId(division.key)
  ?? inferBracketIdFromPoolId(division.name)
);

const hasTournamentPoolPlay = (event: Event, details: Division[]): boolean => {
  const eventType = typeof event.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
  const includePools = typeof event.includePlayoffsOrPools === 'boolean'
    ? event.includePlayoffsOrPools
    : event.includePlayoffs === true;
  if (eventType !== 'TOURNAMENT' || !includePools) {
    return false;
  }
  return details.some((detail) => !isPlayoffDivision(detail) && Boolean(getTournamentPoolBracketId(detail)))
    || (Array.isArray(event.divisions) && event.divisions.some((entry) => {
      const divisionId = getDivisionIdFromEventEntry(entry);
      return Boolean(inferBracketIdFromPoolId(divisionId));
    }));
};

const indexDivisions = (details: Division[]) => {
  const byId = new Map<string, Division>();
  const byKey = new Map<string, Division>();
  details.forEach((detail) => {
    const detailId = normalizeDivisionKey(detail.id);
    const detailKey = normalizeDivisionKey(detail.key);
    if (detailId) {
      byId.set(detailId, detail);
      const token = extractDivisionTokenFromId(detailId);
      if (token) {
        byKey.set(token, detail);
      }
    }
    if (detailKey) {
      byKey.set(detailKey, detail);
    }
  });
  return { byId, byKey };
};

const getDivisionDetail = (
  identifier: string,
  indexes: ReturnType<typeof indexDivisions>,
): Division | null => (
  indexes.byId.get(identifier)
  ?? indexes.byKey.get(identifier)
  ?? indexes.byKey.get(extractDivisionTokenFromId(identifier) ?? '')
  ?? null
);

const buildTournamentBracketDisplayRows = (
  event: Event,
  details: Division[],
  playoffDetails: Division[],
): Division[] => {
  const explicitBracketRows = [...playoffDetails, ...details.filter(isPlayoffDivision)];
  if (explicitBracketRows.length > 0) {
    return explicitBracketRows;
  }

  const sportInput = event.sport?.name ?? event.sportId ?? undefined;
  const detailIndexes = indexDivisions(details);
  const detailsByAlias = new Map<string, Division>();
  details.forEach((detail) => {
    aliasesForDivision(detail).forEach((alias) => detailsByAlias.set(alias, detail));
  });

  const poolRows = new Map<string, Division>();
  details
    .filter((detail) => !isPlayoffDivision(detail) && Boolean(getTournamentPoolBracketId(detail)))
    .forEach((detail) => {
      const id = normalizeDivisionKey(detail.id) ?? normalizeDivisionKey(detail.key);
      if (id) {
        poolRows.set(id, detail);
      }
    });

  if (Array.isArray(event.divisions)) {
    event.divisions.forEach((entry) => {
      const divisionId = getDivisionIdFromEventEntry(entry);
      if (!divisionId || poolRows.has(divisionId)) {
        return;
      }
      const bracketId = inferBracketIdFromPoolId(divisionId);
      if (!bracketId) {
        return;
      }
      const detail = getDivisionDetail(divisionId, detailIndexes) ?? {
        id: divisionId,
        key: divisionId,
        name: stripTournamentPoolSuffix(divisionId) ?? divisionId,
        playoffPlacementDivisionIds: [bracketId],
      };
      poolRows.set(divisionId, detail);
    });
  }

  const bracketRows = new Map<string, Division>();
  poolRows.forEach((pool) => {
    const bracketId = getTournamentPoolBracketId(pool);
    const normalizedBracketId = normalizeDivisionKey(bracketId);
    if (!bracketId || !normalizedBracketId || bracketRows.has(normalizedBracketId)) {
      return;
    }
    const existingBracket = aliasesForIdentifier(bracketId)
      .map((alias) => detailsByAlias.get(alias))
      .find((detail): detail is Division => Boolean(detail));
    const inferredBracketName = inferDivisionDetails({
      identifier: existingBracket?.key ?? existingBracket?.id ?? bracketId,
      sportInput,
      fallbackName: existingBracket?.name,
    }).defaultName;
    bracketRows.set(normalizedBracketId, {
      ...(existingBracket ?? pool),
      id: bracketId,
      key: existingBracket?.key ?? stripTournamentPoolSuffix(pool.key) ?? extractDivisionTokenFromId(bracketId) ?? bracketId,
      kind: 'PLAYOFF',
      name: existingBracket?.name
        ?? stripTournamentPoolSuffix(pool.name)
        ?? inferredBracketName,
      playoffPlacementDivisionIds: [],
    });
  });

  return Array.from(bracketRows.values());
};

const labelForDivision = (params: {
  divisionId: string;
  detail: Division | null;
  sportInput?: string;
}): string => {
  const labelFromDetail = params.detail?.name?.trim();
  const fallbackIdentifier = params.detail?.key
    ?? params.detail?.id
    ?? extractDivisionTokenFromId(params.divisionId)
    ?? params.divisionId;
  const inferred = inferDivisionDetails({
    identifier: fallbackIdentifier,
    sportInput: params.sportInput,
    fallbackName: labelFromDetail || undefined,
  });
  return labelFromDetail && !looksLikeLegacyDivisionMetadataLabel(labelFromDetail)
    ? labelFromDetail
    : inferred.defaultName || startCase(fallbackIdentifier);
};

const dedupeLabels = (labels: string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  labels.forEach((label) => {
    const normalized = label.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(normalized);
  });
  return deduped;
};

export const buildEventDivisionDisplayLabels = (event: Event): string[] => {
  const details = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
  const playoffDetails = Array.isArray(event.playoffDivisionDetails) ? event.playoffDivisionDetails : [];
  const sportInput = event.sport?.name ?? event.sportId ?? undefined;

  if (hasTournamentPoolPlay(event, details)) {
    return dedupeLabels(
      buildTournamentBracketDisplayRows(event, details, playoffDetails).map((detail) => (
        labelForDivision({
          divisionId: detail.id,
          detail,
          sportInput,
        })
      )),
    );
  }

  const detailIndexes = indexDivisions(details);
  const playoffAliases = new Set<string>();
  [...details, ...playoffDetails]
    .filter(isPlayoffDivision)
    .forEach((detail) => aliasesForDivision(detail).forEach((alias) => playoffAliases.add(alias)));

  const divisionIds = Array.isArray(event.divisions)
    ? event.divisions
      .map(getDivisionIdFromEventEntry)
      .filter((entry): entry is string => Boolean(entry))
      .filter((entry) => !aliasesForIdentifier(entry).some((alias) => playoffAliases.has(alias)))
    : [];

  return dedupeLabels(
    divisionIds.map((divisionId) => (
      labelForDivision({
        divisionId,
        detail: getDivisionDetail(divisionId, detailIndexes),
        sportInput,
      })
    )),
  );
};
