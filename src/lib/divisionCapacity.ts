import type { Division, Event } from '@/types';
import { extractDivisionTokenFromId } from '@/lib/divisionTypes';

export type DivisionCapacitySnapshot = {
  filled: number;
  capacity: number;
};

export type DivisionCapacityBreakdownRow = DivisionCapacitySnapshot & {
  divisionId: string;
  divisionKey: string | null;
  name: string | null;
  kind: string | null;
};

const normalizeDivisionToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeCapacity = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.trunc(numeric));
};

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const divisionMatchesSelection = (
  row: Pick<Division, 'id' | 'key'>,
  normalizedSelection: string,
): boolean => {
  const aliases = new Set<string>();
  const rowId = normalizeDivisionToken(row.id);
  const rowKey = normalizeDivisionToken(row.key);

  if (rowId) {
    aliases.add(rowId);
    const token = extractDivisionTokenFromId(rowId);
    if (token) {
      aliases.add(token);
    }
  }

  if (rowKey) {
    aliases.add(rowKey);
  }

  return aliases.has(normalizedSelection);
};

export const resolveDivisionCapacitySnapshot = (params: {
  event: Pick<Event, 'singleDivision' | 'divisionDetails' | 'maxParticipants'> | null | undefined;
  divisionId: string | null | undefined;
  eligibleTeamIds?: string[] | null | undefined;
}): DivisionCapacitySnapshot | null => {
  if (!params.event) {
    return null;
  }

  if (params.event.singleDivision !== false) {
    return null;
  }

  const normalizedSelection = normalizeDivisionToken(params.divisionId);
  if (!normalizedSelection) {
    return null;
  }

  const detailRows = Array.isArray(params.event.divisionDetails) ? params.event.divisionDetails : [];
  const matched = detailRows.find((detail) => {
    if (!detail || typeof detail !== 'object') {
      return false;
    }
    return divisionMatchesSelection(detail, normalizedSelection);
  });

  if (!matched) {
    return null;
  }

  const capacity = normalizeCapacity(matched.maxParticipants)
    ?? normalizeCapacity(params.event.maxParticipants)
    ?? 0;
  const eligibleTeamIdSet = params.eligibleTeamIds
    ? new Set(normalizeIdList(params.eligibleTeamIds))
    : null;
  const filledTeamIds = normalizeIdList(matched.teamIds);
  const filled = eligibleTeamIdSet
    ? filledTeamIds.filter((teamId) => eligibleTeamIdSet.has(teamId)).length
    : filledTeamIds.length;

  return { capacity, filled };
};

export const isDivisionAtCapacity = (snapshot: DivisionCapacitySnapshot | null): boolean => (
  Boolean(snapshot && snapshot.capacity > 0 && snapshot.filled >= snapshot.capacity)
);

export const buildDivisionCapacityBreakdown = (params: {
  event: Pick<Event, 'singleDivision' | 'divisionDetails' | 'maxParticipants'>;
  excludePlayoffs?: boolean;
  eligibleTeamIds?: string[] | null | undefined;
}): DivisionCapacityBreakdownRow[] => {
  if (params.event.singleDivision !== false) {
    return [];
  }

  const fallbackCapacity = normalizeCapacity(params.event.maxParticipants) ?? 0;
  const eligibleTeamIdSet = params.eligibleTeamIds
    ? new Set(normalizeIdList(params.eligibleTeamIds))
    : null;
  const detailRows = Array.isArray(params.event.divisionDetails) ? params.event.divisionDetails : [];

  return detailRows
    .filter((detail): detail is Division => Boolean(detail && typeof detail === 'object'))
    .filter((detail) => {
      if (!params.excludePlayoffs) {
        return true;
      }
      const kind = normalizeDivisionToken(detail.kind);
      return kind !== 'playoff';
    })
    .map((detail) => {
      const divisionId = typeof detail.id === 'string' ? detail.id : '';
      const divisionKey = typeof detail.key === 'string' && detail.key.trim().length > 0 ? detail.key : null;
      const name = typeof detail.name === 'string' && detail.name.trim().length > 0 ? detail.name.trim() : null;
      const kind = typeof detail.kind === 'string' && detail.kind.trim().length > 0 ? detail.kind.trim() : null;
      const capacity = normalizeCapacity(detail.maxParticipants) ?? fallbackCapacity;
      const divisionTeamIds = normalizeIdList(detail.teamIds);
      const filled = eligibleTeamIdSet
        ? divisionTeamIds.filter((teamId) => eligibleTeamIdSet.has(teamId)).length
        : divisionTeamIds.length;

      return {
        divisionId,
        divisionKey,
        name,
        kind,
        capacity,
        filled,
      };
    })
    .filter((row) => row.divisionId.length > 0)
    .filter((row) => row.capacity > 0 || row.filled > 0);
};
