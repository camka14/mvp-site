export type BracketMatchLike = {
  id?: string | null;
  $id?: string | null;
  matchId?: number | null;
  division?: unknown;
  team1?: { division?: unknown } | null;
  team2?: { division?: unknown } | null;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  previousLeftMatch?: BracketMatchLike | null;
  previousRightMatch?: BracketMatchLike | null;
  winnerNextMatch?: BracketMatchLike | null;
  loserNextMatch?: BracketMatchLike | null;
};

export type BracketDivisionOption = {
  value: string;
  label: string;
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const toBracketDivisionKey = (value: string | null | undefined): string | null => {
  const normalized = normalizeToken(value);
  return normalized ? normalized.toLowerCase() : null;
};

export const getBracketDivisionId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeToken(value);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as { id?: unknown; $id?: unknown; key?: unknown; name?: unknown };
  return (
    normalizeToken(row.id)
    ?? normalizeToken(row.$id)
    ?? normalizeToken(row.key)
    ?? normalizeToken(row.name)
  );
};

export const getBracketDivisionLabel = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeToken(value);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as { name?: unknown; id?: unknown; $id?: unknown; key?: unknown };
  return (
    normalizeToken(row.name)
    ?? normalizeToken(row.id)
    ?? normalizeToken(row.$id)
    ?? normalizeToken(row.key)
  );
};

export const getBracketMatchId = <T extends BracketMatchLike>(match: T | null | undefined): string | null => (
  normalizeToken(match?.id) ?? normalizeToken(match?.$id)
);

const resolveLinkedMatchId = (
  idValue: unknown,
  relationValue: BracketMatchLike | null | undefined,
): string | null => (
  normalizeToken(idValue) ?? getBracketMatchId(relationValue)
);

export const getBracketMatchDivisionId = <T extends BracketMatchLike>(match: T): string | null => (
  getBracketDivisionId(match.division)
  ?? getBracketDivisionId(match.team1?.division)
  ?? getBracketDivisionId(match.team2?.division)
);

export const getBracketMatchDivisionLabel = <T extends BracketMatchLike>(match: T): string | null => (
  getBracketDivisionLabel(match.division)
  ?? getBracketDivisionLabel(match.team1?.division)
  ?? getBracketDivisionLabel(match.team2?.division)
);

export const hasBracketConnections = <T extends BracketMatchLike>(match: T): boolean => (
  Boolean(
    resolveLinkedMatchId(match.previousLeftId, match.previousLeftMatch)
    || resolveLinkedMatchId(match.previousRightId, match.previousRightMatch)
    || resolveLinkedMatchId(match.winnerNextMatchId, match.winnerNextMatch)
    || resolveLinkedMatchId(match.loserNextMatchId, match.loserNextMatch)
  )
);

export const getBracketRootMatches = <T extends BracketMatchLike>(matches: Record<string, T>): T[] => (
  Object.values(matches).filter((match) => {
    const winnerNextId = resolveLinkedMatchId(match.winnerNextMatchId, match.winnerNextMatch);
    return !winnerNextId || !matches[winnerNextId];
  })
);

export const buildBracketDivisionOptions = <T extends BracketMatchLike>(
  matches: Record<string, T>,
  options: {
    labelByDivisionKey?: ReadonlyMap<string, string>;
    resolveLabel?: (match: T, divisionId: string) => string | null;
  } = {},
): BracketDivisionOption[] => {
  const labels = new Map<string, string>();
  const rootMatches = getBracketRootMatches(matches);

  rootMatches.forEach((match) => {
    const divisionId = getBracketMatchDivisionId(match);
    const divisionKey = toBracketDivisionKey(divisionId);
    if (!divisionId || !divisionKey || labels.has(divisionKey)) {
      return;
    }

    labels.set(
      divisionKey,
      options.labelByDivisionKey?.get(divisionKey)
      ?? options.resolveLabel?.(match, divisionId)
      ?? getBracketMatchDivisionLabel(match)
      ?? divisionId,
    );
  });

  return Array.from(labels.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const pickPreferredBracketRootMatch = <T extends BracketMatchLike>(matches: T[]): T | null => {
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce<T>((best, current) => {
    const bestMatchId = Number.isFinite(best.matchId) ? Number(best.matchId) : Number.NEGATIVE_INFINITY;
    const currentMatchId = Number.isFinite(current.matchId) ? Number(current.matchId) : Number.NEGATIVE_INFINITY;
    if (currentMatchId > bestMatchId) {
      return current;
    }
    if (currentMatchId < bestMatchId) {
      return best;
    }

    const bestId = getBracketMatchId(best) ?? '';
    const currentId = getBracketMatchId(current) ?? '';
    return currentId.localeCompare(bestId) < 0 ? current : best;
  }, matches[0]);
};

export const collectConnectedBracketMatchIds = <T extends BracketMatchLike>(
  matches: Record<string, T>,
  rootMatchId: string,
): Set<string> => {
  if (!matches[rootMatchId]) {
    return new Set<string>();
  }

  const adjacency = new Map<string, Set<string>>();
  const ensureNode = (id: string) => {
    if (!adjacency.has(id)) {
      adjacency.set(id, new Set<string>());
    }
  };
  const connectNodes = (firstId?: string | null, secondId?: string | null) => {
    if (!firstId || !secondId || !matches[firstId] || !matches[secondId]) {
      return;
    }
    ensureNode(firstId);
    ensureNode(secondId);
    adjacency.get(firstId)?.add(secondId);
    adjacency.get(secondId)?.add(firstId);
  };

  Object.keys(matches).forEach(ensureNode);
  Object.values(matches).forEach((match) => {
    const matchId = getBracketMatchId(match);
    connectNodes(matchId, resolveLinkedMatchId(match.previousLeftId, match.previousLeftMatch));
    connectNodes(matchId, resolveLinkedMatchId(match.previousRightId, match.previousRightMatch));
    connectNodes(matchId, resolveLinkedMatchId(match.winnerNextMatchId, match.winnerNextMatch));
    connectNodes(matchId, resolveLinkedMatchId(match.loserNextMatchId, match.loserNextMatch));
  });

  const visited = new Set<string>();
  const stack = [rootMatchId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId) || !matches[currentId]) {
      continue;
    }

    visited.add(currentId);
    const neighbors = adjacency.get(currentId);
    if (!neighbors) {
      continue;
    }

    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        stack.push(neighborId);
      }
    });
  }

  return visited;
};
