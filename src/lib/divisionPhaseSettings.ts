import type {
  DivisionCompetitionPhase,
  DivisionKind,
  DivisionPhaseSettings,
  DivisionPhaseSettingsMap,
  MatchRulesConfig,
} from '@/types';

const PHASES: DivisionCompetitionPhase[] = ['LEAGUE', 'POOL', 'BRACKET', 'PLAYOFF'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeOptionalNonNegativeInt = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.trunc(numeric);
};

export const resolveDivisionCompetitionPhase = (input: {
  eventType?: string | null;
  divisionKind?: DivisionKind | string | null;
  hasBracketLinks?: boolean;
}): DivisionCompetitionPhase => {
  const eventType = String(input.eventType ?? '').trim().toUpperCase();
  const divisionKind = String(input.divisionKind ?? 'LEAGUE').trim().toUpperCase();

  if (eventType === 'TOURNAMENT') {
    return input.hasBracketLinks || divisionKind === 'PLAYOFF' ? 'BRACKET' : 'POOL';
  }
  if (eventType === 'LEAGUE') {
    return input.hasBracketLinks || divisionKind === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
  }
  return divisionKind === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
};

export const calculateTimedMatchDurationMinutes = (input: {
  segmentCount?: number | null;
  segmentLengthMinutes?: number | null;
  segmentBreakMinutes?: number | null;
}): number | null => {
  const segmentCount = Number(input.segmentCount);
  const segmentLengthMinutes = Number(input.segmentLengthMinutes);
  const segmentBreakMinutes = input.segmentBreakMinutes == null
    ? 0
    : Number(input.segmentBreakMinutes);

  if (
    !Number.isFinite(segmentCount)
    || segmentCount < 1
    || !Number.isFinite(segmentLengthMinutes)
    || segmentLengthMinutes < 1
    || !Number.isFinite(segmentBreakMinutes)
    || segmentBreakMinutes < 0
  ) {
    return null;
  }

  const normalizedSegmentCount = Math.trunc(segmentCount);
  const normalizedSegmentLength = Math.trunc(segmentLengthMinutes);
  const normalizedSegmentBreak = Math.trunc(segmentBreakMinutes);
  return (
    normalizedSegmentCount * normalizedSegmentLength
    + Math.max(normalizedSegmentCount - 1, 0) * normalizedSegmentBreak
  );
};

export const normalizeDivisionPhaseSettingsMap = (value: unknown): DivisionPhaseSettingsMap => {
  if (!isRecord(value)) return {};

  const result: DivisionPhaseSettingsMap = {};
  PHASES.forEach((phase) => {
    const rawSettings = value[phase];
    if (!isRecord(rawSettings)) return;

    const settings: DivisionPhaseSettings = {};
    if (rawSettings.matchRulesOverride === null) {
      settings.matchRulesOverride = null;
    } else if (isRecord(rawSettings.matchRulesOverride)) {
      settings.matchRulesOverride = { ...rawSettings.matchRulesOverride } as MatchRulesConfig;
    }
    if (typeof rawSettings.autoCreatePointMatchIncidents === 'boolean') {
      settings.autoCreatePointMatchIncidents = rawSettings.autoCreatePointMatchIncidents;
    }
    const segmentLengthMinutes = normalizeOptionalNonNegativeInt(rawSettings.segmentLengthMinutes);
    if (segmentLengthMinutes !== undefined) {
      settings.segmentLengthMinutes = segmentLengthMinutes;
    }
    const segmentBreakMinutes = normalizeOptionalNonNegativeInt(rawSettings.segmentBreakMinutes);
    if (segmentBreakMinutes !== undefined) {
      settings.segmentBreakMinutes = segmentBreakMinutes;
    }
    if (Object.keys(settings).length > 0) {
      result[phase] = settings;
    }
  });

  return result;
};
