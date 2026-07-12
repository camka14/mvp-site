import type { Event, Match, MatchScoringModel, ResolvedMatchRules, ResolvedMatchTimekeepingConfig } from '@/types';

export type MatchPolicyOverrideInput = {
  scoringModel?: MatchScoringModel | string | null;
  segmentCount?: number | null;
  setPointTargets?: number[] | null;
  matchDurationMinutes?: number | null;
  setDurationMinutes?: number | null;
  timekeeping?: Partial<ResolvedMatchTimekeepingConfig> | null;
};

const SCORING_MODELS = new Set(['SETS', 'PERIODS', 'INNINGS', 'POINTS_ONLY']);

const normalizeScoringModel = (value: unknown): MatchScoringModel | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return SCORING_MODELS.has(normalized) ? normalized as MatchScoringModel : null;
};

const positiveIntOrNull = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
};

const positiveIntArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry) => positiveIntOrNull(entry))
    .filter((entry): entry is number => entry !== null);
  return normalized.length ? normalized : null;
};

const resizePointTargets = (
  value: unknown,
  segmentCount: number,
  fallback: unknown,
): number[] => {
  const normalized = positiveIntArray(value) ?? positiveIntArray(fallback) ?? [];
  if (!segmentCount) return [];
  const next = normalized.slice(0, segmentCount);
  const fill = next[next.length - 1] ?? 21;
  while (next.length < segmentCount) {
    next.push(fill);
  }
  return next;
};

const normalizeTimekeeping = (
  source: unknown,
  policy: MatchPolicyOverrideInput,
  scoringModel: MatchScoringModel,
  segmentCount: number,
): ResolvedMatchTimekeepingConfig => {
  const row = source && typeof source === 'object'
    ? source as Partial<ResolvedMatchTimekeepingConfig>
    : {};
  const timerMode = row.timerMode === 'COUNT_UP' ? 'COUNT_UP' : 'NONE';
  const explicitSegmentDuration = positiveIntOrNull(policy.setDurationMinutes)
    ?? positiveIntOrNull(policy.timekeeping?.segmentDurationMinutes)
    ?? positiveIntOrNull(row.segmentDurationMinutes);
  const matchDurationMinutes = positiveIntOrNull(policy.matchDurationMinutes);
  const derivedSegmentDuration = matchDurationMinutes && segmentCount > 0
    ? Math.max(1, Math.round(matchDurationMinutes / segmentCount))
    : null;
  const segmentDurationMinutes = explicitSegmentDuration ?? derivedSegmentDuration ?? null;
  const sequenceDurations = positiveIntArray(policy.timekeeping?.segmentDurationMinutesBySequence)
    ?? positiveIntArray(row.segmentDurationMinutesBySequence)
    ?? [];

  return {
    timerMode: scoringModel === 'POINTS_ONLY' && !segmentDurationMinutes ? 'NONE' : timerMode,
    segmentDurationMinutes,
    segmentDurationMinutesBySequence: sequenceDurations,
    canUseAddedTime: row.canUseAddedTime === true || policy.timekeeping?.canUseAddedTime === true,
    addedTimeEnabled: row.addedTimeEnabled === true || policy.timekeeping?.addedTimeEnabled === true,
    stopAtRegulationEnd: policy.timekeeping?.stopAtRegulationEnd ?? row.stopAtRegulationEnd ?? true,
  };
};

const normalizeIdToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const objectId = (value: unknown): string | null => {
  if (typeof value === 'string') return normalizeIdToken(value);
  if (!value || typeof value !== 'object') return null;
  const row = value as { id?: unknown; $id?: unknown; key?: unknown };
  return normalizeIdToken(row.id) ?? normalizeIdToken(row.$id) ?? normalizeIdToken(row.key);
};

const divisionKey = (value: unknown): string | null => {
  const id = objectId(value);
  return id ? id.toLowerCase() : null;
};

const isBracketMatch = (match: any): boolean => (
  Boolean(match?.losersBracket)
  || Boolean(match?.previousLeftId)
  || Boolean(match?.previousRightId)
  || Boolean(match?.winnerNextMatchId)
  || Boolean(match?.loserNextMatchId)
  || Boolean(match?.previousLeftMatch)
  || Boolean(match?.previousRightMatch)
  || Boolean(match?.winnerNextMatch)
  || Boolean(match?.loserNextMatch)
);

const resolveMatchDivision = (event: any, match: any, playoff: boolean): any | null => {
  const matchDivisionKey = divisionKey(match?.division)
    ?? divisionKey(match?.team1?.division)
    ?? divisionKey(match?.team2?.division);
  if (!matchDivisionKey) {
    return match?.division && typeof match.division === 'object' ? match.division : null;
  }

  const preferredSources = playoff
    ? [event?.playoffDivisionDetails, event?.playoffDivisions, event?.divisionDetails, event?.divisions]
    : [event?.divisionDetails, event?.divisions, event?.playoffDivisionDetails, event?.playoffDivisions];
  for (const source of preferredSources) {
    if (!Array.isArray(source)) continue;
    const division = source.find((entry) => divisionKey(entry) === matchDivisionKey);
    if (division) return division;
  }

  return match?.division && typeof match.division === 'object' ? match.division : null;
};

