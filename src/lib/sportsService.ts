import { apiRequest } from '@/lib/apiClient';
import { Sport } from '@/types';

const CACHE_KEY = 'sports-cache-v1';
const CACHE_DURATION_MS = 1;

let cachedSports: Sport[] | null = null;
let cachedAt: number | null = null;
let inflightPromise: Promise<Sport[]> | null = null;

const mapRowToSport = (row: any): Sport => {
  if (!row) {
    throw new Error('Unable to map sport from empty record.');
  }

  return {
    $id: String(row.$id ?? ''),
    name: String(row.name ?? ''),
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
    $createdAt: String(row.$createdAt ?? ''),
    $updatedAt: String(row.$updatedAt ?? ''),
  };
};

const loadFromStorage = () => {
  if (typeof window === 'undefined' || cachedSports) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as { timestamp: number; items: Sport[] };
    if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.items)) {
      return;
    }

    if (Date.now() - parsed.timestamp > CACHE_DURATION_MS) {
      return;
    }

    cachedSports = parsed.items.map((item) => mapRowToSport(item));
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
  const sports = (response.sports || []).map(mapRowToSport);
  return sports;
};

export const sportsService = {
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
