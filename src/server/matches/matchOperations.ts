import type {
  EventOfficialPosition,
  MatchIncidentCardColor,
  MatchIncidentDefinitionKind,
  MatchIncidentTypeDefinition,
  MatchIncident,
  MatchRulesConfig,
  MatchSegment,
  MatchSegmentStatus,
  MatchTimekeepingConfig,
  MatchTimerMode,
  ResolvedMatchTimekeepingConfig,
  ResolvedMatchRules,
} from '@/types';

const DEFAULT_POINT_INCIDENT_TYPE = 'POINT';
const DEFAULT_INCIDENT_CODES = [DEFAULT_POINT_INCIDENT_TYPE, 'DISCIPLINE', 'NOTE', 'ADMIN'];
const SCORING_INCIDENT_CODES = new Set(['POINT', 'GOAL', 'RUN', 'SCORE']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.trunc(numeric));
};

const normalizeStringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
    : []
);

const normalizeRulesConfig = (value: unknown): MatchRulesConfig => (
  isRecord(value) ? { ...(value as MatchRulesConfig) } : {}
);

const normalizeIncidentCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || null;
};

const incidentLabelForCode = (code: string): string => {
  switch (code) {
    case 'POINT':
      return 'Point';
    case 'GOAL':
      return 'Goal';
    case 'RUN':
      return 'Run';
    case 'DISCIPLINE':
      return 'Penalty or card';
    case 'NOTE':
      return 'Match note';
    case 'ADMIN':
      return 'Admin note';
    default:
      return code
        .toLowerCase()
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
};

const incidentKindForCode = (code: string): MatchIncidentDefinitionKind => {
  if (SCORING_INCIDENT_CODES.has(code)) return 'SCORING';
  if (code === 'NOTE') return 'NOTE';
  if (code === 'ADMIN') return 'ADMIN';
  return 'DISCIPLINE';
};

const normalizeIncidentKind = (
  value: unknown,
  fallback: MatchIncidentDefinitionKind,
): MatchIncidentDefinitionKind => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SCORING' || normalized === 'DISCIPLINE' || normalized === 'NOTE' || normalized === 'ADMIN') {
    return normalized;
  }
  return fallback;
};

const normalizeCardColor = (value: unknown): MatchIncidentCardColor | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'yellow' || normalized === 'red' || normalized === 'blue') {
    return normalized;
  }
  return null;
};

const incidentDefinitionForCode = (
  code: string,
  overrides: Partial<MatchIncidentTypeDefinition> = {},
): MatchIncidentTypeDefinition => {
  const normalizedCode = normalizeIncidentCode(code) ?? DEFAULT_POINT_INCIDENT_TYPE;
  const fallbackKind = incidentKindForCode(normalizedCode);
  const kind = normalizeIncidentKind(overrides.kind, fallbackKind);
  const cardColor = normalizeCardColor(overrides.cardColor);
  return {
    code: normalizedCode,
    label: typeof overrides.label === 'string' && overrides.label.trim()
      ? overrides.label.trim()
      : incidentLabelForCode(normalizedCode),
    kind,
    ...(cardColor ? { cardColor } : {}),
    requiresTeam: typeof overrides.requiresTeam === 'boolean'
      ? overrides.requiresTeam
      : kind === 'SCORING',
    requiresParticipant: overrides.requiresParticipant === true,
    defaultEnabled: overrides.defaultEnabled !== false,
    linkedPointDelta: typeof overrides.linkedPointDelta === 'number' && Number.isFinite(overrides.linkedPointDelta)
      ? Math.trunc(overrides.linkedPointDelta)
      : kind === 'SCORING'
        ? 1
        : null,
    metadata: isRecord(overrides.metadata) ? { ...overrides.metadata } : null,
  };
};

const normalizeIncidentDefinition = (value: unknown): MatchIncidentTypeDefinition | null => {
  if (!isRecord(value)) return null;
  const code = normalizeIncidentCode(value.code);
  if (!code) return null;
  return incidentDefinitionForCode(code, value as Partial<MatchIncidentTypeDefinition>);
};

