'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  Event,
  getTeamAvatarUrl,
  Match,
  MatchIncident,
  MatchIncidentOperation,
  MatchOfficialCheckInOperation,
  MatchSegment,
  MatchSegmentOperation,
  ResolvedMatchRules,
  Team,
  TeamPlayerRegistration,
  UserData,
} from '@/types';

type ScorePayload = {
  matchId: string;
  segments: MatchSegment[];
  scoreSet?: {
    segmentId?: string | null;
    sequence: number;
    eventTeamId: string;
    points: number;
  };
  segmentOperations?: MatchSegmentOperation[];
  incidentOperations?: MatchIncidentOperation[];
  officialCheckIn?: MatchOfficialCheckInOperation;
  team1Points: number[];
  team2Points: number[];
  setResults: number[];
};

type MatchRosterParticipantOption = {
  value: string;
  label: string;
  scoringLabel: string;
  participantUserId: string;
  eventRegistrationId: string | null;
  eventTeamId: string | null;
};

interface ScoreUpdateModalProps {
  match: Match;
  tournament: Event;
  canManage: boolean;
  onSubmit?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
  onScoreChange?: (payload: ScorePayload) => Promise<void> | void;
  onSetComplete?: (payload: ScorePayload) => Promise<void>;
  onMatchComplete?: (payload: ScorePayload & { eventId: string }) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

const entityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as { $id?: unknown; id?: unknown };
  const raw = typeof row.$id === 'string' ? row.$id : typeof row.id === 'string' ? row.id : '';
  return raw.trim() || null;
};

const positiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const score = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const teamName = (team: any): string => {
  if (team?.name) return team.name;
  if (Array.isArray(team?.players) && team.players.length) {
    return team.players.map((player: any) => [player.firstName, player.lastName].filter(Boolean).join(' ')).join(' & ');
  }
  return 'TBD';
};

const teamPlayers = (team: Team | null | undefined) => (
  Array.isArray(team?.players) ? team.players : []
);

const teamPlayerRegistrations = (team: Team | null | undefined) => (
  Array.isArray(team?.playerRegistrations) ? team.playerRegistrations : []
);

const participantLabel = (
  player?: UserData | null,
  registration?: TeamPlayerRegistration | null,
): string => {
  const fullName = [player?.firstName, player?.lastName].filter(Boolean).join(' ').trim()
    || player?.userName?.trim()
    || registration?.userId
    || 'Participant';
  const details = [registration?.jerseyNumber ? `#${registration.jerseyNumber}` : null, registration?.position ?? null]
    .filter(Boolean)
    .join(' ');
  return details ? `${fullName} (${details})` : fullName;
};

const scoringParticipantLabel = (
  player?: UserData | null,
  registration?: TeamPlayerRegistration | null,
): string => {
  const fullName = [player?.firstName, player?.lastName].filter(Boolean).join(' ').trim()
    || player?.userName?.trim()
    || 'Player';
  return registration?.jerseyNumber ? `${fullName} #${registration.jerseyNumber}` : fullName;
};

const buildParticipantOptions = (team: Team | null | undefined, eventTeamId: string | null): MatchRosterParticipantOption[] => {
  const playersById = new Map(teamPlayers(team).map((player) => [player.$id, player]));
  const registrations = teamPlayerRegistrations(team)
    .filter((registration) => ['ACTIVE', 'STARTED'].includes(String(registration.status ?? '').trim().toUpperCase()));
  if (registrations.length) {
    const registrationPlayer = (registration: TeamPlayerRegistration) => playersById.get(registration.userId);
    return registrations.map((registration) => ({
      value: registration.id,
      label: participantLabel(registrationPlayer(registration), registration),
      scoringLabel: scoringParticipantLabel(registrationPlayer(registration), registration),
      participantUserId: registration.userId,
      eventRegistrationId: registration.id,
      eventTeamId,
    }));
  }
  return teamPlayers(team).map((player) => ({
    value: player.$id,
    label: participantLabel(player, null),
    scoringLabel: scoringParticipantLabel(player, null),
    participantUserId: player.$id,
    eventRegistrationId: null,
    eventTeamId,
  }));
};

