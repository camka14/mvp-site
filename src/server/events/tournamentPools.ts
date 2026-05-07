import { buildEventDivisionId, extractDivisionTokenFromId } from '@/lib/divisionTypes';

type PrismaLike = any;

export type TournamentPoolSourceRow = {
  id: string;
  key?: string | null;
  name?: string | null;
  kind?: string | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  playoffPlacementDivisionIds?: string[] | null;
  teamIds?: string[] | null;
};

export type TournamentBracketPoolInput = {
  id: string;
  key?: string | null;
  name?: string | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  poolCount?: number | null;
};

export type GeneratedTournamentPool = {
  id: string;
  key: string;
  name: string;
  kind: 'LEAGUE';
  maxParticipants: number;
  playoffTeamCount: number;
  playoffPlacementDivisionIds: string[];
  teamIds: string[];
};

export class TournamentPoolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentPoolValidationError';
  }
}

export const isTournamentPoolValidationError = (
  error: unknown,
): error is TournamentPoolValidationError => error instanceof TournamentPoolValidationError;

export const isTournamentPoolPlayEnabled = (event: {
  eventType?: unknown;
  includePlayoffs?: unknown;
  includePlayoffsOrPools?: unknown;
}): boolean => (
  typeof event.eventType === 'string'
  && event.eventType.toUpperCase() === 'TOURNAMENT'
  && (
    event.includePlayoffsOrPools === true
    || event.includePlayoffs === true
  )
);

export const normalizeTournamentPoolToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

export const normalizeTournamentPoolId = (value: unknown): string | null => {
  const normalized = normalizeTournamentPoolToken(value);
  if (!normalized) {
    return null;
  }
  return normalized;
};

const alphabeticLabel = (index: number): string => {
  let value = Math.max(0, Math.trunc(index));
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

export const tournamentPoolLetter = alphabeticLabel;

const numericInput = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
};

export const tournamentPoolCountFromValue = (value: unknown): number | null => {
  const parsed = numericInput(value);
  if (parsed == null || parsed < 1) {
    return null;
  }
  return parsed;
};

export const bracketReferencesForPool = (
  pool: Pick<TournamentPoolSourceRow, 'playoffPlacementDivisionIds'>,
): string[] => (
  Array.isArray(pool.playoffPlacementDivisionIds)
    ? pool.playoffPlacementDivisionIds
        .map((entry) => normalizeTournamentPoolToken(entry))
        .filter((entry): entry is string => Boolean(entry))
    : []
);

const identifierAliases = (value: unknown): Set<string> => {
  const aliases = new Set<string>();
  const normalized = normalizeTournamentPoolToken(value);
  if (normalized) {
    aliases.add(normalized);
    const token = extractDivisionTokenFromId(normalized);
    if (token) {
      aliases.add(token);
    }
  }
  return aliases;
};

export const poolReferencesBracket = (
  pool: Pick<TournamentPoolSourceRow, 'playoffPlacementDivisionIds'>,
  bracketDivisionId: string,
): boolean => {
  const bracketAliases = identifierAliases(bracketDivisionId);
  if (!bracketAliases.size) {
    return false;
  }
  return bracketReferencesForPool(pool).some((entry) => {
    const aliases = identifierAliases(entry);
    for (const alias of aliases) {
      if (bracketAliases.has(alias)) {
        return true;
      }
    }
    return false;
  });
};

export const generatedPoolsForBracket = (
  pools: TournamentPoolSourceRow[],
  bracketDivisionId: string,
): TournamentPoolSourceRow[] => (
  pools
    .filter((pool) => String(pool.kind ?? 'LEAGUE').toUpperCase() !== 'PLAYOFF')
    .filter((pool) => poolReferencesBracket(pool, bracketDivisionId))
    .sort((left, right) => String(left.name ?? left.id).localeCompare(String(right.name ?? right.id)))
);

export const deriveTournamentPoolCount = (
  bracket: TournamentBracketPoolInput,
  existingPools: TournamentPoolSourceRow[] = [],
): number | null => (
  tournamentPoolCountFromValue(bracket.poolCount)
  ?? (existingPools.length > 0 ? existingPools.length : null)
);

export const deriveTournamentPoolTeamCount = (params: {
  maxParticipants: unknown;
  poolCount: unknown;
  divisionName?: string | null;
}): number => {
  const maxParticipants = numericInput(params.maxParticipants);
  const poolCount = tournamentPoolCountFromValue(params.poolCount);
  const label = params.divisionName || 'Tournament division';
  if (maxParticipants == null || maxParticipants < 1) {
    throw new TournamentPoolValidationError(`${label} must have a max teams value when pool play is enabled.`);
  }
  if (poolCount == null) {
    throw new TournamentPoolValidationError(`${label} must have a pool count of at least 1 when pool play is enabled.`);
  }
  if (maxParticipants % poolCount !== 0) {
    throw new TournamentPoolValidationError(`${label} max teams must divide evenly by pool count.`);
  }
  return maxParticipants / poolCount;
};