const mergeIncidentDefinitions = (
  ...sources: unknown[]
): MatchIncidentTypeDefinition[] => {
  const byCode = new Map<string, MatchIncidentTypeDefinition>();
  const addDefinition = (definition: MatchIncidentTypeDefinition) => {
    const previous = byCode.get(definition.code);
    byCode.set(definition.code, previous ? { ...previous, ...definition, code: previous.code } : definition);
  };
  DEFAULT_INCIDENT_CODES.forEach((code) => addDefinition(incidentDefinitionForCode(code)));
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((entry) => {
      const definition = normalizeIncidentDefinition(entry);
      if (definition) addDefinition(definition);
    });
  });
  return Array.from(byCode.values());
};

const normalizeIncidentCodeList = (value: unknown): string[] => (
  normalizeStringList(value)
    .map((entry) => normalizeIncidentCode(entry))
    .filter((entry): entry is string => Boolean(entry))
);

const normalizeTimerMode = (value: unknown, fallback: MatchTimerMode): MatchTimerMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'COUNT_UP' || normalized === 'NONE' ? normalized : fallback;
};

const normalizePositiveNullableInt = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
};

const normalizeTimekeepingConfig = (value: unknown): MatchTimekeepingConfig => {
  if (!isRecord(value)) return {};
  const segmentDurationMinutes = normalizePositiveNullableInt(value.segmentDurationMinutes);
  const sequenceDurations = Array.isArray(value.segmentDurationMinutesBySequence)
    ? value.segmentDurationMinutesBySequence
        .map((entry) => normalizePositiveNullableInt(entry))
        .filter((entry): entry is number => entry !== null)
    : [];
  return {
    ...(typeof value.timerMode === 'string' ? { timerMode: normalizeTimerMode(value.timerMode, 'NONE') } : {}),
    ...(segmentDurationMinutes ? { segmentDurationMinutes } : value.segmentDurationMinutes === null ? { segmentDurationMinutes: null } : {}),
    ...(sequenceDurations.length ? { segmentDurationMinutesBySequence: sequenceDurations } : {}),
    ...(typeof value.canUseAddedTime === 'boolean' ? { canUseAddedTime: value.canUseAddedTime } : {}),
    ...(typeof value.addedTimeEnabled === 'boolean' ? { addedTimeEnabled: value.addedTimeEnabled } : {}),
    ...(typeof value.stopAtRegulationEnd === 'boolean' ? { stopAtRegulationEnd: value.stopAtRegulationEnd } : {}),
  };
};

const resolveTimekeeping = (params: {
  scoringModel: ResolvedMatchRules['scoringModel'];
  segmentCount: number;
  matchDurationMinutes?: number | null;
  sportTemplate: MatchRulesConfig;
  eventOverride: MatchRulesConfig;
}): ResolvedMatchTimekeepingConfig => {
  const sportTimekeeping = normalizeTimekeepingConfig(params.sportTemplate.timekeeping);
  const eventTimekeeping = normalizeTimekeepingConfig(params.eventOverride.timekeeping);
  const merged = { ...sportTimekeeping, ...eventTimekeeping };
  const fallbackMode: MatchTimerMode = sportTimekeeping.timerMode
    ?? (params.scoringModel === 'PERIODS' ? 'COUNT_UP' : 'NONE');
  const timerMode = normalizeTimerMode(merged.timerMode, fallbackMode);
  const fallbackSegmentDuration = (() => {
    const fromMatchDuration = normalizePositiveNullableInt(params.matchDurationMinutes);
    if (fromMatchDuration && params.segmentCount > 0 && timerMode !== 'NONE') {
      return Math.max(1, Math.round(fromMatchDuration / params.segmentCount));
    }
    return null;
  })();
  const segmentDurationMinutes = normalizePositiveNullableInt(merged.segmentDurationMinutes)
    ?? fallbackSegmentDuration;
  const sequenceDurations = Array.isArray(merged.segmentDurationMinutesBySequence)
    ? merged.segmentDurationMinutesBySequence
        .map((entry) => normalizePositiveNullableInt(entry))
        .filter((entry): entry is number => entry !== null)
    : [];
  const sportAllowsAddedTime = sportTimekeeping.canUseAddedTime === true;
  const canUseAddedTime = sportAllowsAddedTime || (!Object.keys(params.sportTemplate).length && eventTimekeeping.canUseAddedTime === true);
  const addedTimeEnabled = timerMode !== 'NONE'
    && canUseAddedTime
    && merged.addedTimeEnabled === true;
  const stopAtRegulationEnd = timerMode === 'NONE'
    ? true
    : addedTimeEnabled
      ? false
      : typeof merged.stopAtRegulationEnd === 'boolean'
        ? merged.stopAtRegulationEnd
        : true;
  return {
    timerMode,
    segmentDurationMinutes,
    segmentDurationMinutesBySequence: sequenceDurations,
    canUseAddedTime: timerMode !== 'NONE' && canUseAddedTime,
    addedTimeEnabled,
    stopAtRegulationEnd,
  };
};