const dateLabel = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const activeRules = (match: Match, event: Event, usesSets: boolean, segmentCount: number): ResolvedMatchRules => {
  const eventRules = (event.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchResolvedRules = (match.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchSnapshotRules = (match.matchRulesSnapshot || {}) as Partial<ResolvedMatchRules>;
  const source = { ...eventRules, ...matchResolvedRules, ...matchSnapshotRules };
  const scoringModel = source.scoringModel ?? (usesSets ? 'SETS' : 'POINTS_ONLY');
  const supportsShootout = source.supportsShootout === true;
  return {
    scoringModel,
    segmentCount: positiveInt(source.segmentCount, segmentCount),
    segmentLabel: source.segmentLabel || (scoringModel === 'SETS' ? 'Set' : scoringModel === 'INNINGS' ? 'Inning' : scoringModel === 'POINTS_ONLY' ? 'Total' : 'Period'),
    supportsDraw: source.supportsDraw === true && !supportsShootout,
    supportsOvertime: source.supportsOvertime === true,
    supportsShootout,
    canUseOvertime: source.canUseOvertime === true || source.supportsOvertime === true,
    canUseShootout: source.canUseShootout === true || source.supportsShootout === true,
    officialRoles: Array.isArray(source.officialRoles) ? source.officialRoles : [],
    supportedIncidentTypes: Array.isArray(source.supportedIncidentTypes) && source.supportedIncidentTypes.length
      ? source.supportedIncidentTypes
      : ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
    autoCreatePointIncidentType: source.autoCreatePointIncidentType ?? 'POINT',
    pointIncidentRequiresParticipant: eventRules.pointIncidentRequiresParticipant === true
      || matchResolvedRules.pointIncidentRequiresParticipant === true
      || matchSnapshotRules.pointIncidentRequiresParticipant === true,
  };
};

const labelForSegment = (rules: ResolvedMatchRules, sequence: number): string => (
  rules.scoringModel === 'POINTS_ONLY' ? rules.segmentLabel : `${rules.segmentLabel} ${sequence}`
);

const rulesSummary = (rules: ResolvedMatchRules): string => {
  if (rules.scoringModel === 'SETS' || rules.segmentCount === 1) {
    return `Best of ${rules.segmentCount}`;
  }
  const label = rules.segmentLabel.toLowerCase();
  return `${rules.segmentCount} ${label}${rules.segmentCount === 1 ? '' : 's'}`;
};

const scoreForSegment = (
  segment: MatchSegment | undefined,
  segmentIndex: number,
  eventTeamId: string | null,
  fallbackScores: number[] | undefined,
): number => (
  eventTeamId
    ? score(segment?.scores?.[eventTeamId])
    : score(fallbackScores?.[segmentIndex])
);

const matchLogTypeLabel = (type: string): string => {
  const normalized = type.trim().toUpperCase();
  if (normalized === 'POINT') return 'Scoring detail';
  if (normalized === 'DISCIPLINE') return 'Penalty or card';
  if (normalized === 'NOTE') return 'Match note';
  if (normalized === 'ADMIN') return 'Admin note';
  return type
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizedIncidentType = (type?: string | null): string => String(type ?? '').trim().toUpperCase();

const isScoringIncidentType = (type: string | null | undefined, rules: Pick<ResolvedMatchRules, 'autoCreatePointIncidentType'>): boolean => {
  const normalized = normalizedIncidentType(type);
  if (!normalized) return false;
  const primary = normalizedIncidentType(rules.autoCreatePointIncidentType ?? 'POINT');
  return normalized === primary || ['POINT', 'GOAL', 'RUN', 'SCORE'].includes(normalized);
};

const titleCaseValue = (value?: string | null): string => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'Scheduled';
  return normalized
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const userDisplayName = (user?: (Partial<UserData> & { id?: string; name?: string }) | null): string | null => {
  if (!user) return null;
  const fullName = typeof user.fullName === 'string' ? user.fullName.trim() : '';
  const firstLast = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  const userName = typeof user.userName === 'string' ? user.userName.trim() : '';
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  return fullName || firstLast || displayName || userName || name || null;
};

const userEntityId = (user?: (Partial<UserData> & { id?: string }) | null): string | null => (
  entityId(user) ?? (typeof user?.id === 'string' && user.id.trim() ? user.id.trim() : null)
);

const legacyArray = (values: number[] | undefined, length: number): number[] => {
  const next = (Array.isArray(values) ? values : []).slice(0, length).map(score);
  while (next.length < length) next.push(0);
  return next;
};

const hasPointArrayData = (values: unknown): boolean => Array.isArray(values) && values.length > 0;

const hasSegmentScoreData = (segments: unknown, teamIds: Array<string | null>): boolean => (
  Array.isArray(segments)
  && segments.some((segment) => {
    if (!segment || typeof segment !== 'object') return false;
    const scores = (segment as { scores?: unknown }).scores;
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return false;
    return teamIds.some((teamId) => Boolean(teamId && Object.prototype.hasOwnProperty.call(scores, teamId)));
  })
);

const hasPersistedScoreData = (match: Match, team1Id: string | null, team2Id: string | null): boolean => (
  hasSegmentScoreData(match.segments, [team1Id, team2Id])
  || hasPointArrayData((match as { team1Points?: unknown }).team1Points)
  || hasPointArrayData((match as { team2Points?: unknown }).team2Points)
);

const pendingIncidentStorageKey = (eventId: string | null | undefined, matchId: string) => (
  `bracketiq:pending-match-incidents:${eventId ?? 'unknown'}:${matchId}`
);

const readPendingIncidentRetries = (key: string): MatchIncidentOperation[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((operation): operation is MatchIncidentOperation => (
          operation?.action === 'CREATE' && typeof operation.id === 'string' && operation.id.trim().length > 0
        ))
      : [];
  } catch {
    return [];
  }
};

const writePendingIncidentRetries = (key: string, operations: MatchIncidentOperation[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (operations.length) {
      window.localStorage.setItem(key, JSON.stringify(operations));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Keep the in-memory retry queue even if storage is unavailable.
  }
};

const applyPendingIncidentDeltas = (
  source: MatchSegment[],
  operations: MatchIncidentOperation[],
): MatchSegment[] => {
  if (!operations.length) return source;
  return source.map((segment) => {
    const segmentId = segment.id ?? segment.$id;
    const scoringOperations = operations.filter((operation) => (
      operation.action === 'CREATE'
      && operation.segmentId === segmentId
      && operation.eventTeamId
      && typeof operation.linkedPointDelta === 'number'
      && Number.isFinite(operation.linkedPointDelta)
    ));
    if (!scoringOperations.length) return segment;
    const scores = { ...(segment.scores ?? {}) };
    scoringOperations.forEach((operation) => {
      const eventTeamId = operation.eventTeamId!;
      scores[eventTeamId] = Math.max(0, score(scores[eventTeamId]) + Math.trunc(operation.linkedPointDelta ?? 0));
    });
    return {
      ...segment,
      status: segment.status === 'NOT_STARTED' ? 'IN_PROGRESS' : segment.status,
      scores,
    };
  });
};

const applyMatchIncidentDeltas = (
  source: MatchSegment[],
  incidents: MatchIncident[] | undefined,
  rules: Pick<ResolvedMatchRules, 'autoCreatePointIncidentType'>,
): MatchSegment[] => {
  const scoringIncidents = (incidents ?? []).filter((incident) => (
    isScoringIncidentType(incident.incidentType, rules)
    && incident.segmentId
    && incident.eventTeamId
    && typeof incident.linkedPointDelta === 'number'
    && Number.isFinite(incident.linkedPointDelta)
  ));
  if (!scoringIncidents.length) return source;
  return source.map((segment) => {
    const segmentId = segment.id ?? segment.$id;
    const segmentIncidents = scoringIncidents.filter((incident) => incident.segmentId === segmentId);
    if (!segmentIncidents.length) return segment;
    const scores = { ...(segment.scores ?? {}) };
    segmentIncidents.forEach((incident) => {
      const eventTeamId = incident.eventTeamId!;
      scores[eventTeamId] = Math.max(0, score(scores[eventTeamId]) + Math.trunc(incident.linkedPointDelta ?? 0));
    });
    return {
      ...segment,
      status: segment.status === 'NOT_STARTED' ? 'IN_PROGRESS' : segment.status,
      scores,
    };
  });
};

const buildSegments = (match: Match, length: number, team1Id: string | null, team2Id: string | null): MatchSegment[] => {
  if (Array.isArray(match.segments) && match.segments.length) {
    const sorted = [...match.segments]
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, length)
      .map((segment) => ({ ...segment, scores: { ...(segment.scores ?? {}) } }));
    if (sorted.length >= length) {
      return sorted;
    }
    const legacy = buildSegments(
      { ...match, segments: [] },
      length,
      team1Id,
      team2Id,
    );
    return sorted.concat(legacy.slice(sorted.length));
  }
  const team1Points = legacyArray(match.team1Points, length);
  const team2Points = legacyArray(match.team2Points, length);
  const results = legacyArray(match.setResults, length);
  return Array.from({ length }, (_, index) => {
    const sequence = index + 1;
    const scores: Record<string, number> = {};
    if (team1Id) scores[team1Id] = team1Points[index] ?? 0;
    if (team2Id) scores[team2Id] = team2Points[index] ?? 0;
    const winnerEventTeamId = results[index] === 1 ? team1Id : results[index] === 2 ? team2Id : null;
    return {
      id: `${match.$id}_segment_${sequence}`,
      $id: `${match.$id}_segment_${sequence}`,
      eventId: match.eventId ?? null,
      matchId: match.$id,
      sequence,
      status: winnerEventTeamId ? 'COMPLETE' : team1Points[index] || team2Points[index] ? 'IN_PROGRESS' : 'NOT_STARTED',
      scores,
      winnerEventTeamId,
      metadata: null,
    };
  });
};

export default function ScoreUpdateModal({
  match,
  tournament,
  canManage,
  onSubmit,
  onScoreChange,
  onSetComplete,
  onMatchComplete,
  onClose,
  isOpen,
}: ScoreUpdateModalProps) {
  const [segments, setSegments] = useState<MatchSegment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFieldMap, setShowFieldMap] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [incidentType, setIncidentType] = useState('NOTE');
  const [incidentTeamId, setIncidentTeamId] = useState<string | null>(null);
  const [incidentParticipantId, setIncidentParticipantId] = useState<string | null>(null);
  const [incidentMinute, setIncidentMinute] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
  const [pendingPoint, setPendingPoint] = useState<{ teamId: string; delta: number } | null>(null);
  const [deletedIncidentIds, setDeletedIncidentIds] = useState<Set<string>>(() => new Set());
  const [optimisticIncidents, setOptimisticIncidents] = useState<MatchIncident[]>([]);
  const finalizedRef = useRef(false);
  const incidentRetryRef = useRef<MatchIncidentOperation[]>([]);
  const scoreSetSyncRef = useRef<Promise<unknown>>(Promise.resolve());

  const team1Id = match.team1Id ?? entityId(match.team1);
  const team2Id = match.team2Id ?? entityId(match.team2);
  const usesSets = typeof tournament.usesSets === 'boolean' ? tournament.usesSets : Boolean(tournament.leagueConfig?.usesSets);
  const isTimedMatch = !usesSets;
  const playoff = tournament.eventType === 'TOURNAMENT' || Boolean(match.losersBracket || match.winnerNextMatchId || match.loserNextMatchId);
  const pointTargets = playoff
    ? match.losersBracket ? tournament.loserBracketPointsToVictory : tournament.winnerBracketPointsToVictory
    : tournament.pointsToVictory;
  const fallbackSegmentCount = useMemo(() => {
    if (isTimedMatch) return 1;
    const fromTargets = Array.isArray(pointTargets) && pointTargets.length ? pointTargets.length : 1;
    if (playoff) return positiveInt(match.losersBracket ? tournament.loserSetCount : tournament.winnerSetCount, fromTargets);
    return positiveInt(tournament.setsPerMatch ?? tournament.leagueConfig?.setsPerMatch, fromTargets);
  }, [isTimedMatch, match.losersBracket, playoff, pointTargets, tournament.leagueConfig?.setsPerMatch, tournament.loserSetCount, tournament.setsPerMatch, tournament.winnerSetCount]);
  const rules = useMemo(() => activeRules(match, tournament, usesSets, fallbackSegmentCount), [fallbackSegmentCount, match, tournament, usesSets]);
  const totalSegments = Math.max(1, rules.segmentCount);
  const autoPointIncidents = tournament.autoCreatePointMatchIncidents === true;
  const scoringIncidentType = rules.autoCreatePointIncidentType ?? 'POINT';
  const scoringIncidentLabel = matchLogTypeLabel(scoringIncidentType);
  const scoringActionLabel = normalizedIncidentType(scoringIncidentType) === 'POINT' ? 'Point' : scoringIncidentLabel;
  const scoringRequiresParticipant = autoPointIncidents && rules.pointIncidentRequiresParticipant === true;
  const manualIncidentTypes = useMemo(() => (
    scoringRequiresParticipant
      ? rules.supportedIncidentTypes
      : rules.supportedIncidentTypes.filter((type) => !isScoringIncidentType(type, rules))
  ), [rules, scoringRequiresParticipant]);
  const defaultIncidentType = manualIncidentTypes.includes('NOTE')
    ? 'NOTE'
    : manualIncidentTypes[0] ?? scoringIncidentType;
  const activeSegment = segments[activeIndex] ?? segments[0];
  const team1Score = scoreForSegment(activeSegment, activeIndex, team1Id, match.team1Points);
  const team2Score = scoreForSegment(activeSegment, activeIndex, team2Id, match.team2Points);
  const matchSegmentSnapshot = useMemo(() => ({
    $id: match.$id,
    eventId: match.eventId,
    segments: match.segments,
    team1Points: match.team1Points,
    team2Points: match.team2Points,
    setResults: match.setResults,
  }) as Match, [match.$id, match.eventId, match.segments, match.setResults, match.team1Points, match.team2Points]);
  const persistedScoreDataAvailable = useMemo(
    () => hasPersistedScoreData(matchSegmentSnapshot, team1Id, team2Id),
    [matchSegmentSnapshot, team1Id, team2Id],
  );
  const useScoringIncidentsForScore = !scoringRequiresParticipant && !persistedScoreDataAvailable;
  const incidentRetryStorageKey = pendingIncidentStorageKey(tournament.$id ?? match.eventId, match.$id);
  const teamOptions = [
    ...(team1Id ? [{ value: team1Id, label: teamName(match.team1) }] : []),
    ...(team2Id ? [{ value: team2Id, label: teamName(match.team2) }] : []),
  ];
  const participantOptionsByTeam = useMemo(() => ({
    ...(team1Id ? { [team1Id]: buildParticipantOptions(match.team1 as Team | null | undefined, team1Id) } : {}),
    ...(team2Id ? { [team2Id]: buildParticipantOptions(match.team2 as Team | null | undefined, team2Id) } : {}),
  }), [match.team1, match.team2, team1Id, team2Id]);
  const participantOptions = useMemo(() => Object.values(participantOptionsByTeam).flat(), [participantOptionsByTeam]);
  const participantLabelsByRegistrationId = useMemo(() => (
    new Map(participantOptions
      .filter((option) => option.eventRegistrationId)
      .map((option) => [option.eventRegistrationId!, option.scoringLabel]))
  ), [participantOptions]);
  const participantLabelsByUserId = useMemo(() => (
    new Map(participantOptions.map((option) => [option.participantUserId, option.scoringLabel]))
  ), [participantOptions]);
  const activeParticipantOptions = incidentTeamId ? (participantOptionsByTeam[incidentTeamId] ?? []) : [];
  const selectedParticipant = incidentParticipantId
    ? activeParticipantOptions.find((option) => option.value === incidentParticipantId) ?? null
    : null;
  const allIncidents = useMemo(() => {
    const byId = new Map<string, MatchIncident>();
    [...(match.incidents ?? []), ...optimisticIncidents].forEach((incident) => {
      const incidentId = entityId(incident) ?? incident.id;
      if (!incidentId || deletedIncidentIds.has(incidentId)) return;
      byId.set(incidentId, incident);
    });
    return Array.from(byId.values()).sort((a, b) => a.sequence - b.sequence);
  }, [deletedIncidentIds, match.incidents, optimisticIncidents]);
  const incidentsForDisplay = useMemo(() => (
    allIncidents.filter((incident) => (
      scoringRequiresParticipant
      || useScoringIncidentsForScore
      || !isScoringIncidentType(incident.incidentType, rules)
    ))
  ), [allIncidents, rules, scoringRequiresParticipant, useScoringIncidentsForScore]);
  const officialUsersById = useMemo(() => {
    const map = new Map<string, Partial<UserData> & { id?: string; name?: string }>();
    ((tournament.officials ?? []) as Array<Partial<UserData> & { id?: string; name?: string }>).forEach((official) => {
      const id = userEntityId(official);
      if (id) map.set(id, official);
    });
    if (match.official) {
      const id = userEntityId(match.official);
      if (id) map.set(id, match.official);
    }
    return map;
  }, [match.official, tournament.officials]);
  const eventOfficialUserIdsById = useMemo(() => (
    new Map((tournament.eventOfficials ?? []).map((official) => [official.id, official.userId]))
  ), [tournament.eventOfficials]);
  const teamLabelForId = (eventTeamId?: string | null): string => (
    eventTeamId === team1Id ? teamName(match.team1) : eventTeamId === team2Id ? teamName(match.team2) : 'Match'
  );
  const participantLabelForIncident = (incident: { eventRegistrationId?: string | null; participantUserId?: string | null }): string | null => {
    if (incident.eventRegistrationId) {
      const label = participantLabelsByRegistrationId.get(incident.eventRegistrationId);
      if (label) return label;
    }
    return incident.participantUserId ? participantLabelsByUserId.get(incident.participantUserId) ?? null : null;
  };
  const scoringIncidentDescription = (incident: { eventTeamId?: string | null; eventRegistrationId?: string | null; participantUserId?: string | null; minute?: number | null }) => (
    [
      teamLabelForId(incident.eventTeamId),
      participantLabelForIncident(incident),
      typeof incident.minute === 'number' ? `${incident.minute}'` : null,
    ].filter(Boolean).join(' | ')
  );
  const officialPositionLabel = (assignment: { positionId?: string | null; slotIndex?: number | null }) => {
    const position = (tournament.officialPositions ?? []).find((item) => item.id === assignment.positionId);
    const base = position?.name?.trim() || 'Official';
    const slotIndex = Math.max(0, Number(assignment.slotIndex ?? 0));
    return position && positiveInt(position.count, 1) > 1 ? `${base} #${slotIndex + 1}` : base;
  };
  const officialNameLabel = (assignment: { userId?: string | null; eventOfficialId?: string | null }) => {
    const userId = assignment.userId || (assignment.eventOfficialId ? eventOfficialUserIdsById.get(assignment.eventOfficialId) : null);
    return userId ? userDisplayName(officialUsersById.get(userId)) ?? 'TBD' : 'TBD';
  };
  const parseIncidentMinute = () => {
    const trimmed = incidentMinute.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
  };
  const nextIncidentId = () => {
    const randomId = globalThis.crypto?.randomUUID?.();
    if (randomId) return randomId;
    return `${match.$id}_incident_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };
  const rememberIncidentRetry = (operation: MatchIncidentOperation) => {
    if (operation.action !== 'CREATE' || !operation.id) return;
    incidentRetryRef.current = [
      ...incidentRetryRef.current.filter((queued) => queued.id !== operation.id),
      { ...operation },
    ];
    writePendingIncidentRetries(incidentRetryStorageKey, incidentRetryRef.current);
  };
  const forgetIncidentRetries = (operations: MatchIncidentOperation[]) => {
    const ids = new Set(operations.map((operation) => operation.id).filter((id): id is string => Boolean(id)));
    if (!ids.size) return;
    incidentRetryRef.current = incidentRetryRef.current.filter((operation) => !operation.id || !ids.has(operation.id));
    writePendingIncidentRetries(incidentRetryStorageKey, incidentRetryRef.current);
  };
  const pendingIncidentRetries = () => incidentRetryRef.current.map((operation) => ({ ...operation }));

  useEffect(() => {
    finalizedRef.current = false;
    const persistedIncidentIds = new Set(
      (Array.isArray(match.incidents) ? match.incidents : [])
        .map((incident) => entityId(incident))
        .filter((id): id is string => Boolean(id)),
    );
    const queuedRetries = readPendingIncidentRetries(incidentRetryStorageKey)
      .filter((operation) => !persistedIncidentIds.has(operation.id ?? ''));
    incidentRetryRef.current = queuedRetries;
    writePendingIncidentRetries(incidentRetryStorageKey, queuedRetries);
    const persistedSegments = buildSegments(matchSegmentSnapshot, totalSegments, team1Id, team2Id);
    const incidentFallbackSegments = useScoringIncidentsForScore
      ? applyMatchIncidentDeltas(persistedSegments, match.incidents, rules)
      : persistedSegments;
    const next = applyPendingIncidentDeltas(incidentFallbackSegments, queuedRetries);
    setSegments(next);
    setActiveIndex(Math.max(0, next.findIndex((segment) => segment.status !== 'COMPLETE')));
    setDeletedIncidentIds(new Set());
    setOptimisticIncidents((current) => {
      const persistedIncidentIds = new Set(
        (match.incidents ?? [])
          .map((incident) => entityId(incident) ?? incident.id)
          .filter((id): id is string => Boolean(id)),
      );
      return current.filter((incident) => incident.matchId === match.$id && !persistedIncidentIds.has(entityId(incident) ?? incident.id));
    });
    setIncidentType(defaultIncidentType);
    setIncidentTeamId(team1Id ?? team2Id ?? null);
    setIncidentParticipantId((team1Id && participantOptionsByTeam[team1Id]?.[0]?.value) ?? (team2Id && participantOptionsByTeam[team2Id]?.[0]?.value) ?? null);
    setIncidentMinute('');
    setIncidentNote('');
  }, [defaultIncidentType, incidentRetryStorageKey, match.$id, match.incidents, matchSegmentSnapshot, participantOptionsByTeam, rules, team1Id, team2Id, totalSegments, useScoringIncidentsForScore]);

  useEffect(() => {
    if (!isOpen) {
      setShowFieldMap(false);
      setShowDetails(false);
      setPendingPoint(null);
    }
  }, [isOpen, match.$id]);

  useEffect(() => {
    const options = incidentTeamId ? (participantOptionsByTeam[incidentTeamId] ?? []) : [];
    if (!options.length) {
      setIncidentParticipantId(null);
      return;
    }
    if (!incidentParticipantId || !options.some((option) => option.value === incidentParticipantId)) {
      setIncidentParticipantId(options[0]?.value ?? null);
    }
  }, [incidentParticipantId, incidentTeamId, participantOptionsByTeam]);

  const legacyFromSegments = (source: MatchSegment[]) => {
    const team1Points = source.map((segment, index) => scoreForSegment(segment, index, team1Id, match.team1Points));
    const team2Points = source.map((segment, index) => scoreForSegment(segment, index, team2Id, match.team2Points));
    return {
      team1Points,
      team2Points,
      setResults: source.map((segment, index) => {
        if (segment.winnerEventTeamId === team1Id) return 1;
        if (segment.winnerEventTeamId === team2Id) return 2;
        if (segment.status === 'COMPLETE' && team1Points[index] !== team2Points[index]) {
          return team1Points[index] > team2Points[index] ? 1 : 2;
        }
        return 0;
      }),
    };
  };

  const payload = (source: MatchSegment[], extra: Partial<ScorePayload>): ScorePayload => ({
    matchId: match.$id,
    segments: source,
    ...legacyFromSegments(source),
    ...extra,
  });

  const emit = async (nextPayload: ScorePayload): Promise<boolean> => {
    try {
      await onScoreChange?.(nextPayload);
      return true;
    } catch (error) {
      console.warn('Match operation update failed:', error);
      return false;
    }
  };

  const applyScoreDelta = (
    source: MatchSegment[],
    eventTeamId: string | null,
    delta: number,
    segmentId?: string | null,
  ): MatchSegment[] => {
    if (!eventTeamId) return source;
    const targetSegmentId = segmentId ?? activeSegment?.id ?? activeSegment?.$id ?? null;
    return source.map((segment, index) => {
      const isTarget = targetSegmentId
        ? segment.id === targetSegmentId || segment.$id === targetSegmentId
        : index === activeIndex;
      if (!isTarget) return segment;
      const nextScore = Math.max(0, score(segment.scores?.[eventTeamId]) + delta);
      return {
        ...segment,
        status: nextScore > 0 && segment.status === 'NOT_STARTED' ? 'IN_PROGRESS' : segment.status,
        scores: { ...(segment.scores ?? {}), [eventTeamId]: nextScore },
      } satisfies MatchSegment;
    });
  };

  const updateScore = (eventTeamId: string | null, delta: number) => {
    if (!canManage || !activeSegment || !eventTeamId || activeSegment.status === 'COMPLETE') return;
    const next = applyScoreDelta(segments, eventTeamId, delta);
    const nextSegment = next.find((segment) => {
      const segmentId = segment.id ?? segment.$id;
      const activeSegmentId = activeSegment.id ?? activeSegment.$id;
      return (activeSegmentId && segmentId === activeSegmentId) || segment.sequence === activeSegment.sequence;
    });
    setSegments(next);
    const nextPayload = payload(next, {
      scoreSet: {
        segmentId: activeSegment.id,
        sequence: activeSegment.sequence,
        eventTeamId,
        points: score(nextSegment?.scores?.[eventTeamId]),
      },
    });
    scoreSetSyncRef.current = scoreSetSyncRef.current
      .catch(() => undefined)
      .then(() => emit(nextPayload));
  };

  const createScoringIncident = (
    eventTeamId: string | null,
    details: {
      participant?: MatchRosterParticipantOption | null;
      minute?: number | null;
      note?: string | null;
    } = {},
  ) => {
    if (!canManage || !activeSegment || !eventTeamId || activeSegment.status === 'COMPLETE') return;
    const next = applyScoreDelta(segments, eventTeamId, 1);
    setSegments(next);
    const incidentOperation: MatchIncidentOperation = {
      action: 'CREATE',
      id: nextIncidentId(),
      segmentId: activeSegment.id,
      eventTeamId,
      eventRegistrationId: details.participant?.eventRegistrationId ?? null,
      participantUserId: details.participant?.participantUserId ?? null,
      incidentType: scoringIncidentType,
      linkedPointDelta: 1,
      minute: details.minute ?? null,
      note: details.note?.trim() || null,
    };
    const optimisticIncident: MatchIncident = {
      id: incidentOperation.id!,
      eventId: tournament.$id ?? match.eventId ?? null,
      matchId: match.$id,
      segmentId: incidentOperation.segmentId ?? null,
      eventTeamId,
      eventRegistrationId: incidentOperation.eventRegistrationId ?? null,
      participantUserId: incidentOperation.participantUserId ?? null,
      officialUserId: null,
      incidentType: incidentOperation.incidentType ?? scoringIncidentType,
      sequence: allIncidents.length
        ? Math.max(...allIncidents.map((incident) => Number(incident.sequence) || 0)) + 1
        : 1,
      minute: incidentOperation.minute ?? null,
      clock: null,
      clockSeconds: null,
      linkedPointDelta: 1,
      note: incidentOperation.note ?? null,
      metadata: null,
    };
    setOptimisticIncidents((current) => [
      ...current.filter((incident) => (entityId(incident) ?? incident.id) !== optimisticIncident.id),
      optimisticIncident,
    ]);
    rememberIncidentRetry(incidentOperation);
    void emit(payload(next, {
      incidentOperations: [incidentOperation],
    })).then((success) => {
      if (success) forgetIncidentRetries([incidentOperation]);
    });
  };

  const removeQueuedScoringIncident = (eventTeamId: string): boolean => {
    const activeSegmentId = activeSegment?.id ?? activeSegment?.$id ?? null;
    let retryIndex = -1;
    for (let index = incidentRetryRef.current.length - 1; index >= 0; index -= 1) {
      const operation = incidentRetryRef.current[index];
      if (
        operation.action === 'CREATE'
        && operation.eventTeamId === eventTeamId
        && operation.segmentId === activeSegmentId
        && isScoringIncidentType(operation.incidentType, rules)
        && score(operation.linkedPointDelta) > 0
      ) {
        retryIndex = index;
        break;
      }
    }
    if (retryIndex < 0) return false;
    const [operation] = incidentRetryRef.current.splice(retryIndex, 1);
    writePendingIncidentRetries(incidentRetryStorageKey, incidentRetryRef.current);
    const next = applyScoreDelta(segments, eventTeamId, -score(operation.linkedPointDelta));
    setSegments(next);
    if (operation.id) {
      setDeletedIncidentIds((current) => new Set(current).add(operation.id!));
      setOptimisticIncidents((current) => current.filter((incident) => (entityId(incident) ?? incident.id) !== operation.id));
    }
    return true;
  };

  const removeIncident = (incident: MatchIncident) => {
    if (!canManage) return;
    const incidentId = entityId(incident) ?? incident.id;
    if (!incidentId) return;
    const linkedDelta = score(incident.linkedPointDelta);
    const shouldAdjustScore = isScoringIncidentType(incident.incidentType, rules) && Boolean(incident.eventTeamId) && linkedDelta > 0;
    const previousSegments = segments;
    const next = shouldAdjustScore
      ? applyScoreDelta(segments, incident.eventTeamId ?? null, -linkedDelta, incident.segmentId)
      : segments;
    const removedOptimisticIncidents = optimisticIncidents.filter((entry) => (entityId(entry) ?? entry.id) === incidentId);
    if (shouldAdjustScore) setSegments(next);
    setDeletedIncidentIds((current) => new Set(current).add(incidentId));
    setOptimisticIncidents((current) => current.filter((entry) => (entityId(entry) ?? entry.id) !== incidentId));
    const incidentOperation: MatchIncidentOperation = { action: 'DELETE', id: incidentId };
    void emit(payload(next, {
      incidentOperations: [incidentOperation],
    })).then((success) => {
      if (success) return;
      if (shouldAdjustScore) setSegments(previousSegments);
      setDeletedIncidentIds((current) => {
        const restored = new Set(current);
        restored.delete(incidentId);
        return restored;
      });
      if (removedOptimisticIncidents.length) {
        setOptimisticIncidents((current) => [...current, ...removedOptimisticIncidents]);
      }
    });
  };

  const removeLatestScoringIncident = (eventTeamId: string | null) => {
    if (!canManage || !activeSegment || !eventTeamId || activeSegment.status === 'COMPLETE') return;
    if (removeQueuedScoringIncident(eventTeamId)) return;
    const activeSegmentId = activeSegment.id ?? activeSegment.$id ?? null;
    const incident = [...allIncidents].reverse().find((entry) => (
      entry.eventTeamId === eventTeamId
      && entry.segmentId === activeSegmentId
      && isScoringIncidentType(entry.incidentType, rules)
      && score(entry.linkedPointDelta) > 0
    ));
    if (incident) removeIncident(incident);
  };

  const requestScore = (eventTeamId: string | null, delta: number) => {
    if (!eventTeamId) return;
    if (autoPointIncidents) {
      if (delta > 0 && scoringRequiresParticipant) {
        setPendingPoint({ teamId: eventTeamId, delta });
        setIncidentType(scoringIncidentType);
        setIncidentTeamId(eventTeamId);
        setIncidentParticipantId(participantOptionsByTeam[eventTeamId]?.[0]?.value ?? null);
        setIncidentMinute('');
        setIncidentNote('');
        return;
      }
      updateScore(eventTeamId, delta);
      return;
    }
    updateScore(eventTeamId, delta);
  };

  const targetForActive = (): number | null => {
    if (!Array.isArray(pointTargets) || !pointTargets.length) return null;
    return Number(pointTargets[activeIndex] ?? pointTargets[pointTargets.length - 1]) || null;
  };

  const setWinConditionMet = () => {
    const target = targetForActive();
    if (!target) return false;
    const leader = Math.max(team1Score, team2Score);
    return leader >= target && Math.abs(team1Score - team2Score) >= 2;
  };

  const matchComplete = (source = segments) => {
    if (!team1Id || !team2Id) return false;
    if (rules.scoringModel === 'SETS') {
      const needed = Math.ceil((rules.segmentCount || source.length || 1) / 2);
      const t1 = source.filter((segment) => segment.winnerEventTeamId === team1Id).length;
      const t2 = source.filter((segment) => segment.winnerEventTeamId === team2Id).length;
      return t1 >= needed || t2 >= needed;
    }
    return source.every((segment) => segment.status === 'COMPLETE');
  };

  const confirmSegment = async () => {
    if (!activeSegment || !team1Id || !team2Id) return;
    if (rules.scoringModel === 'SETS' && !setWinConditionMet()) {
      alert('A team must reach the target points and win by 2 to confirm this segment.');
      return;
    }
    const winnerEventTeamId = team1Score > team2Score ? team1Id : team2Score > team1Score ? team2Id : null;
    const endedAt = new Date().toISOString();
    const next = segments.map((segment, index) => (
      index === activeIndex ? { ...segment, status: 'COMPLETE', winnerEventTeamId, endedAt } satisfies MatchSegment : segment
    ));
    const retryIncidentOperations = pendingIncidentRetries();
    const nextPayload = payload(next, {
      segmentOperations: [{
        id: activeSegment.id,
        sequence: activeSegment.sequence,
        status: 'COMPLETE',
        scores: activeSegment.scores,
        winnerEventTeamId,
        endedAt,
      }],
      ...(retryIncidentOperations.length ? { incidentOperations: retryIncidentOperations } : {}),
    });
    try {
      if (onSetComplete) await onSetComplete(nextPayload);
      else if (!(await emit(nextPayload))) return;
      forgetIncidentRetries(retryIncidentOperations);
    } catch (error) {
      console.error('Failed to persist segment result:', error);
      alert('Failed to save segment result. Please retry.');
      return;
    }
    setSegments(next);
    const nextOpen = next.findIndex((segment) => segment.status !== 'COMPLETE');
    if (nextOpen >= 0) setActiveIndex(nextOpen);
    if (onMatchComplete && !finalizedRef.current && matchComplete(next)) {
      await onMatchComplete({ ...nextPayload, eventId: tournament.$id });
      finalizedRef.current = true;
    }
  };

  const saveMatch = async () => {
    setLoading(true);
    const endedAt = new Date().toISOString();
    const next = isTimedMatch
      ? segments.map((segment, index) => {
          if (index !== 0 || !team1Id || !team2Id) return segment;
          return {
            ...segment,
            status: 'COMPLETE',
            endedAt,
            winnerEventTeamId: team1Score > team2Score ? team1Id : team2Score > team1Score ? team2Id : null,
          } satisfies MatchSegment;
        })
      : segments;
    const retryIncidentOperations = pendingIncidentRetries();
    const nextPayload = payload(next, {
      segmentOperations: next.map((segment) => ({
        id: segment.id,
        sequence: segment.sequence,
        status: segment.status,
        scores: segment.scores,
        winnerEventTeamId: segment.winnerEventTeamId ?? null,
        endedAt: segment.endedAt ?? (segment.status === 'COMPLETE' ? endedAt : null),
      })),
      ...(retryIncidentOperations.length ? { incidentOperations: retryIncidentOperations } : {}),
    });
    try {
      if (onScoreChange) await onScoreChange(nextPayload);
      else if (onSubmit) await onSubmit(match.$id, nextPayload.team1Points, nextPayload.team2Points, nextPayload.setResults);
      forgetIncidentRetries(retryIncidentOperations);
      if (onMatchComplete && !finalizedRef.current && matchComplete(next)) {
        await onMatchComplete({ ...nextPayload, eventId: tournament.$id });
        finalizedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to update match:', error);
      alert('Failed to update match. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addIncident = () => {
    if (!activeSegment) return;
    const isScoring = isScoringIncidentType(incidentType, rules);
    const next = isScoring && incidentTeamId
      ? applyScoreDelta(segments, incidentTeamId, 1)
      : segments;
    const incidentOperation: MatchIncidentOperation = {
      action: 'CREATE',
      id: nextIncidentId(),
      segmentId: activeSegment.id,
      eventTeamId: incidentTeamId,
      eventRegistrationId: selectedParticipant?.eventRegistrationId ?? null,
      participantUserId: selectedParticipant?.participantUserId ?? null,
      incidentType,
      minute: parseIncidentMinute(),
      linkedPointDelta: isScoring ? 1 : null,
      note: incidentNote.trim() || null,
    };
    if (isScoring) setSegments(next);
    rememberIncidentRetry(incidentOperation);
    void emit(payload(next, {
      incidentOperations: [incidentOperation],
    })).then((success) => {
      if (success) forgetIncidentRetries([incidentOperation]);
    });
    setIncidentMinute('');
    setIncidentNote('');
  };

  const checkIn = (assignment: any) => {
    void emit(payload(segments, {
      officialCheckIn: {
        positionId: assignment.positionId,
        slotIndex: assignment.slotIndex,
        userId: assignment.userId,
        checkedIn: true,
      },
    }));
  };

  const fieldLat = typeof match.field?.lat === 'number' ? match.field.lat : null;
  const fieldLng = typeof match.field?.long === 'number' ? match.field.long : null;
  const eventLat = Array.isArray(tournament.coordinates) && typeof tournament.coordinates[0] === 'number' ? tournament.coordinates[0] : null;
  const eventLng = Array.isArray(tournament.coordinates) && typeof tournament.coordinates[1] === 'number' ? tournament.coordinates[1] : null;
  const mapLat = Number.isFinite(fieldLat) ? fieldLat : eventLat;
  const mapLng = Number.isFinite(fieldLng) ? fieldLng : eventLng;
  const locationLabel = match.field?.location?.trim() || match.field?.name?.trim() || tournament.location?.trim() || '';
  const mapQuery = Number.isFinite(mapLat) && Number.isFinite(mapLng) ? `${mapLat},${mapLng}` : locationLabel;
  const mapEmbedSrc = mapQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=14&output=embed` : null;
  const googleMapsLink = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;
  const canScore = canManage && activeSegment?.status !== 'COMPLETE' && !matchComplete();

  return (
    <Modal opened={isOpen} onClose={onClose} title={<Text fw={600}>Match Operations</Text>} centered size="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text c="dimmed" size="sm">Match {match.matchId ?? match.$id}</Text>
            <Text fw={700}>{teamName(match.team1)} vs {teamName(match.team2)}</Text>
            <Text c="dimmed" size="sm">{rulesSummary(rules)}</Text>
          </div>
          <Badge color={match.status === 'COMPLETE' ? 'green' : match.status === 'IN_PROGRESS' ? 'blue' : 'gray'}>
            {titleCaseValue(match.status)}
          </Badge>
        </Group>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" align="center">
            <div>
              <Text c="dimmed" size="sm">Field</Text>
              <Text fw={600}>{locationLabel || 'Field location'}</Text>
            </div>
            <Group gap="xs">
              <Button variant="light" size="xs" disabled={!mapEmbedSrc} onClick={() => setShowFieldMap((value) => !value)}>
                {showFieldMap ? 'Hide Field Location' : 'View Field Location'}
              </Button>
              <Button variant={showDetails ? 'filled' : 'light'} size="xs" onClick={() => setShowDetails((value) => !value)}>
                Match Details
              </Button>
              {googleMapsLink && (
                <Button component="a" href={googleMapsLink} target="_blank" rel="noreferrer" variant="subtle" size="xs">
                  Open in Maps
                </Button>
              )}
            </Group>
          </Group>
          {showFieldMap && mapEmbedSrc && (
            <div className="overflow-hidden rounded-md border border-gray-200 mt-3" style={{ aspectRatio: '16 / 9' }}>
              <iframe title="Match field location preview" src={mapEmbedSrc} className="w-full h-full" loading="lazy" allowFullScreen />
            </div>
          )}
        </Paper>

        {showDetails && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="md">
              <Group grow align="flex-start">
                <div>
                  <Text c="dimmed" size="sm">Lifecycle</Text>
                  <Text fw={600}>{titleCaseValue(match.resultStatus ?? 'Pending')}</Text>
                  <Text size="sm">{match.statusReason || 'No status reason'}</Text>
                </div>
                <div>
                  <Text c="dimmed" size="sm">Actual Times</Text>
                  <Text size="sm">Start: {dateLabel(match.actualStart)}</Text>
                  <Text size="sm">End: {dateLabel(match.actualEnd)}</Text>
                </div>
              </Group>

              <Table withRowBorders>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Th>{rules.segmentLabel}</Table.Th>
                    {segments.map((segment, index) => (
                      <Table.Th
                        key={`segment-label-${segment.id}`}
                        style={index === activeIndex ? { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-filled)' } : undefined}
                      >
                        {labelForSegment(rules, segment.sequence)}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Home</Table.Th>
                    {segments.map((segment, index) => (
                      <Table.Td
                        key={`segment-home-${segment.id}`}
                        style={index === activeIndex ? { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-filled)' } : undefined}
                      >
                        {scoreForSegment(segment, index, team1Id, match.team1Points)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Away</Table.Th>
                    {segments.map((segment, index) => (
                      <Table.Td
                        key={`segment-away-${segment.id}`}
                        style={index === activeIndex ? { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-filled)' } : undefined}
                      >
                        {scoreForSegment(segment, index, team2Id, match.team2Points)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                </Table.Tbody>
              </Table>

              <Stack gap="xs">
                <Text c="dimmed" size="sm">Officials</Text>
                {(match.officialIds ?? []).length ? (match.officialIds ?? []).map((assignment, index) => (
                  <Group key={`${assignment.positionId}:${assignment.slotIndex}:${index}`} justify="space-between">
                    <Text size="sm">
                      {officialPositionLabel(assignment)}: {officialNameLabel(assignment)}
                      {assignment.checkedIn ? ' (checked in)' : ''}
                    </Text>
                    <Group gap="xs">
                      <Badge color={assignment.checkedIn ? 'green' : 'gray'}>{assignment.checkedIn ? 'Checked in' : 'Not checked in'}</Badge>
                      {canManage && !assignment.checkedIn && <Button size="xs" variant="light" onClick={() => checkIn(assignment)}>Check in</Button>}
                    </Group>
                  </Group>
                )) : <Text size="sm">No official slots assigned.</Text>}
              </Stack>

              <Stack gap="xs">
                <Text c="dimmed" size="sm">Match Log</Text>
                {incidentsForDisplay.length ? incidentsForDisplay.map((incident) => (
                  <Paper key={incident.id} withBorder p="sm" radius="sm" style={{ position: 'relative' }}>
                    {canManage && (
                      <ActionIcon
                        aria-label={`Remove ${isScoringIncidentType(incident.incidentType, rules) ? scoringIncidentLabel : matchLogTypeLabel(incident.incidentType)}`}
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => removeIncident(incident)}
                        style={{ position: 'absolute', right: 8, top: 8 }}
                      >
                        -
                      </ActionIcon>
                    )}
                    <div style={{ paddingRight: canManage ? 32 : 0 }}>
                      {isScoringIncidentType(incident.incidentType, rules) ? (
                        <Text fw={600} size="sm">{scoringIncidentDescription(incident)}</Text>
                      ) : (
                        <>
                          <Text fw={600} size="sm">{matchLogTypeLabel(incident.incidentType)}</Text>
                          <Text size="sm" c="dimmed">
                            {[teamLabelForId(incident.eventTeamId), typeof incident.minute === 'number' ? `${incident.minute}'` : null].filter(Boolean).join(' | ')}
                          </Text>
                        </>
                      )}
                      {!isScoringIncidentType(incident.incidentType, rules) && incident.note && <Text size="sm">{incident.note}</Text>}
                    </div>
                  </Paper>
                )) : <Text size="sm">No match details recorded.</Text>}
              </Stack>

              {canManage && manualIncidentTypes.length > 0 && (
                <Stack gap="xs">
                  <Group grow>
                    <Select label="Log type" data={manualIncidentTypes.map((type) => ({ value: type, label: matchLogTypeLabel(type) }))} value={incidentType} onChange={(value) => setIncidentType(value ?? defaultIncidentType)} />
                    <Select label="Team" data={teamOptions} value={incidentTeamId} onChange={setIncidentTeamId} clearable />
                  </Group>
                  <Group grow>
                    <Select
                      label={rules.pointIncidentRequiresParticipant && isScoringIncidentType(incidentType, rules) ? 'Player' : 'Player (optional)'}
                      data={activeParticipantOptions.map((option) => ({ value: option.value, label: option.label }))}
                      value={incidentParticipantId}
                      onChange={setIncidentParticipantId}
                      clearable={!(rules.pointIncidentRequiresParticipant && isScoringIncidentType(incidentType, rules))}
                      disabled={!incidentTeamId || activeParticipantOptions.length === 0}
                    />
                    <TextInput
                      label="Minute"
                      placeholder="Optional"
                      inputMode="numeric"
                      value={incidentMinute}
                      onChange={(event) => setIncidentMinute(event.currentTarget.value)}
                    />
                  </Group>
                  <Textarea label="Details" placeholder="Time, player, penalty, or note" value={incidentNote} onChange={(event) => setIncidentNote(event.currentTarget.value)} minRows={2} />
                  <Group justify="flex-end">
                    <Button
                      variant="light"
                      onClick={addIncident}
                      disabled={rules.pointIncidentRequiresParticipant && isScoringIncidentType(incidentType, rules) && !selectedParticipant}
                    >
                      Add to Match Log
                    </Button>
                  </Group>
                </Stack>
              )}
            </Stack>
          </Paper>
        )}

        <Group gap="xs">
          {segments.map((segment, index) => (
            <Button key={`tab-${segment.id}`} size="xs" variant={index === activeIndex ? 'filled' : 'light'} onClick={() => setActiveIndex(index)}>
              {labelForSegment(rules, segment.sequence)}
            </Button>
          ))}
        </Group>

        {pendingPoint && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="xs">
              <Text fw={600}>Record {scoringActionLabel}</Text>
              <Select
                label="Log type"
                data={[{ value: scoringIncidentType, label: scoringActionLabel }]}
                value={scoringIncidentType}
                onChange={() => undefined}
                disabled
              />
              <Select
                label={rules.pointIncidentRequiresParticipant ? 'Player' : 'Player (optional)'}
                data={activeParticipantOptions.map((option) => ({ value: option.value, label: option.label }))}
                value={incidentParticipantId}
                onChange={setIncidentParticipantId}
                clearable={!rules.pointIncidentRequiresParticipant}
                disabled={activeParticipantOptions.length === 0}
              />
              <TextInput
                label="Minute"
                placeholder="Optional"
                inputMode="numeric"
                value={incidentMinute}
                onChange={(event) => setIncidentMinute(event.currentTarget.value)}
              />
              <Textarea label="Details" placeholder="Time, player, or note" value={incidentNote} onChange={(event) => setIncidentNote(event.currentTarget.value)} minRows={2} />
              <Group justify="flex-end">
                <Button variant="default" onClick={() => { setPendingPoint(null); setIncidentMinute(''); setIncidentNote(''); }}>Cancel</Button>
                <Button
                  onClick={() => {
                    createScoringIncident(pendingPoint.teamId, {
                      participant: selectedParticipant,
                      minute: parseIncidentMinute(),
                      note: incidentNote,
                    });
                    setPendingPoint(null);
                    setIncidentMinute('');
                    setIncidentNote('');
                  }}
                  disabled={rules.pointIncidentRequiresParticipant && !selectedParticipant}
                >
                  Save {scoringActionLabel}
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        <Group grow align="stretch">
          {[{ team: match.team1, teamId: team1Id, current: team1Score }, { team: match.team2, teamId: team2Id, current: team2Score }].map(({ team, teamId, current }, index) => {
            const displayName = teamName(team);

            return (
              <Paper key={teamId ?? index} withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm" wrap="nowrap" align="center">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: '1 1 0' }}>
                    {team && <Avatar src={getTeamAvatarUrl(team, 40)} radius="xl" size={40} alt={displayName} />}
                    <Text
                      fw={600}
                      title={displayName}
                      style={{
                        minWidth: 0,
                        flex: '1 1 auto',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {displayName}
                    </Text>
                  </Group>
                  {canScore && !scoringRequiresParticipant && (
                    <Group gap="xs" wrap="nowrap" style={{ flex: '0 0 auto' }}>
                      <ActionIcon variant="light" color="red" onClick={() => requestScore(teamId, -1)} disabled={current === 0}>-</ActionIcon>
                      <ActionIcon variant="light" color="green" onClick={() => requestScore(teamId, 1)}>+</ActionIcon>
                    </Group>
                  )}
                </Group>
                <Text ta="center" fw={700} size="xl">{current}</Text>
                {canScore && scoringRequiresParticipant && teamId && (
                  <Group justify="center" mt="xs">
                    <Button size="xs" onClick={() => requestScore(teamId, 1)}>
                      Add {scoringActionLabel}
                    </Button>
                  </Group>
                )}
                <Group justify="center" gap="xs" mt={6}>
                  {segments.map((segment, segmentIndex) => (
                    <Text key={`${teamId}-${segment.id}`} size="sm" className={`${segmentIndex === activeIndex ? 'bg-blue-100 text-blue-800' : segment.winnerEventTeamId === teamId ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} px-2 py-1 rounded`}>
                      {scoreForSegment(segment, segmentIndex, teamId, teamId === team1Id ? match.team1Points : match.team2Points)}
                    </Text>
                  ))}
                </Group>
              </Paper>
            );
          })}
        </Group>

        <Group justify="space-between">
          <Button variant="default" onClick={onClose}>Close</Button>
          <Group>
            {canManage && activeSegment?.status !== 'COMPLETE' && (!isTimedMatch || rules.scoringModel !== 'POINTS_ONLY') && (
              <Button onClick={confirmSegment} disabled={rules.scoringModel === 'SETS' && !setWinConditionMet()}>
                Confirm {labelForSegment(rules, activeSegment?.sequence ?? 1)}
              </Button>
            )}
            {canManage && <Button onClick={saveMatch} loading={loading} disabled={!isTimedMatch && rules.scoringModel === 'SETS' && !matchComplete()}>Save Match</Button>}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
