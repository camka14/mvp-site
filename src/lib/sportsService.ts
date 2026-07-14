import { apiRequest } from '@/lib/apiClient';
import type { MatchRulesConfig, Sport, SportOfficialPositionTemplate } from '@/types';

const CACHE_KEY = 'sports-cache-v4';
// Sports rarely change; keep cache long-lived and refresh opportunistically.
const CACHE_DURATION_MS = 1000 * 60 * 60 * 24; // 24h

let cachedSports: Sport[] | null = null;
let cachedAt: number | null = null;
let inflightPromise: Promise<Sport[]> | null = null;

const normalizeClientSportName = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const clientSportId = (row: any): string => String(row?.id ?? row?.$id ?? '');

const clientSportCreatedAt = (row: any): number => {
  const value = row?.createdAt ?? row?.$createdAt;
  if (value == null) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const clientSportConfigurationCount = (row: any): number => (
  row && typeof row === 'object'
    ? Object.entries(row).reduce((count, [key, value]) => (
      ['$id', 'id', 'name', '$createdAt', 'createdAt', '$updatedAt', 'updatedAt'].includes(key) || value == null
        ? count
        : count + 1
    ), 0)
    : 0
);

const dedupeClientSportRows = <T extends { name?: unknown }>(rows: readonly T[]): T[] => {
  const groups = new Map<string, { index: number; row: T }>();
  rows.forEach((row) => {
    const canonicalName = normalizeClientSportName(row.name);
    if (!canonicalName) {
      throw new Error(`Sport ${clientSportId(row)} has a blank canonical name.`);
    }

    const current = groups.get(canonicalName);
    if (!current) {
      groups.set(canonicalName, { index: groups.size, row });
      return;
    }

    const rowId = clientSportId(row);
    const currentId = clientSportId(current.row);
    const rowHasCanonicalId = normalizeClientSportName(rowId) === canonicalName;
    const currentHasCanonicalId = normalizeClientSportName(currentId) === canonicalName;
    const rowConfigurationCount = clientSportConfigurationCount(row);
    const currentConfigurationCount = clientSportConfigurationCount(current.row);
    const rowCreatedAt = clientSportCreatedAt(row);
    const currentCreatedAt = clientSportCreatedAt(current.row);
    const isPreferred = rowHasCanonicalId !== currentHasCanonicalId
      ? rowHasCanonicalId
      : rowConfigurationCount !== currentConfigurationCount
        ? rowConfigurationCount > currentConfigurationCount
        : rowCreatedAt !== currentCreatedAt
          ? rowCreatedAt < currentCreatedAt
          : rowId < currentId;
    if (isPreferred) current.row = row;
  });

  return Array.from(groups.values())
    .sort((left, right) => left.index - right.index)
    .map(({ row }) => row);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeOfficialPositionTemplates = (value: unknown): SportOfficialPositionTemplate[] => (
  Array.isArray(value)
    ? value.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const name = String(entry.name ?? '').trim();
      const numericCount = typeof entry.count === 'number' ? entry.count : Number(entry.count);
      const count = Number.isFinite(numericCount) ? Math.max(1, Math.trunc(numericCount)) : 1;

      return name ? [{ name, count }] : [];
    })
    : []
);

const normalizeMatchRulesTemplate = (value: unknown): MatchRulesConfig | null => (
  isRecord(value) ? { ...(value as MatchRulesConfig) } : null
);