export const resolveMatchSetPointTargets = (
  event: Pick<Event, 'eventType' | 'pointsToVictory' | 'winnerBracketPointsToVictory' | 'loserBracketPointsToVictory' | 'leagueConfig'> | any,
  match: Pick<Match, 'matchRulesSnapshot' | 'resolvedMatchRules' | 'losersBracket'> | any,
): number[] | null => {
  const matchTargets = positiveIntArray((match?.matchRulesSnapshot as any)?.setPointTargets)
    ?? positiveIntArray((match?.resolvedMatchRules as any)?.setPointTargets);
  if (matchTargets) return matchTargets;

  const playoff = event?.eventType === 'TOURNAMENT' || isBracketMatch(match);
  const division = resolveMatchDivision(event, match, playoff);
  if (playoff) {
    const config = division?.playoffConfig;
    return match?.losersBracket
      ? positiveIntArray(config?.loserBracketPointsToVictory) ?? positiveIntArray(event?.loserBracketPointsToVictory)
      : positiveIntArray(config?.winnerBracketPointsToVictory) ?? positiveIntArray(event?.winnerBracketPointsToVictory);
  }

  return positiveIntArray(division?.pointsToVictory)
    ?? positiveIntArray(division?.leagueConfig?.pointsToVictory)
    ?? positiveIntArray(event?.pointsToVictory)
    ?? positiveIntArray(event?.leagueConfig?.pointsToVictory);
};

export const buildMatchRulesSnapshot = (params: {
  baseRules?: Partial<ResolvedMatchRules> | null;
  existingSnapshot?: Partial<ResolvedMatchRules> | Record<string, unknown> | null;
  incomingSnapshot?: Partial<ResolvedMatchRules> | Record<string, unknown> | null;
  policy?: MatchPolicyOverrideInput | null;
  fallbackSetPointTargets?: number[] | null;
  existingSegmentCount?: number | null;
}): ResolvedMatchRules => {
  const source = {
    ...(params.baseRules ?? {}),
    ...(params.existingSnapshot ?? {}),
    ...(params.incomingSnapshot ?? {}),
  } as Partial<ResolvedMatchRules> & Record<string, unknown>;
  const policy = params.policy ?? {};
  const scoringModel = normalizeScoringModel(policy.scoringModel)
    ?? normalizeScoringModel(source.scoringModel)
    ?? 'POINTS_ONLY';
  const explicitPolicySegmentCount = positiveIntOrNull(policy.segmentCount);
  const explicitIncomingSnapshotSegmentCount = positiveIntOrNull(
    (params.incomingSnapshot as Partial<ResolvedMatchRules> | null | undefined)?.segmentCount,
  );
  const requestedSegmentCount = explicitPolicySegmentCount
    ?? explicitIncomingSnapshotSegmentCount
    ?? positiveIntOrNull(source.segmentCount);
  const targetFallbackCount = positiveIntArray(policy.setPointTargets)?.length
    ?? positiveIntArray(source.setPointTargets)?.length
    ?? positiveIntArray(params.fallbackSetPointTargets)?.length
    ?? 0;
  const fallbackSegmentCount = Math.max(
    positiveIntOrNull(params.existingSegmentCount) ?? 0,
    targetFallbackCount,
    1,
  );
  const segmentCount = scoringModel === 'POINTS_ONLY'
    ? 1
    : explicitPolicySegmentCount
      ?? explicitIncomingSnapshotSegmentCount
      ?? Math.max(requestedSegmentCount ?? 0, fallbackSegmentCount);
  const setPointTargets = scoringModel === 'SETS'
    ? resizePointTargets(policy.setPointTargets ?? source.setPointTargets, segmentCount, params.fallbackSetPointTargets)
    : [];
  const supportsShootout = source.supportsShootout === true;

  return {
    scoringModel,
    segmentCount,
    segmentLabel: typeof source.segmentLabel === 'string' && source.segmentLabel.trim()
      ? source.segmentLabel.trim()
      : scoringModel === 'SETS'
        ? 'Set'
        : scoringModel === 'INNINGS'
          ? 'Inning'
          : scoringModel === 'POINTS_ONLY'
            ? 'Total'
            : 'Period',
    setPointTargets,
    supportsDraw: source.supportsDraw === true && !supportsShootout,
    supportsOvertime: source.supportsOvertime === true,
    supportsShootout,
    canUseOvertime: source.canUseOvertime === true || source.supportsOvertime === true,
    canUseShootout: source.canUseShootout === true || source.supportsShootout === true,
    officialRoles: Array.isArray(source.officialRoles) ? source.officialRoles.map(String).filter(Boolean) : [],
    supportedIncidentTypes: Array.isArray(source.supportedIncidentTypes) && source.supportedIncidentTypes.length
      ? source.supportedIncidentTypes.map(String).filter(Boolean)
      : ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
    incidentTypeDefinitions: Array.isArray(source.incidentTypeDefinitions)
      ? source.incidentTypeDefinitions as ResolvedMatchRules['incidentTypeDefinitions']
      : [],
    autoCreatePointIncidentType: typeof source.autoCreatePointIncidentType === 'string'
      ? source.autoCreatePointIncidentType
      : 'POINT',
    pointIncidentRequiresParticipant: source.pointIncidentRequiresParticipant === true,
    timekeeping: normalizeTimekeeping(source.timekeeping, policy, scoringModel, segmentCount),
  };
};
