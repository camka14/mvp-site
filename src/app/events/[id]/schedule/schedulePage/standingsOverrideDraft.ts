export const STANDINGS_OVERRIDE_MIN = -9999;
export const STANDINGS_OVERRIDE_MAX = 9999;

export type StandingsDraftValue = number | string;
export type StandingsDraftOverrides = Record<string, StandingsDraftValue>;

type StandingsOverrideRow = {
  teamId: string;
  teamName?: string;
  points?: number;
  basePoints?: number;
  finalPoints?: number;
};

type StandingsOverrideUpdate = {
  teamId: string;
  points: number | null;
};

type StandingsOverrideSave = {
  updates: StandingsOverrideUpdate[];
  expectedOverrides: Record<string, number>;
  invalidTeamIds: string[];
};

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const toFiniteOverride = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      && Number.isInteger(value)
      && value >= STANDINGS_OVERRIDE_MIN
      && value <= STANDINGS_OVERRIDE_MAX
      ? value
      : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric)
    && Number.isInteger(numeric)
    && numeric >= STANDINGS_OVERRIDE_MIN
    && numeric <= STANDINGS_OVERRIDE_MAX
    ? numeric
    : null;
};

const normalizeStoredOverrides = (
  value: Record<string, number> | null | undefined,
): Record<string, number> => Object.fromEntries(
  Object.entries(value ?? {})
    .filter(([teamId, points]) => teamId.trim().length > 0 && Number.isFinite(points))
    .map(([teamId, points]) => [teamId, Number(points)]),
);

export const normalizeStandingsDraftInput = (value: string | number): StandingsDraftValue => {
  if (typeof value === 'number') {
    return value;
  }
  return value.trim().length > 0 ? value : '';
};

export const updateStandingsDraftInput = (
  draftOverrides: StandingsDraftOverrides,
  teamId: string,
  value: string | number,
): StandingsDraftOverrides => ({
  ...draftOverrides,
  [teamId]: normalizeStandingsDraftInput(value),
});

export const getStandingsDraftInputValue = (
  row: Pick<StandingsOverrideRow, 'teamId' | 'finalPoints'>,
  draftOverrides: StandingsDraftOverrides,
): StandingsDraftValue => (
  hasOwn(draftOverrides, row.teamId) ? draftOverrides[row.teamId] : (row.finalPoints ?? 0)
);

export const resolveStandingsDraftPoints = (
  row: StandingsOverrideRow,
  draftOverrides: StandingsDraftOverrides,
): { basePoints: number; finalPoints: number; pointsDelta: number } => {
  const basePoints = typeof row.basePoints === 'number'
    ? row.basePoints
    : (typeof row.points === 'number' ? row.points : 0);
  const persistedFinalPoints = typeof row.finalPoints === 'number'
    ? row.finalPoints
    : (typeof row.points === 'number' ? row.points : basePoints);
  const draftValue = hasOwn(draftOverrides, row.teamId)
    ? toFiniteOverride(draftOverrides[row.teamId])
    : null;
  const finalPoints = draftValue ?? persistedFinalPoints;
  return {
    basePoints,
    finalPoints,
    pointsDelta: finalPoints - basePoints,
  };
};

export const applyStandingsDraftPointsInOrder = <Row extends StandingsOverrideRow>(
  rows: Row[],
  draftOverrides: StandingsDraftOverrides,
): Array<Row & { points: number; basePoints: number; finalPoints: number; pointsDelta: number }> => rows.map((row) => {
  const points = resolveStandingsDraftPoints(row, draftOverrides);
  return {
    ...row,
    points: points.finalPoints,
    basePoints: points.basePoints,
    finalPoints: points.finalPoints,
    pointsDelta: points.pointsDelta,
  };
});

export const buildStandingsOverrideSave = (params: {
  rows: StandingsOverrideRow[];
  existingOverrides: Record<string, number> | null | undefined;
  draftOverrides: StandingsDraftOverrides;
}): StandingsOverrideSave => {
  const expectedOverrides = normalizeStoredOverrides(params.existingOverrides);
  const updates: StandingsOverrideUpdate[] = [];
  const invalidTeamIds: string[] = [];

  for (const row of params.rows) {
    if (!hasOwn(params.draftOverrides, row.teamId)) {
      continue;
    }
    const desired = toFiniteOverride(params.draftOverrides[row.teamId]);
    if (desired === null) {
      invalidTeamIds.push(row.teamId);
      continue;
    }

    const hasExisting = hasOwn(expectedOverrides, row.teamId);
    const existing = expectedOverrides[row.teamId];
    const basePoints = typeof row.basePoints === 'number'
      ? row.basePoints
      : (typeof row.points === 'number' ? row.points : 0);
    if (desired === basePoints) {
      if (hasExisting) {
        updates.push({ teamId: row.teamId, points: null });
        delete expectedOverrides[row.teamId];
      }
      continue;
    }

    if (!hasExisting || existing !== desired) {
      updates.push({ teamId: row.teamId, points: desired });
      expectedOverrides[row.teamId] = desired;
    }
  }

  return { updates, expectedOverrides, invalidTeamIds };
};

export const standingsOverrideReadbackMatches = (
  expected: Record<string, number> | null | undefined,
  actual: Record<string, number> | null | undefined,
): boolean => {
  const normalizedExpected = normalizeStoredOverrides(expected);
  const normalizedActual = normalizeStoredOverrides(actual);
  const expectedEntries = Object.entries(normalizedExpected).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = Object.entries(normalizedActual).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(expectedEntries) === JSON.stringify(actualEntries);
};