const mapRowToSport = (row: any): Sport => {
  if (!row) {
    throw new Error('Unable to map sport from empty record.');
  }

  return {
    $id: String(row.id ?? row.$id ?? ''),
    name: String(row.name ?? ''),
    officialPositionTemplates: normalizeOfficialPositionTemplates(row.officialPositionTemplates),
    matchRulesTemplate: normalizeMatchRulesTemplate(row.matchRulesTemplate),
    usePointsForWin: Boolean(row.usePointsForWin),
    usePointsForDraw: Boolean(row.usePointsForDraw),
    usePointsForLoss: Boolean(row.usePointsForLoss),
    usePointsForForfeitWin: Boolean(row.usePointsForForfeitWin),
    usePointsForForfeitLoss: Boolean(row.usePointsForForfeitLoss),
    usePointsPerSetWin: Boolean(row.usePointsPerSetWin),
    usePointsPerSetLoss: Boolean(row.usePointsPerSetLoss),
    usePointsPerGameWin: Boolean(row.usePointsPerGameWin),
    usePointsPerGameLoss: Boolean(row.usePointsPerGameLoss),
    usePointsPerGoalScored: Boolean(row.usePointsPerGoalScored),
    usePointsPerGoalConceded: Boolean(row.usePointsPerGoalConceded),
    useMaxGoalBonusPoints: Boolean(row.useMaxGoalBonusPoints),
    useMinGoalBonusThreshold: Boolean(row.useMinGoalBonusThreshold),
    usePointsForShutout: Boolean(row.usePointsForShutout),
    usePointsForCleanSheet: Boolean(row.usePointsForCleanSheet),
    useApplyShutoutOnlyIfWin: Boolean(row.useApplyShutoutOnlyIfWin),
    usePointsPerGoalDifference: Boolean(row.usePointsPerGoalDifference),
    useMaxGoalDifferencePoints: Boolean(row.useMaxGoalDifferencePoints),
    usePointsPenaltyPerGoalDifference: Boolean(row.usePointsPenaltyPerGoalDifference),
    usePointsForParticipation: Boolean(row.usePointsForParticipation),
    usePointsForNoShow: Boolean(row.usePointsForNoShow),
    usePointsForWinStreakBonus: Boolean(row.usePointsForWinStreakBonus),
    useWinStreakThreshold: Boolean(row.useWinStreakThreshold),
    usePointsForOvertimeWin: Boolean(row.usePointsForOvertimeWin),
    usePointsForOvertimeLoss: Boolean(row.usePointsForOvertimeLoss),
    useOvertimeEnabled: Boolean(row.useOvertimeEnabled),
    usePointsPerRedCard: Boolean(row.usePointsPerRedCard),
    usePointsPerYellowCard: Boolean(row.usePointsPerYellowCard),
    usePointsPerPenalty: Boolean(row.usePointsPerPenalty),
    useMaxPenaltyDeductions: Boolean(row.useMaxPenaltyDeductions),
    useMaxPointsPerMatch: Boolean(row.useMaxPointsPerMatch),
    useMinPointsPerMatch: Boolean(row.useMinPointsPerMatch),
    useGoalDifferenceTiebreaker: Boolean(row.useGoalDifferenceTiebreaker),
    useHeadToHeadTiebreaker: Boolean(row.useHeadToHeadTiebreaker),
    useTotalGoalsTiebreaker: Boolean(row.useTotalGoalsTiebreaker),
    useEnableBonusForComebackWin: Boolean(row.useEnableBonusForComebackWin),
    useBonusPointsForComebackWin: Boolean(row.useBonusPointsForComebackWin),
    useEnableBonusForHighScoringMatch: Boolean(row.useEnableBonusForHighScoringMatch),
    useHighScoringThreshold: Boolean(row.useHighScoringThreshold),
    useBonusPointsForHighScoringMatch: Boolean(row.useBonusPointsForHighScoringMatch),
    useEnablePenaltyUnsporting: Boolean(row.useEnablePenaltyUnsporting),
    usePenaltyPointsUnsporting: Boolean(row.usePenaltyPointsUnsporting),
    usePointPrecision: Boolean(row.usePointPrecision),
    $createdAt: String(row.createdAt ?? row.$createdAt ?? ''),
    $updatedAt: String(row.updatedAt ?? row.$updatedAt ?? ''),
  };
};

const loadFromStorage = (options?: { allowStale?: boolean }) => {
  if (typeof window === 'undefined' || cachedSports) {
    return;
  }

  const allowStale = Boolean(options?.allowStale);

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as { timestamp: number; items: Sport[] };
    if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.items)) {
      return;
    }

    const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION_MS;
    if (isExpired && !allowStale) return;

    cachedSports = dedupeClientSportRows(parsed.items).map((item) => mapRowToSport(item));
    cachedAt = parsed.timestamp;
  } catch {
    // Ignore storage parsing errors
  }
};

const saveToStorage = (sports: Sport[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), items: sports })
    );
  } catch {
    // Ignore quota/storage errors
  }
};

const shouldUseCache = () => {
  if (!cachedSports || cachedAt === null) {
    return false;
  }
  return Date.now() - cachedAt < CACHE_DURATION_MS;
};

const fetchSportsFromApi = async (): Promise<Sport[]> => {
  const response = await apiRequest<{ sports?: any[] }>('/api/sports');
  const sports = dedupeClientSportRows(response.sports || []).map(mapRowToSport);
  return sports;
};

export const sportsService = {
  getCached(options?: { allowStale?: boolean }): Sport[] | null {
    loadFromStorage({ allowStale: options?.allowStale });
    return cachedSports;
  },
  async getAll(forceRefresh: boolean = false): Promise<Sport[]> {
    if (!forceRefresh) {
      if (shouldUseCache()) {
        return cachedSports as Sport[];
      }
      loadFromStorage();
      if (shouldUseCache()) {
        return cachedSports as Sport[];
      }
    }

    if (inflightPromise) {
      return inflightPromise;
    }

    inflightPromise = fetchSportsFromApi()
      .then((sports) => {
        cachedSports = sports;
        cachedAt = Date.now();
        saveToStorage(sports);
        return sports;
      })
      .finally(() => {
        inflightPromise = null;
      });

    return inflightPromise;
  },
};
