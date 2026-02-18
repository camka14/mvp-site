import { prisma } from '@/lib/prisma';

export type AdminConstantKind = 'sports' | 'divisions' | 'league-scoring-configs';
export type AdminConstantResponseKey = 'sports' | 'divisions' | 'leagueScoringConfigs';

type PrismaClientLike = {
  sports: {
    findMany: (args?: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
  divisions: {
    findMany: (args?: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
  leagueScoringConfigs: {
    findMany: (args?: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
};

const SPORT_BOOLEAN_FIELDS = [
  'usePointsForWin',
  'usePointsForDraw',
  'usePointsForLoss',
  'usePointsForForfeitWin',
  'usePointsForForfeitLoss',
  'usePointsPerSetWin',
  'usePointsPerSetLoss',
  'usePointsPerGameWin',
  'usePointsPerGameLoss',
  'usePointsPerGoalScored',
  'usePointsPerGoalConceded',
  'useMaxGoalBonusPoints',
  'useMinGoalBonusThreshold',
  'usePointsForShutout',
  'usePointsForCleanSheet',
  'useApplyShutoutOnlyIfWin',
  'usePointsPerGoalDifference',
  'useMaxGoalDifferencePoints',
  'usePointsPenaltyPerGoalDifference',
  'usePointsForParticipation',
  'usePointsForNoShow',
  'usePointsForWinStreakBonus',
  'useWinStreakThreshold',
  'usePointsForOvertimeWin',
  'usePointsForOvertimeLoss',
  'useOvertimeEnabled',
  'usePointsPerRedCard',
  'usePointsPerYellowCard',
  'usePointsPerPenalty',
  'useMaxPenaltyDeductions',
  'useMaxPointsPerMatch',
  'useMinPointsPerMatch',
  'useGoalDifferenceTiebreaker',
  'useHeadToHeadTiebreaker',
  'useTotalGoalsTiebreaker',
  'useEnableBonusForComebackWin',
  'useBonusPointsForComebackWin',
  'useEnableBonusForHighScoringMatch',
  'useHighScoringThreshold',
  'useBonusPointsForHighScoringMatch',
  'useEnablePenaltyUnsporting',
  'usePenaltyPointsUnsporting',
  'usePointPrecision',
] as const;

const DIVISION_STRING_FIELDS = [
  'name',
  'key',
  'sportId',
  'divisionTypeId',
  'divisionTypeName',
  'ageCutoffLabel',
  'ageCutoffSource',
] as const;

const DIVISION_NUMBER_FIELDS = ['minRating', 'maxRating'] as const;
const DIVISION_ARRAY_FIELDS = ['fieldIds'] as const;
const DIVISION_ENUM_FIELDS = ['ratingType', 'gender'] as const;
const DIVISION_DATE_FIELDS = ['ageCutoffDate'] as const;

const LEAGUE_BOOLEAN_FIELDS = [
  'applyShutoutOnlyIfWin',
  'overtimeEnabled',
  'goalDifferenceTiebreaker',
  'headToHeadTiebreaker',
  'totalGoalsTiebreaker',
  'enableBonusForComebackWin',
  'enableBonusForHighScoringMatch',
  'enablePenaltyForUnsportingBehavior',
] as const;

const LEAGUE_NUMBER_FIELDS = [
  'pointsForWin',
  'pointsForDraw',
  'pointsForLoss',
  'pointsForForfeitWin',
  'pointsForForfeitLoss',
  'pointsPerSetWin',
  'pointsPerSetLoss',
  'pointsPerGameWin',
  'pointsPerGameLoss',
  'pointsPerGoalScored',
  'pointsPerGoalConceded',
  'maxGoalBonusPoints',
  'minGoalBonusThreshold',
  'pointsForShutout',
  'pointsForCleanSheet',
  'pointsPerGoalDifference',
  'maxGoalDifferencePoints',
  'pointsPenaltyPerGoalDifference',
  'pointsForParticipation',
  'pointsForNoShow',
  'pointsForWinStreakBonus',
  'winStreakThreshold',
  'pointsForOvertimeWin',
  'pointsForOvertimeLoss',
  'pointsPerRedCard',
  'pointsPerYellowCard',
  'pointsPerPenalty',
  'maxPenaltyDeductions',
  'maxPointsPerMatch',
  'minPointsPerMatch',
  'bonusPointsForComebackWin',
  'highScoringThreshold',
  'bonusPointsForHighScoringMatch',
  'penaltyPointsForUnsportingBehavior',
  'pointPrecision',
] as const;

export const editableFieldsByKind: Record<AdminConstantResponseKey, string[]> = {
  sports: ['name', ...SPORT_BOOLEAN_FIELDS],
  divisions: [
    ...DIVISION_STRING_FIELDS,
    ...DIVISION_ENUM_FIELDS,
    ...DIVISION_NUMBER_FIELDS,
    ...DIVISION_DATE_FIELDS,
    ...DIVISION_ARRAY_FIELDS,
  ],
  leagueScoringConfigs: [...LEAGUE_NUMBER_FIELDS, ...LEAGUE_BOOLEAN_FIELDS],
};

export class AdminConstantsInputError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'AdminConstantsInputError';
  }
}

const toNullableBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (normalized === 'null' || normalized === '') return null;
  }
  throw new AdminConstantsInputError('Expected boolean or null.');
};

const toNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null') return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new AdminConstantsInputError('Expected number or null.');
};

const toNullableString = (
  value: unknown,
  { allowEmpty = false, required = false }: { allowEmpty?: boolean; required?: boolean } = {},
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) {
    if (required) {
      throw new AdminConstantsInputError('Value is required.');
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new AdminConstantsInputError('Expected string value.');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new AdminConstantsInputError('Value is required.');
    }
    return allowEmpty ? '' : null;
  }
  return trimmed;
};

const toStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AdminConstantsInputError('Expected an array of strings.');
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry)))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const toNullableDate = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AdminConstantsInputError('Invalid date value.');
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new AdminConstantsInputError('Expected date string or null.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AdminConstantsInputError('Invalid date value.');
  }
  return parsed;
};

const toDivisionRatingType = (value: unknown): 'AGE' | 'SKILL' | null | undefined => {
  const parsed = toNullableString(value);
  if (parsed === undefined || parsed === null) return parsed;
  const normalized = parsed.toUpperCase();
  if (normalized === 'AGE' || normalized === 'SKILL') return normalized;
  throw new AdminConstantsInputError('ratingType must be AGE or SKILL.');
};

const toDivisionGender = (value: unknown): 'M' | 'F' | 'C' | null | undefined => {
  const parsed = toNullableString(value);
  if (parsed === undefined || parsed === null) return parsed;
  const normalized = parsed.toUpperCase();
  if (normalized === 'M' || normalized === 'F' || normalized === 'C') return normalized;
  throw new AdminConstantsInputError('gender must be M, F, or C.');
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeRawPatch = (input: unknown): Record<string, unknown> => {
  const candidate = isRecord(input) && isRecord(input.patch) ? input.patch : input;
  if (!isRecord(candidate)) {
    throw new AdminConstantsInputError('Patch payload must be an object.');
  }
  return candidate;
};

export const parseAdminConstantKind = (value: string): AdminConstantKind => {
  if (value === 'sports' || value === 'divisions' || value === 'league-scoring-configs') {
    return value;
  }
  throw new AdminConstantsInputError(`Unsupported constant kind: ${value}`, 404);
};

export const normalizePatchForKind = (
  kind: AdminConstantKind,
  payload: unknown,
): Record<string, unknown> => {
  const rawPatch = normalizeRawPatch(payload);
  const normalized: Record<string, unknown> = {};

  if (kind === 'sports') {
    const allowed = new Set(editableFieldsByKind.sports);
    Object.entries(rawPatch).forEach(([key, value]) => {
      if (!allowed.has(key)) {
        throw new AdminConstantsInputError(`Unsupported sports field: ${key}`);
      }
      if (key === 'name') {
        const parsed = toNullableString(value, { required: true });
        if (parsed !== undefined) normalized[key] = parsed;
        return;
      }
      normalized[key] = toNullableBoolean(value);
    });
  } else if (kind === 'divisions') {
    const allowed = new Set(editableFieldsByKind.divisions);
    Object.entries(rawPatch).forEach(([key, value]) => {
      if (!allowed.has(key)) {
        throw new AdminConstantsInputError(`Unsupported divisions field: ${key}`);
      }
      if ((DIVISION_STRING_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toNullableString(value, { required: key === 'name' });
        return;
      }
      if ((DIVISION_NUMBER_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toNullableNumber(value);
        return;
      }
      if ((DIVISION_ARRAY_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toStringArray(value);
        return;
      }
      if ((DIVISION_DATE_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toNullableDate(value);
        return;
      }
      if (key === 'ratingType') {
        normalized[key] = toDivisionRatingType(value);
        return;
      }
      if (key === 'gender') {
        normalized[key] = toDivisionGender(value);
      }
    });
  } else if (kind === 'league-scoring-configs') {
    const allowed = new Set(editableFieldsByKind.leagueScoringConfigs);
    Object.entries(rawPatch).forEach(([key, value]) => {
      if (!allowed.has(key)) {
        throw new AdminConstantsInputError(`Unsupported league scoring field: ${key}`);
      }
      if ((LEAGUE_BOOLEAN_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toNullableBoolean(value);
        return;
      }
      if ((LEAGUE_NUMBER_FIELDS as readonly string[]).includes(key)) {
        normalized[key] = toNullableNumber(value);
      }
    });
  }

  const compacted = Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(compacted).length === 0) {
    throw new AdminConstantsInputError('Patch payload contains no editable fields.');
  }
  return compacted;
};

export const loadAdminConstants = async (client: PrismaClientLike = prisma): Promise<{
  sports: any[];
  divisions: any[];
  leagueScoringConfigs: any[];
  editableFields: Record<AdminConstantResponseKey, string[]>;
}> => {
  const [sports, divisions, leagueScoringConfigs] = await Promise.all([
    client.sports.findMany({ orderBy: { name: 'asc' } }),
    client.divisions.findMany({
      where: { eventId: null, organizationId: null },
      orderBy: [{ sportId: 'asc' }, { name: 'asc' }],
    }),
    client.leagueScoringConfigs.findMany({ orderBy: { updatedAt: 'desc' } }),
  ]);

  return {
    sports,
    divisions,
    leagueScoringConfigs,
    editableFields: editableFieldsByKind,
  };
};

export const updateAdminConstantByKind = async (
  kind: AdminConstantKind,
  id: string,
  patch: Record<string, unknown>,
  client: PrismaClientLike = prisma,
): Promise<any> => {
  const data = { ...patch, updatedAt: new Date() };
  try {
    if (kind === 'sports') {
      return await client.sports.update({ where: { id }, data });
    }
    if (kind === 'divisions') {
      return await client.divisions.update({ where: { id }, data });
    }
    return await client.leagueScoringConfigs.update({ where: { id }, data });
  } catch (error: any) {
    if (error && typeof error === 'object' && error.code === 'P2025') {
      throw new AdminConstantsInputError('Record not found.', 404);
    }
    throw error;
  }
};
