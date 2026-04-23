import type {
  EventOfficialPosition,
  MatchIncident,
  MatchRulesConfig,
  MatchSegment,
  MatchSegmentStatus,
  ResolvedMatchRules,
} from '@/types';

const DEFAULT_POINT_INCIDENT_TYPE = 'POINT';

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
    supportedIncidentTypes: normalizeStringList(merged.supportedIncidentTypes).length
      ? normalizeStringList(merged.supportedIncidentTypes)
      : [DEFAULT_POINT_INCIDENT_TYPE, 'DISCIPLINE', 'NOTE', 'ADMIN'],
    autoCreatePointIncidentType: typeof merged.autoCreatePointIncidentType === 'string' && merged.autoCreatePointIncidentType.trim()
      ? merged.autoCreatePointIncidentType.trim()
      : DEFAULT_POINT_INCIDENT_TYPE,
    // Automatic point/goal incident capture is now the single source of truth.
    pointIncidentRequiresParticipant: params.autoCreatePointMatchIncidents === true,
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
  segmentOperations?: Array<{ scores?: Record<string, number> | null | undefined }>;
  incidentOperations?: unknown[];
}): boolean => {
  if (Array.isArray(params.incidentOperations) && params.incidentOperations.length > 0) {
    return true;
  }
  return Array.isArray(params.segmentOperations) && params.segmentOperations.some((operation) => {
    const scores = operation?.scores;
    return Boolean(scores && Object.keys(scores).length > 0);
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
