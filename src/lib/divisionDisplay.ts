import type { Division } from '@/types';
import {
  cleanDivisionDisplayName,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  looksLikeLegacyDivisionMetadataLabel,
} from '@/lib/divisionTypes';

const tournamentPoolSuffixRegex = /(?:^|[\s_-]+)pool[\s_-]*([a-z0-9]+)$/i;

const normalizeDivisionLookupKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const resolveLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const resolveTournamentPoolDisplayName = (value: unknown): string | null => {
  const raw = resolveLabel(value);
  if (!raw) {
    return null;
  }
  const match = raw.match(tournamentPoolSuffixRegex);
  if (!match) {
    return null;
  }
  const suffix = match[1]?.trim();
  if (!suffix) {
    return null;
  }
  return `Pool ${suffix.toUpperCase()}`;
};

const toDisplayDivisionLabel = (value: string | null): string | null => {
  if (!value) return null;
  return looksLikeLegacyDivisionMetadataLabel(value) ? null : value;
};

const rowHasPoolPlacement = (row: Record<string, unknown>): boolean => (
  Array.isArray(row.playoffPlacementDivisionIds)
  && row.playoffPlacementDivisionIds.some((entry) => typeof entry === 'string' && entry.trim().length > 0)
);

const resolvePoolDisplayNameForRow = (row: Record<string, unknown>): string | null => {
  const poolName = resolveTournamentPoolDisplayName(row.name)
    ?? resolveTournamentPoolDisplayName(row.key)
    ?? resolveTournamentPoolDisplayName(row.id);
  return rowHasPoolPlacement(row) ? poolName : null;
};

export const buildDivisionDisplayNameIndex = (divisionDetails: unknown): Map<string, string> => {
  const index = new Map<string, string>();

  if (!Array.isArray(divisionDetails)) {
    return index;
  }

  divisionDetails.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const row = entry as Record<string, unknown>;
    const rawName = resolveLabel(row.name);
    const name = resolvePoolDisplayNameForRow(row) ?? toDisplayDivisionLabel(rawName);
    if (!name) {
      return;
    }

    const idKey = normalizeDivisionLookupKey(row.id);
    const keyKey = normalizeDivisionLookupKey(row.key);
    const tokenFromId = idKey ? normalizeDivisionLookupKey(extractDivisionTokenFromId(idKey)) : null;
    const tokenFromKey = keyKey ? normalizeDivisionLookupKey(extractDivisionTokenFromId(keyKey)) : null;

    [idKey, keyKey, tokenFromId, tokenFromKey].forEach((key) => {
      if (key && !index.has(key)) {
        index.set(key, name);
      }
    });
  });

  return index;
};

export const resolveDivisionDisplayName = (params: {
  division: Division | string | null | undefined;
  divisionNameIndex?: Map<string, string>;
  divisionDetails?: unknown;
  sportInput?: string | null;
}): string | null => {
  const division = params.division;

  if (division && typeof division === 'object') {
    const row = division as Division & Record<string, unknown>;
    const poolName = resolvePoolDisplayNameForRow(row);
    if (poolName) {
      return poolName;
    }
    const explicitName = toDisplayDivisionLabel(resolveLabel(row.name));
    if (explicitName) {
      return explicitName;
    }
  }

  const rawValue = typeof division === 'string'
    ? division
    : division && typeof division === 'object'
      ? ((division as Division).id ?? (division as Division).key ?? (division as Division).name)
      : null;

  const normalizedValue = normalizeDivisionLookupKey(rawValue);
  const index = params.divisionNameIndex ?? buildDivisionDisplayNameIndex(params.divisionDetails);

  const direct = normalizedValue ? index.get(normalizedValue) : null;
  if (direct) {
    return direct;
  }

  const token = normalizedValue ? normalizeDivisionLookupKey(extractDivisionTokenFromId(normalizedValue)) : null;
  const byToken = token ? index.get(token) : null;
  if (byToken) {
    return byToken;
  }

  const identifier = token ?? normalizedValue;
  if (!identifier) {
    return null;
  }

  const poolLabel = resolveTournamentPoolDisplayName(identifier);
  if (poolLabel) {
    return poolLabel;
  }

  const inferred = inferDivisionDetails({
    identifier,
    sportInput: params.sportInput ?? undefined,
  });

  return cleanDivisionDisplayName(inferred.defaultName, inferred.divisionTypeName);
};

