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

type DivisionCapacityEvent = Pick<Event, 'singleDivision' | 'divisionDetails' | 'maxParticipants'>
  & Partial<Pick<Event, 'playoffDivisionDetails' | 'eventType' | 'includePlayoffs' | 'includePlayoffsOrPools'>>;

type DivisionCapacityTarget = {
  detail: Division;
  matchDetails: Division[];
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

const getDivisionPlacementDivisionIds = (detail: Pick<Division, 'playoffPlacementDivisionIds'>): string[] => (
  normalizeIdList(detail.playoffPlacementDivisionIds)
);

const isPlayoffDivision = (detail: Pick<Division, 'kind'>): boolean => (
  normalizeDivisionToken(detail.kind) === 'playoff'
);

const isGeneratedPoolDivision = (detail: Division): boolean => (
  !isPlayoffDivision(detail) && getDivisionPlacementDivisionIds(detail).length > 0
);

const stripGeneratedPoolSuffix = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const stripped = value.trim().replace(/[\s_-]+pool[\s_-]+[a-z]+$/i, '').trim();
  return stripped.length > 0 ? stripped : null;
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

const targetMatchesSelection = (
  target: DivisionCapacityTarget,
  normalizedSelection: string,
): boolean => (
  divisionMatchesSelection(target.detail, normalizedSelection)
  || target.matchDetails.some((detail) => divisionMatchesSelection(detail, normalizedSelection))
);

const normalizeDetailRows = (rows: unknown): Division[] => (
  Array.isArray(rows)
    ? rows.filter((detail): detail is Division => Boolean(detail && typeof detail === 'object'))
    : []
);

const unionTeamIds = (details: Division[]): string[] => {
  const ids = new Set<string>();
  details.forEach((detail) => {
    normalizeIdList(detail.teamIds).forEach((teamId) => ids.add(teamId));
  });
  return Array.from(ids);
};

const targetCapacity = (target: DivisionCapacityTarget): number => (
  normalizeCapacity(target.detail.maxParticipants) ?? 0
);

const targetFilled = (
  target: DivisionCapacityTarget,
  eligibleTeamIdSet: Set<string> | null,
): number => {
  const filledTeamIds = unionTeamIds([target.detail, ...target.matchDetails]);
  return eligibleTeamIdSet
    ? filledTeamIds.filter((teamId) => eligibleTeamIdSet.has(teamId)).length
    : filledTeamIds.length;
};

const isTournamentPoolPlayCapacityEvent = (
  event: Pick<DivisionCapacityEvent, 'eventType' | 'includePlayoffs' | 'includePlayoffsOrPools'>,
  detailRows: Division[],
): boolean => {
  const eventType = typeof event.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
  const includePools = typeof event.includePlayoffsOrPools === 'boolean'
    ? event.includePlayoffsOrPools
    : event.includePlayoffs === true;
  return eventType === 'TOURNAMENT' && includePools && detailRows.some(isGeneratedPoolDivision);
};

const getFirstPlacementId = (detail: Division): string | null => (
  getDivisionPlacementDivisionIds(detail)[0] ?? null
);

const buildSyntheticBracketTarget = (bracketId: string, poolDetails: Division[]): DivisionCapacityTarget | null => {
  if (!bracketId || !poolDetails.length) {
    return null;
  }
  const firstPool = poolDetails[0];
  const capacity = poolDetails.reduce((total, pool) => total + (normalizeCapacity(pool.maxParticipants) ?? 0), 0);
  const name = stripGeneratedPoolSuffix(firstPool.name) ?? stripGeneratedPoolSuffix(firstPool.key) ?? bracketId;

  return {
    detail: {
      ...firstPool,
      id: bracketId,
      key: bracketId,
      kind: 'PLAYOFF',
      name,
      maxParticipants: capacity,
      teamIds: unionTeamIds(poolDetails),
      playoffPlacementDivisionIds: [],
    },
    matchDetails: poolDetails,
  };
};

const buildDivisionCapacityTargets = (params: {
  event: DivisionCapacityEvent;
  excludePlayoffs?: boolean;
}): DivisionCapacityTarget[] => {
  const detailRows = normalizeDetailRows(params.event.divisionDetails);
  if (!isTournamentPoolPlayCapacityEvent(params.event, detailRows)) {
    return detailRows
      .filter((detail) => {
        if (!params.excludePlayoffs) {
          return true;
        }
        return !isPlayoffDivision(detail);
      })
      .map((detail) => ({ detail, matchDetails: [detail] }));
  }

  const poolDetails = detailRows.filter(isGeneratedPoolDivision);
  const poolsByBracketId = new Map<string, Division[]>();
  poolDetails.forEach((pool) => {
    const bracketId = getFirstPlacementId(pool);
    if (!bracketId) {
      return;
    }
    const bucket = poolsByBracketId.get(bracketId) ?? [];
    bucket.push(pool);
    poolsByBracketId.set(bracketId, bucket);
  });

  const playoffDetails = normalizeDetailRows(params.event.playoffDivisionDetails);
  const usedBracketIds = new Set<string>();
  const targets: DivisionCapacityTarget[] = [];

  playoffDetails.forEach((bracket) => {
    const bracketId = typeof bracket.id === 'string' ? bracket.id : '';
    if (!bracketId) {
      return;
    }
    const matchingPools = Array.from(poolsByBracketId.entries())
      .filter(([poolBracketId]) => divisionMatchesSelection(bracket, normalizeDivisionToken(poolBracketId) ?? ''))
      .flatMap(([poolBracketId, pools]) => {
        usedBracketIds.add(poolBracketId);
        return pools;
      });
    const poolCapacity = matchingPools.reduce((total, pool) => total + (normalizeCapacity(pool.maxParticipants) ?? 0), 0);
    const bracketCapacity = normalizeCapacity(bracket.maxParticipants) ?? 0;
    targets.push({
      detail: {
        ...bracket,
        maxParticipants: poolCapacity > 0 ? poolCapacity : bracketCapacity,
        teamIds: unionTeamIds([bracket, ...matchingPools]),
      },
      matchDetails: [bracket, ...matchingPools],
    });
  });

  poolsByBracketId.forEach((pools, bracketId) => {
    if (usedBracketIds.has(bracketId)) {
      return;
    }
    const synthetic = buildSyntheticBracketTarget(bracketId, pools);
    if (synthetic) {
      targets.push(synthetic);
    }
  });

  return targets;
};

export const resolveDivisionCapacitySnapshot = (params: {
  event: DivisionCapacityEvent | null | undefined;
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

  const matched = buildDivisionCapacityTargets({
    event: params.event,
  }).find((target) => targetMatchesSelection(target, normalizedSelection));

  if (!matched) {
    return null;
  }

  const eligibleTeamIdSet = params.eligibleTeamIds
    ? new Set(normalizeIdList(params.eligibleTeamIds))
    : null;

  return {
    capacity: targetCapacity(matched),
    filled: targetFilled(matched, eligibleTeamIdSet),
  };
};

export const isDivisionAtCapacity = (snapshot: DivisionCapacitySnapshot | null): boolean => (
  Boolean(snapshot && snapshot.capacity > 0 && snapshot.filled >= snapshot.capacity)
);

export const buildDivisionCapacityBreakdown = (params: {
  event: DivisionCapacityEvent;
  excludePlayoffs?: boolean;
  eligibleTeamIds?: string[] | null | undefined;
}): DivisionCapacityBreakdownRow[] => {
  if (params.event.singleDivision !== false) {
    return [];
  }

  const eligibleTeamIdSet = params.eligibleTeamIds
    ? new Set(normalizeIdList(params.eligibleTeamIds))
    : null;
  const targets = buildDivisionCapacityTargets({
    event: params.event,
    excludePlayoffs: params.excludePlayoffs,
  });

  return targets
    .map((target) => {
      const { detail } = target;
      const divisionId = typeof detail.id === 'string' ? detail.id : '';
      const divisionKey = typeof detail.key === 'string' && detail.key.trim().length > 0 ? detail.key : null;
      const name = typeof detail.name === 'string' && detail.name.trim().length > 0 ? detail.name.trim() : null;
      const kind = typeof detail.kind === 'string' && detail.kind.trim().length > 0 ? detail.kind.trim() : null;
      const capacity = targetCapacity(target);
      const filled = targetFilled(target, eligibleTeamIdSet);

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
