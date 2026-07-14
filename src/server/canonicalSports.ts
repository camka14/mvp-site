export type CanonicalSportRow = {
  id: string;
  name?: unknown;
  createdAt?: unknown;
  [key: string]: unknown;
};

const NON_CONFIGURATION_KEYS = new Set([
  'id',
  'name',
  'createdAt',
  'updatedAt',
  '$id',
  '$createdAt',
  '$updatedAt',
]);

export const normalizeCanonicalSportName = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const populatedConfigurationCount = (sport: CanonicalSportRow): number =>
  Object.entries(sport).reduce((count, [key, value]) => (
    NON_CONFIGURATION_KEYS.has(key) || value == null ? count : count + 1
  ), 0);

const createdAtTimestamp = (sport: CanonicalSportRow): number => {
  const value = sport.createdAt;
  if (value == null) return Number.POSITIVE_INFINITY;
  const timestamp = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const hasCanonicalId = (sport: CanonicalSportRow, canonicalName: string): boolean =>
  normalizeCanonicalSportName(sport.id) === canonicalName;

const isPreferredCanonicalSport = (
  candidate: CanonicalSportRow,
  current: CanonicalSportRow,
  canonicalName: string,
): boolean => {
  const candidateHasCanonicalId = hasCanonicalId(candidate, canonicalName);
  const currentHasCanonicalId = hasCanonicalId(current, canonicalName);
  if (candidateHasCanonicalId !== currentHasCanonicalId) {
    return candidateHasCanonicalId;
  }

  const candidateConfigurationCount = populatedConfigurationCount(candidate);
  const currentConfigurationCount = populatedConfigurationCount(current);
  if (candidateConfigurationCount !== currentConfigurationCount) {
    return candidateConfigurationCount > currentConfigurationCount;
  }

  const candidateCreatedAt = createdAtTimestamp(candidate);
  const currentCreatedAt = createdAtTimestamp(current);
  if (candidateCreatedAt !== currentCreatedAt) {
    return candidateCreatedAt < currentCreatedAt;
  }

  return String(candidate.id) < String(current.id);
};

export const dedupeCanonicalSports = <T extends CanonicalSportRow>(sports: readonly T[]): T[] => {
  const groups = new Map<string, { index: number; sport: T }>();

  sports.forEach((sport) => {
    const canonicalName = normalizeCanonicalSportName(sport.name);
    if (!canonicalName) {
      throw new Error(`Sport ${String(sport.id)} has a blank canonical name.`);
    }

    const current = groups.get(canonicalName);
    if (!current) {
      groups.set(canonicalName, { index: groups.size, sport });
      return;
    }
    if (isPreferredCanonicalSport(sport, current.sport, canonicalName)) {
      current.sport = sport;
    }
  });

  return Array.from(groups.values())
    .sort((left, right) => left.index - right.index)
    .map(({ sport }) => sport);
};