export const deriveTournamentPoolAdvancingCount = (params: {
  bracketTeamsCount: unknown;
  poolCount: unknown;
  divisionName?: string | null;
}): number => {
  const bracketTeamsCount = numericInput(params.bracketTeamsCount);
  const poolCount = tournamentPoolCountFromValue(params.poolCount);
  const label = params.divisionName || 'Tournament division';
  if (bracketTeamsCount == null || bracketTeamsCount < 2) {
    throw new TournamentPoolValidationError(`${label} must have a bracket teams count of at least 2 when pool play is enabled.`);
  }
  if (poolCount == null) {
    throw new TournamentPoolValidationError(`${label} must have a pool count of at least 1 when pool play is enabled.`);
  }
  if (bracketTeamsCount % poolCount !== 0) {
    throw new TournamentPoolValidationError(`${label} bracket teams count must divide evenly by pool count.`);
  }
  return bracketTeamsCount / poolCount;
};

export const generatedTournamentPoolKey = (
  bracket: TournamentBracketPoolInput,
  index: number,
): string => {
  const baseKey = normalizeTournamentPoolToken(bracket.key)
    ?? normalizeTournamentPoolToken(extractDivisionTokenFromId(bracket.id))
    ?? normalizeTournamentPoolToken(bracket.name)
    ?? 'tournament_division';
  return `${baseKey}_pool_${alphabeticLabel(index).toLowerCase()}`;
};

export const buildGeneratedTournamentPools = (params: {
  eventId: string;
  bracket: TournamentBracketPoolInput;
  existingPools?: TournamentPoolSourceRow[];
}): GeneratedTournamentPool[] => {
  const existingPools = params.existingPools ?? [];
  const poolCount = deriveTournamentPoolCount(params.bracket, existingPools);
  const poolTeamCount = deriveTournamentPoolTeamCount({
    maxParticipants: params.bracket.maxParticipants,
    poolCount,
    divisionName: params.bracket.name,
  });
  const advancingPerPool = deriveTournamentPoolAdvancingCount({
    bracketTeamsCount: params.bracket.playoffTeamCount,
    poolCount,
    divisionName: params.bracket.name,
  });
  const bracketId = normalizeTournamentPoolId(params.bracket.id);
  if (!bracketId) {
    throw new TournamentPoolValidationError('Tournament bracket division is missing an id.');
  }
  const count = poolCount ?? 0;
  return Array.from({ length: count }).map((_, index) => {
    const key = generatedTournamentPoolKey(params.bracket, index);
    const existing = existingPools[index] ?? null;
    const id = normalizeTournamentPoolId(existing?.id) ?? buildEventDivisionId(params.eventId, key);
    const letter = alphabeticLabel(index);
    return {
      id,
      key,
      name: `Pool ${letter}`,
      kind: 'LEAGUE',
      maxParticipants: poolTeamCount,
      playoffTeamCount: advancingPerPool,
      playoffPlacementDivisionIds: Array.from({ length: advancingPerPool }).map(() => bracketId),
      teamIds: Array.isArray(existing?.teamIds)
        ? Array.from(new Set(existing.teamIds.map((entry) => String(entry).trim()).filter(Boolean)))
        : [],
    };
  });
};

