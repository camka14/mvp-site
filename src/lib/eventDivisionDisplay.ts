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

const dedupeDivisions = (divisions: Division[]): Division[] => {
  const rows = new Map<string, Division>();
  divisions.forEach((division) => {
    const key = normalizeDivisionKey(division.id)
      ?? normalizeDivisionKey(division.key)
      ?? normalizeDivisionKey(division.name);
    if (key && !rows.has(key)) {
      rows.set(key, division);
    }
  });
  return Array.from(rows.values());
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
    return dedupeDivisions(explicitBracketRows);
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

type EventDivisionDisplayRow = {
  divisionId: string;
  detail: Division | null;
  label: string;
};

const buildEventDivisionDisplayRows = (event: Event): EventDivisionDisplayRow[] => {
  const details = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
  const playoffDetails = Array.isArray(event.playoffDivisionDetails) ? event.playoffDivisionDetails : [];
  const sportInput = event.sport?.name ?? event.sportId ?? undefined;

  if (hasTournamentPoolPlay(event, details)) {
    return buildTournamentBracketDisplayRows(event, details, playoffDetails).map((detail) => ({
      divisionId: detail.id,
      detail,
      label: labelForDivision({
        divisionId: detail.id,
        detail,
        sportInput,
      }),
    }));
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
      .filter((entry, index, entries) => entries.indexOf(entry) === index)
    : [];

  return divisionIds.map((divisionId) => {
    const detail = getDivisionDetail(divisionId, detailIndexes);
    return {
      divisionId,
      detail,
      label: labelForDivision({
        divisionId,
        detail,
        sportInput,
      }),
    };
  });
};

export const buildEventDivisionDisplayLabels = (event: Event): string[] => (
  dedupeLabels(buildEventDivisionDisplayRows(event).map((row) => row.label))
);

type EventDivisionAxes = {
  gender: string | null;
  ageId: string | null;
  ageLabel: string | null;
  skillId: string | null;
  skillLabel: string | null;
};

const dualAxisTokenRegex = /^([mfc])_skill_(.+)_age_(.+)$/i;
const singleAxisTokenRegex = /^([mfc])_(age|skill)_(.+)$/i;
const compactAgeTokenRegex = /^([mfc])_(u\d+|\d+u|\d+plus)$/i;
const underAgeRegex = /^(?:u(\d+)|(\d+)u)$/i;
const plusAgeRegex = /^(\d+)(?:plus|\+)$/i;
const exactAgeLabelRegex = /^(?:u?\d+u?|\d+\+)$/i;
const skillOrder = new Map([
  ['recreational', 0],
  ['rec', 0],
  ['beginner', 1],
  ['novice', 1],
  ['developmental', 2],
  ['local', 3],
  ['intermediate', 4],
  ['select', 5],
  ['competitive', 6],
  ['advanced', 7],
  ['premier', 8],
  ['elite', 9],
  ['national', 10],
  ['open', 11],
]);

const normalizeAxisId = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '_');

const compactAxisToken = (value: string): string => {
  const normalized = normalizeAxisId(value);
  const underAgeMatch = normalized.match(underAgeRegex);
  if (underAgeMatch) {
    return `U${underAgeMatch[1] || underAgeMatch[2]}`;
  }
  const plusAgeMatch = normalized.match(plusAgeRegex);
  if (plusAgeMatch) {
    return `${plusAgeMatch[1]}+`;
  }
  if (normalized === 'recreational' || normalized === 'rec') {
    return 'Rec';
  }
  return startCase(normalized);
};

const eventDivisionAxes = (row: EventDivisionDisplayRow): EventDivisionAxes => {
  const detail = row.detail;
  const token = extractDivisionTokenFromId(detail?.key ?? detail?.id ?? row.divisionId)
    ?? normalizeAxisId(detail?.key ?? detail?.id ?? row.divisionId);
  const dualMatch = token.match(dualAxisTokenRegex);
  const singleMatch = token.match(singleAxisTokenRegex);
  const compactAgeMatch = token.match(compactAgeTokenRegex);
  const normalizedName = row.label.trim();
  const nameIsOnlyAge = exactAgeLabelRegex.test(normalizedName);
  const tokenGender = dualMatch?.[1]
    ?? singleMatch?.[1]
    ?? compactAgeMatch?.[1]
    ?? token.match(/^([mfc])_/i)?.[1];
  const gender = normalizeDivisionKey(detail?.gender ?? tokenGender)?.toUpperCase() ?? null;
  const tokenAgeId = dualMatch?.[3]
    ?? (singleMatch?.[2]?.toLowerCase() === 'age' ? singleMatch[3] : null)
    ?? compactAgeMatch?.[2]
    ?? null;
  const tokenSkillId = dualMatch?.[2]
    ?? (singleMatch?.[2]?.toLowerCase() === 'skill' ? singleMatch[3] : null)
    ?? null;
  const ageId = normalizeDivisionKey(tokenAgeId ?? detail?.ageDivisionTypeId ?? (nameIsOnlyAge ? normalizedName : null));
  const skillIdCandidate = normalizeDivisionKey(
    tokenSkillId ?? detail?.skillDivisionTypeId ?? detail?.skillDivisionTypeName,
  );
  const skillId = compactAgeMatch || (
    nameIsOnlyAge &&
    !tokenSkillId &&
    !detail?.skillDivisionTypeId &&
    !detail?.skillDivisionTypeName
  )
    ? null
    : skillIdCandidate;

  return {
    gender: gender && ['M', 'F', 'C'].includes(gender) ? gender : null,
    ageId,
    ageLabel: normalizeDivisionKey(detail?.ageDivisionTypeName)
      ? detail?.ageDivisionTypeName?.trim() ?? null
      : nameIsOnlyAge ? normalizedName : null,
    skillId,
    skillLabel: normalizeDivisionKey(detail?.skillDivisionTypeName)
      ? detail?.skillDivisionTypeName?.trim() ?? null
      : null,
  };
};

const ageOrder = (value: string): number => {
  const normalized = normalizeAxisId(value);
  const underAgeMatch = normalized.match(underAgeRegex);
  if (underAgeMatch) return Number(underAgeMatch[1] || underAgeMatch[2]);
  const plusAgeMatch = normalized.match(plusAgeRegex);
  if (plusAgeMatch) return Number(plusAgeMatch[1]);
  return Number.MAX_SAFE_INTEGER;
};

const skillSortOrder = (value: string): number => {
  const normalized = normalizeAxisId(value);
  const knownOrder = skillOrder.get(normalized);
  if (knownOrder !== undefined) return knownOrder;
  const numberedLevel = normalized.match(/^[a-z]+(\d+)$/)?.[1];
  return numberedLevel ? 100 + Number(numberedLevel) : 1_000;
};

const uniqueAxes = (
  axes: EventDivisionAxes[],
  key: 'age' | 'skill',
): Array<{ id: string; label: string }> => {
  const values = new Map<string, { id: string; label: string }>();
  axes.forEach((axis) => {
    const id = key === 'age' ? axis.ageId : axis.skillId;
    const label = key === 'age' ? axis.ageLabel : axis.skillLabel;
    if (!id) return;
    const normalizedId = normalizeAxisId(id);
    if (!values.has(normalizedId)) {
      values.set(normalizedId, { id: normalizedId, label: label || compactAxisToken(normalizedId) });
    }
  });
  return Array.from(values.values()).sort((left, right) => {
    const order = key === 'age'
      ? ageOrder(left.id) - ageOrder(right.id)
      : skillSortOrder(left.id) - skillSortOrder(right.id);
    return order || left.label.localeCompare(right.label);
  });
};

const formatAxisRange = (values: Array<{ id: string; label: string }>): string | null => {
  if (values.length === 0) return null;
  if (values.length === 1) return compactAxisToken(values[0].label);
  return `${compactAxisToken(values[0].label)}–${compactAxisToken(values[values.length - 1].label)}`;
};

const formatGenderRange = (axes: EventDivisionAxes[]): string | null => {
  const genders = new Set(axes.map((axis) => axis.gender).filter(Boolean));
  const labels = [
    ['M', 'Men'],
    ['F', 'Women'],
    ['C', 'Coed'],
  ].filter(([id]) => genders.has(id)).map(([, label]) => label);
  return labels.length > 0 ? labels.join('/') : null;
};

export const buildEventDivisionCardLabel = (event: Event): string => {
  const rows = buildEventDivisionDisplayRows(event);
  const labels = dedupeLabels(rows.map((row) => row.label));
  if (rows.length <= 2) {
    return labels.join(', ');
  }

  const axes = rows.map(eventDivisionAxes);
  return [
    formatGenderRange(axes),
    formatAxisRange(uniqueAxes(axes, 'age')),
    formatAxisRange(uniqueAxes(axes, 'skill')),
    `${rows.length} divisions`,
  ].filter((value): value is string => Boolean(value)).join(' · ');
};