const resolveScoringModel = (value: unknown, fallback: ResolvedMatchRules['scoringModel']): ResolvedMatchRules['scoringModel'] => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SETS' || normalized === 'PERIODS' || normalized === 'INNINGS' || normalized === 'POINTS_ONLY') {
    return normalized;
  }
  return fallback;
};

const segmentLabelForModel = (model: ResolvedMatchRules['scoringModel']): string => {
  switch (model) {
    case 'SETS':
      return 'Set';
    case 'INNINGS':
      return 'Inning';
    case 'POINTS_ONLY':
      return 'Total';
    case 'PERIODS':
    default:
      return 'Period';
  }
};

export const resolveMatchRules = (params: {
  sportTemplate?: unknown;
  eventOverride?: unknown;
  autoCreatePointMatchIncidents?: boolean | null;
  usesSets?: boolean | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  matchDurationMinutes?: number | null;
  officialPositions?: EventOfficialPosition[];
}): ResolvedMatchRules => {
  const sportTemplate = normalizeRulesConfig(params.sportTemplate);
  const eventOverride = normalizeRulesConfig(params.eventOverride);
  const merged: MatchRulesConfig = { ...sportTemplate, ...eventOverride };
  const hasSportTemplate = Object.keys(sportTemplate).length > 0;
  const fallbackModel = params.usesSets ? 'SETS' : 'POINTS_ONLY';
  const scoringModel = resolveScoringModel(merged.scoringModel, fallbackModel);
  const fallbackSegmentCount = scoringModel === 'SETS'
    ? normalizePositiveInt(params.setsPerMatch ?? params.winnerSetCount, 1)
    : 1;
  const segmentCount = normalizePositiveInt(merged.segmentCount, fallbackSegmentCount);
  const officialRolesFromPositions = (params.officialPositions ?? [])
    .map((position) => position.name.trim())
    .filter(Boolean);
  const autoCreatePointIncidentType = typeof merged.autoCreatePointIncidentType === 'string' && merged.autoCreatePointIncidentType.trim()
    ? normalizeIncidentCode(merged.autoCreatePointIncidentType) ?? DEFAULT_POINT_INCIDENT_TYPE
    : DEFAULT_POINT_INCIDENT_TYPE;
  const incidentTypeDefinitions = mergeIncidentDefinitions(
    sportTemplate.incidentTypeDefinitions,
    eventOverride.incidentTypeDefinitions,
    [incidentDefinitionForCode(autoCreatePointIncidentType, { kind: 'SCORING', requiresTeam: true, linkedPointDelta: 1 })],
  );
  const configuredIncidentTypes = normalizeIncidentCodeList(merged.supportedIncidentTypes);
  const supportedIncidentTypes = configuredIncidentTypes.length
    ? configuredIncidentTypes
    : incidentTypeDefinitions
        .filter((definition) => definition.defaultEnabled !== false)
        .map((definition) => definition.code);
  const canUseOvertime = hasSportTemplate
    ? sportTemplate.canUseOvertime === true || sportTemplate.supportsOvertime === true
    : eventOverride.canUseOvertime === true || eventOverride.supportsOvertime === true;
  const canUseShootout = hasSportTemplate
    ? sportTemplate.canUseShootout === true || sportTemplate.supportsShootout === true
    : eventOverride.canUseShootout === true || eventOverride.supportsShootout === true;
  const supportsOvertime = canUseOvertime && merged.supportsOvertime === true;
  const supportsShootout = canUseShootout && merged.supportsShootout === true;

  return {
    scoringModel,
    segmentCount,
    segmentLabel: typeof merged.segmentLabel === 'string' && merged.segmentLabel.trim()
      ? merged.segmentLabel.trim()
      : segmentLabelForModel(scoringModel),
    supportsDraw: merged.supportsDraw === true && !supportsShootout,
    supportsOvertime,
    supportsShootout,
    canUseOvertime,
    canUseShootout,
    officialRoles: normalizeStringList(merged.officialRoles).length
      ? normalizeStringList(merged.officialRoles)
      : officialRolesFromPositions,
    supportedIncidentTypes: supportedIncidentTypes.length ? supportedIncidentTypes : [...DEFAULT_INCIDENT_CODES],
    incidentTypeDefinitions: incidentTypeDefinitions.length
      ? incidentTypeDefinitions
      : DEFAULT_INCIDENT_CODES.map((code) => incidentDefinitionForCode(code)),
    autoCreatePointIncidentType,
    // Automatic point/goal incident capture is now the single source of truth.
    pointIncidentRequiresParticipant: params.autoCreatePointMatchIncidents === true,
    timekeeping: resolveTimekeeping({
      scoringModel,
      segmentCount,
      matchDurationMinutes: params.matchDurationMinutes,
      sportTemplate,
      eventOverride,
    }),
  };
};

