import type { Division } from '@/types';
import { extractDivisionTokenFromId, inferDivisionDetails } from '@/lib/divisionTypes';

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

const looksLikeLegacyDivisionMetadataLabel = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const hasWordSkill = /\\bskill\\b/.test(normalized);
  const hasWordAge = /\\bage\\b/.test(normalized);
  const hasTokenPattern = normalized.includes('skill_') && normalized.includes('_age_');
  return (hasWordSkill && hasWordAge) || hasTokenPattern;
};

const toDisplayDivisionLabel = (value: string | null): string | null => {
  if (!value) return null;
  return looksLikeLegacyDivisionMetadataLabel(value) ? null : value;
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
    const name = toDisplayDivisionLabel(rawName);
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
    const explicitName = toDisplayDivisionLabel(resolveLabel((division as Division).name));
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

  const inferred = inferDivisionDetails({
    identifier,
    sportInput: params.sportInput ?? undefined,
  });

  return inferred.defaultName;
};