export const assignRegisteredTeamToTournamentPool = async (params: {
  eventId: string;
  bracketDivisionId: string | null | undefined;
  eventTeamId: string;
  preferredPoolId?: string | null | undefined;
  client: PrismaLike;
}): Promise<string | null> => {
  const bracketDivisionId = normalizeTournamentPoolId(params.bracketDivisionId);
  const eventTeamId = normalizeTournamentPoolId(params.eventTeamId);
  if (!bracketDivisionId || !eventTeamId) {
    return null;
  }

  const rows = typeof params.client?.$queryRaw === 'function'
    ? await params.client.$queryRaw<Array<TournamentPoolSourceRow>>`
        SELECT
          "id",
          "key",
          "name",
          "kind",
          "maxParticipants",
          "playoffTeamCount",
          "playoffPlacementDivisionIds",
          "teamIds"
        FROM "Divisions"
        WHERE "eventId" = ${params.eventId}
          AND COALESCE("kind", 'LEAGUE') <> 'PLAYOFF'
        FOR UPDATE
      `
    : await params.client.divisions.findMany({
        where: {
          eventId: params.eventId,
          kind: 'LEAGUE',
        },
        select: {
          id: true,
          key: true,
          name: true,
          kind: true,
          maxParticipants: true,
          playoffTeamCount: true,
          playoffPlacementDivisionIds: true,
          teamIds: true,
        },
      });

  const pools = generatedPoolsForBracket(rows, bracketDivisionId);
  if (!pools.length) {
    throw new TournamentPoolValidationError('No pools are configured for the selected tournament division.');
  }

  const alreadyAssigned = pools.find((pool) => Array.isArray(pool.teamIds) && pool.teamIds.includes(eventTeamId));
  if (alreadyAssigned) {
    return alreadyAssigned.id;
  }

  const eligiblePools = pools.filter((pool) => {
    const maxParticipants = numericInput(pool.maxParticipants);
    const assignedCount = Array.isArray(pool.teamIds) ? pool.teamIds.length : 0;
    return maxParticipants == null || maxParticipants < 1 || assignedCount < maxParticipants;
  });
  if (!eligiblePools.length) {
    throw new TournamentPoolValidationError('The selected tournament division is full.');
  }

  const minAssignedCount = Math.min(...eligiblePools.map((pool) => Array.isArray(pool.teamIds) ? pool.teamIds.length : 0));
  const candidates = eligiblePools.filter((pool) => (Array.isArray(pool.teamIds) ? pool.teamIds.length : 0) === minAssignedCount);
  const preferredPoolId = normalizeTournamentPoolId(params.preferredPoolId);
  const preferred = preferredPoolId
    ? eligiblePools.find((pool) => normalizeTournamentPoolId(pool.id) === preferredPoolId)
    : null;
  const selected = preferred ?? candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
  const nextTeamIds = Array.from(new Set([...(selected.teamIds ?? []), eventTeamId]));
  const maxParticipants = numericInput(selected.maxParticipants);
  if (maxParticipants != null && maxParticipants > 0 && nextTeamIds.length > maxParticipants) {
    throw new TournamentPoolValidationError('The selected tournament pool is full.');
  }

  await params.client.divisions.update({
    where: { id: selected.id },
    data: {
      teamIds: nextTeamIds,
      updatedAt: new Date(),
    },
  });

  return selected.id;
};

export const getTournamentPoolIdsForBracket = async (params: {
  eventId: string;
  bracketDivisionId: string | null | undefined;
  client: PrismaLike;
}): Promise<string[]> => {
  const bracketDivisionId = normalizeTournamentPoolId(params.bracketDivisionId);
  if (!bracketDivisionId) {
    return [];
  }

  const rows = typeof params.client?.$queryRaw === 'function'
    ? await params.client.$queryRaw<Array<TournamentPoolSourceRow>>`
        SELECT
          "id",
          "key",
          "name",
          "kind",
          "maxParticipants",
          "playoffTeamCount",
          "playoffPlacementDivisionIds",
          "teamIds"
        FROM "Divisions"
        WHERE "eventId" = ${params.eventId}
          AND COALESCE("kind", 'LEAGUE') <> 'PLAYOFF'
        FOR UPDATE
      `
    : await params.client.divisions.findMany({
        where: {
          eventId: params.eventId,
          kind: 'LEAGUE',
        },
        select: {
          id: true,
          key: true,
          name: true,
          kind: true,
          maxParticipants: true,
          playoffTeamCount: true,
          playoffPlacementDivisionIds: true,
          teamIds: true,
        },
      });

  return generatedPoolsForBracket(rows, bracketDivisionId)
    .map((pool) => normalizeTournamentPoolId(pool.id))
    .filter((poolId): poolId is string => Boolean(poolId));
};

export const removeRegisteredTeamFromTournamentPools = async (params: {
  eventId: string;
  eventTeamId: string | null | undefined;
  client: PrismaLike;
}): Promise<string | null> => {
  const eventTeamId = normalizeTournamentPoolId(params.eventTeamId);
  if (!eventTeamId) {
    return null;
  }
  const rows = await params.client.divisions.findMany({
    where: {
      eventId: params.eventId,
      kind: 'LEAGUE',
    },
    select: {
      id: true,
      teamIds: true,
    },
  });
  const rowsContainingTeam = rows
    .filter((row: { teamIds?: string[] | null }) => Array.isArray(row.teamIds) && row.teamIds.includes(eventTeamId));
  const removedPoolId = normalizeTournamentPoolId(rowsContainingTeam[0]?.id);
  await Promise.all(
    rowsContainingTeam
      .map((row: { id: string; teamIds?: string[] | null }) => params.client.divisions.update({
        where: { id: row.id },
        data: {
          teamIds: (row.teamIds ?? []).filter((teamId) => teamId !== eventTeamId),
          updatedAt: new Date(),
        },
      })),
  );
  return removedPoolId;
};