const positiveIntOrZero = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.trunc(numeric);
};

const hasMatchLink = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as { id?: unknown; $id?: unknown };
  return Boolean(
    (typeof row.id === 'string' && row.id.trim().length > 0)
      || (typeof row.$id === 'string' && row.$id.trim().length > 0),
  );
};

const isBracketMatch = (params: {
  losersBracket?: boolean | null;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  previousLeftMatch?: unknown;
  previousRightMatch?: unknown;
  winnerNextMatch?: unknown;
  loserNextMatch?: unknown;
}): boolean => (
  params.losersBracket === true
  || hasMatchLink(params.previousLeftId)
  || hasMatchLink(params.previousRightId)
  || hasMatchLink(params.winnerNextMatchId)
  || hasMatchLink(params.loserNextMatchId)
  || hasMatchLink(params.previousLeftMatch)
  || hasMatchLink(params.previousRightMatch)
  || hasMatchLink(params.winnerNextMatch)
  || hasMatchLink(params.loserNextMatch)
);

export const resolveMatchRulesForContext = (params: {
  baseRules?: ResolvedMatchRules | null;
  eventType?: string | null;
  usesSets?: boolean | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  loserSetCount?: number | null;
  losersBracket?: boolean | null;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  previousLeftMatch?: unknown;
  previousRightMatch?: unknown;
  winnerNextMatch?: unknown;
  loserNextMatch?: unknown;
  existingSegmentCount?: number | null;
  existingTeam1PointCount?: number | null;
  existingTeam2PointCount?: number | null;
  existingResultCount?: number | null;
}): ResolvedMatchRules | null => {
  if (!params.baseRules) {
    return null;
  }
  const fallbackSegmentCount = Math.max(
    positiveIntOrZero(params.existingSegmentCount),
    positiveIntOrZero(params.existingTeam1PointCount),
    positiveIntOrZero(params.existingTeam2PointCount),
    positiveIntOrZero(params.existingResultCount),
    1,
  );

  if (params.baseRules.scoringModel === 'POINTS_ONLY') {
    return { ...params.baseRules, segmentCount: 1 };
  }
  if (params.baseRules.scoringModel !== 'SETS') {
    return {
      ...params.baseRules,
      segmentCount: Math.max(positiveIntOrZero(params.baseRules.segmentCount), fallbackSegmentCount, 1),
    };
  }

  const contextualSetCount = params.losersBracket
    ? positiveIntOrZero(params.loserSetCount)
    : params.eventType === 'LEAGUE' && !isBracketMatch(params)
      ? Math.max(
          positiveIntOrZero(params.setsPerMatch),
          positiveIntOrZero(params.winnerSetCount),
        )
      : Math.max(
          positiveIntOrZero(params.winnerSetCount),
          positiveIntOrZero(params.setsPerMatch),
        );

  return {
    ...params.baseRules,
    segmentCount: Math.max(
      positiveIntOrZero(params.baseRules.segmentCount),
      contextualSetCount,
      fallbackSegmentCount,
      1,
    ),
  };
};

export const shouldFreezeMatchRulesSnapshot = (params: {
  segmentOperations?: Array<{
    scores?: Record<string, number> | null | undefined;
    startedAt?: string | null | undefined;
    endedAt?: string | null | undefined;
  }>;
  incidentOperations?: unknown[];
}): boolean => {
  if (Array.isArray(params.incidentOperations) && params.incidentOperations.length > 0) {
    return true;
  }
  return Array.isArray(params.segmentOperations) && params.segmentOperations.some((operation) => {
    const scores = operation?.scores;
    return Boolean(
      (scores && Object.keys(scores).length > 0)
      || operation?.startedAt !== undefined
      || operation?.endedAt !== undefined,
    );
  });
};

const isoOrNull = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return null;
};

export const normalizeScores = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {};
  }
  return Object.entries(value).reduce<Record<string, number>>((acc, [key, raw]) => {
    const normalizedKey = key.trim();
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (normalizedKey && Number.isFinite(numeric)) {
      acc[normalizedKey] = Math.max(0, Math.trunc(numeric));
    }
    return acc;
  }, {});
};

export const serializeMatchSegmentRow = (row: any): MatchSegment => ({
  id: String(row.id),
  $id: String(row.id),
  eventId: row.eventId ?? null,
  matchId: String(row.matchId),
  sequence: normalizePositiveInt(row.sequence, 1),
  status: (typeof row.status === 'string' && row.status.trim()
    ? row.status.trim()
    : 'NOT_STARTED') as MatchSegmentStatus,
  scores: normalizeScores(row.scores),
  winnerEventTeamId: row.winnerEventTeamId ?? null,
  startedAt: isoOrNull(row.startedAt),
  endedAt: isoOrNull(row.endedAt),
  resultType: row.resultType ?? null,
  statusReason: row.statusReason ?? null,
  metadata: isRecord(row.metadata) ? row.metadata : null,
  createdAt: isoOrNull(row.createdAt),
  updatedAt: isoOrNull(row.updatedAt),
});

export const serializeMatchIncidentRow = (row: any): MatchIncident => ({
  id: String(row.id),
  $id: String(row.id),
  eventId: row.eventId ?? null,
  matchId: String(row.matchId),
  segmentId: row.segmentId ?? null,
  eventTeamId: row.eventTeamId ?? null,
  eventRegistrationId: row.eventRegistrationId ?? null,
  participantUserId: row.participantUserId ?? null,
  officialUserId: row.officialUserId ?? null,
  incidentType: String(row.incidentType),
  sequence: normalizePositiveInt(row.sequence, 1),
  minute: typeof row.minute === 'number' ? row.minute : null,
  clock: row.clock ?? null,
  clockSeconds: typeof row.clockSeconds === 'number' ? row.clockSeconds : null,
  linkedPointDelta: typeof row.linkedPointDelta === 'number' ? row.linkedPointDelta : null,
  note: row.note ?? null,
  metadata: isRecord(row.metadata) ? row.metadata : null,
  createdAt: isoOrNull(row.createdAt),
  updatedAt: isoOrNull(row.updatedAt),
});

export const buildLegacySegments = (params: {
  eventId?: string | null;
  matchId: string;
  team1Id?: string | null;
  team2Id?: string | null;
  team1Points?: number[] | null;
  team2Points?: number[] | null;
  setResults?: number[] | null;
  start?: Date | null;
  end?: Date | null;
}): MatchSegment[] => {
  const team1Points = Array.isArray(params.team1Points) ? params.team1Points : [];
  const team2Points = Array.isArray(params.team2Points) ? params.team2Points : [];
  const setResults = Array.isArray(params.setResults) ? params.setResults : [];
  const length = Math.max(team1Points.length, team2Points.length, setResults.length, 0);
  return Array.from({ length }, (_, index) => {
    const sequence = index + 1;
    const team1Score = Math.max(0, Math.trunc(Number(team1Points[index] ?? 0)));
    const team2Score = Math.max(0, Math.trunc(Number(team2Points[index] ?? 0)));
    const result = Number(setResults[index] ?? 0);
    const winnerEventTeamId = result === 1
      ? params.team1Id ?? null
      : result === 2
        ? params.team2Id ?? null
        : null;
    const scores: Record<string, number> = {};
    if (params.team1Id) {
      scores[params.team1Id] = team1Score;
    }
    if (params.team2Id) {
      scores[params.team2Id] = team2Score;
    }
    return {
      id: `${params.matchId}_segment_${sequence}`,
      $id: `${params.matchId}_segment_${sequence}`,
      eventId: params.eventId ?? null,
      matchId: params.matchId,
      sequence,
      status: winnerEventTeamId
        ? 'COMPLETE'
        : team1Score > 0 || team2Score > 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED',
      scores,
      winnerEventTeamId,
      startedAt: team1Score > 0 || team2Score > 0 ? isoOrNull(params.start) : null,
      endedAt: winnerEventTeamId ? isoOrNull(params.end) : null,
      resultType: null,
      statusReason: null,
      metadata: null,
    };
  });
};
