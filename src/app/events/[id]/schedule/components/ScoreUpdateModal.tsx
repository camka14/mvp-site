'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  ListChecks,
  MapPin,
  ShieldCheck,
  SquarePen,
  Table2,
  Timer,
  X,
} from 'lucide-react';
import { canIncreaseSetScore, getSetScoreState, resolveSetVictoryTarget } from '@/lib/matchSetScoring';
import {
  Division,
  Event,
  getTeamAvatarUrl,
  Match,
  MatchIncident,
  MatchIncidentTypeDefinition,
  MatchIncidentOperation,
  MatchLifecycleOperation,
  MatchOfficialCheckInOperation,
  MatchSegment,
  MatchSegmentOperation,
  ResolvedMatchTimekeepingConfig,
  ResolvedMatchRules,
  Team,
  TeamPlayerRegistration,
  UserData,
} from '@/types';

export type ScorePayload = {
  matchId: string;
  segments: MatchSegment[];
  finalize?: boolean;
  directScoreVersion?: number;
  scoreSet?: {
    segmentId?: string | null;
    sequence: number;
    eventTeamId: string;
    points: number;
  };
  segmentOperations?: MatchSegmentOperation[];
  incidentOperations?: MatchIncidentOperation[];
  lifecycle?: MatchLifecycleOperation;
  officialCheckIn?: MatchOfficialCheckInOperation;
  team1Points: number[];
  team2Points: number[];
  setResults: number[];
  time?: string;
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
  participantTeams?: Team[];
  canManage: boolean;
  onSubmit?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
  onScoreChange?: (payload: ScorePayload) => Promise<void> | void;
  onSetComplete?: (payload: ScorePayload) => Promise<void>;
  onMatchComplete?: (payload: ScorePayload & { eventId: string }) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
  team1Placeholder?: string;
  team2Placeholder?: string;
  embedded?: boolean;
  defaultShowDetails?: boolean;
  hideStatusControls?: boolean;
}

type PendingDirectScoreSync = {
  editVersion: number;
  segmentId?: string | null;
  sequence: number;
  eventTeamId: string;
  points: number;
  scoreSetAvailable: boolean;
};

type DivisionWithRuleConfig = Division & {
  leagueConfig?: {
    setsPerMatch?: number | null;
    pointsToVictory?: number[] | null;
    usesSets?: boolean | null;
  } | null;
};

const entityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as { $id?: unknown; id?: unknown };
  const raw = typeof row.$id === 'string' ? row.$id : typeof row.id === 'string' ? row.id : '';
  return raw.trim() || null;
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

const MATCH_TIME_PICKER_PROPS = {
  format: '12h' as const,
  withDropdown: false,
  amPmLabels: { am: 'AM', pm: 'PM' },
};
const MATCH_LOG_VISIBLE_ITEM_COUNT = 5;
const MATCH_LOG_ITEM_HEIGHT_PX = 92;
const MATCH_LOG_ITEM_GAP_PX = 8;
const MATCH_LOG_LIST_MAX_HEIGHT =
  MATCH_LOG_VISIBLE_ITEM_COUNT * MATCH_LOG_ITEM_HEIGHT_PX
  + (MATCH_LOG_VISIBLE_ITEM_COUNT - 1) * MATCH_LOG_ITEM_GAP_PX;

const coerceActualDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const positiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const positiveIntOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const divisionId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeToken(value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as { id?: unknown; $id?: unknown; key?: unknown };
  return normalizeToken(row.id) ?? normalizeToken(row.$id) ?? normalizeToken(row.key);
};

const divisionKey = (value: unknown): string | null => {
  const id = divisionId(value);
  return id ? id.toLowerCase() : null;
};

const pointsList = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value
    .map((entry) => positiveIntOrNull(entry))
    .filter((entry): entry is number => entry !== null);
  return normalized.length ? normalized : null;
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

const resolvedTeamName = (team: any): string | null => {
  const name = teamName(team);
  return name === 'TBD' ? null : name;
};

const matchRefId = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const bracketPlaceholder = (
  match: Match,
  previousMatch?: Match | null,
  slot?: 'team1' | 'team2',
): string => {
  if (!previousMatch || typeof previousMatch.matchId !== 'number') {
    return 'TBD';
  }

  const currentMatchId = matchRefId(match.$id);
  const winnerNextId = matchRefId(previousMatch.winnerNextMatchId);
  const loserNextId = matchRefId(previousMatch.loserNextMatchId);

  let prefix: 'Winner' | 'Loser';
  if (currentMatchId.length > 0) {
    const winnerFeedsCurrent = winnerNextId === currentMatchId;
    const loserFeedsCurrent = loserNextId === currentMatchId;
    if (winnerFeedsCurrent && loserFeedsCurrent) {
      prefix = slot === 'team2' ? 'Loser' : 'Winner';
    } else if (loserFeedsCurrent) {
      prefix = 'Loser';
    } else if (winnerFeedsCurrent) {
      prefix = 'Winner';
    } else {
      const isCrossBracketLoser = Boolean(match.losersBracket && previousMatch.losersBracket === false);
      prefix = isCrossBracketLoser ? 'Loser' : 'Winner';
    }
  } else {
    const isCrossBracketLoser = Boolean(match.losersBracket && previousMatch.losersBracket === false);
    prefix = isCrossBracketLoser ? 'Loser' : 'Winner';
  }

  return `${prefix} of match #${previousMatch.matchId}`;
};

const bracketTeamLabel = (
  match: Match,
  team: Match['team1'],
  previousMatch?: Match | null,
  placeholder?: string,
  slot?: 'team1' | 'team2',
): string => {
  const explicitName = resolvedTeamName(team);
  if (explicitName) {
    return explicitName;
  }
  const mappedPlaceholder = placeholder?.trim();
  if (mappedPlaceholder) {
    return mappedPlaceholder;
  }
  if (!previousMatch && slot) {
    const siblingPreviousMatch = slot === 'team1'
      ? match.previousRightMatch
      : match.previousLeftMatch;
    if (siblingPreviousMatch && typeof siblingPreviousMatch.matchId === 'number') {
      const currentMatchId = matchRefId(match.$id);
      const siblingWinnerNextId = matchRefId(siblingPreviousMatch.winnerNextMatchId);
      const siblingLoserNextId = matchRefId(siblingPreviousMatch.loserNextMatchId);
      const siblingFeedsBothOutcomes = currentMatchId.length > 0
        && siblingWinnerNextId === currentMatchId
        && siblingLoserNextId === currentMatchId;
      if (siblingFeedsBothOutcomes) {
        return `${slot === 'team2' ? 'Loser' : 'Winner'} of match #${siblingPreviousMatch.matchId}`;
      }
    }
  }
  return bracketPlaceholder(match, previousMatch, slot);
};

const teamPlayers = (team: Team | null | undefined) => (
  Array.isArray(team?.players) ? team.players : []
);

const teamPlayerRegistrations = (team: Team | null | undefined) => (
  Array.isArray(team?.playerRegistrations) ? team.playerRegistrations : []
);

const mergeTeamRosterData = (existing: Team | undefined, next: Team): Team => {
  if (!existing) return next;
  const existingPlayers = teamPlayers(existing);
  const nextPlayers = teamPlayers(next);
  const existingRegistrations = teamPlayerRegistrations(existing);
  const nextRegistrations = teamPlayerRegistrations(next);
  const existingPlayerIds = Array.isArray(existing.playerIds) ? existing.playerIds : [];
  const nextPlayerIds = Array.isArray(next.playerIds) ? next.playerIds : [];

  return {
    ...existing,
    ...next,
    players: nextPlayers.length ? nextPlayers : existingPlayers,
    playerRegistrations: nextRegistrations.length ? nextRegistrations : existingRegistrations,
    playerIds: nextPlayerIds.length ? nextPlayerIds : existingPlayerIds,
  };
};

const participantLabel = (
  player?: UserData | null,
  registration?: TeamPlayerRegistration | null,
): string => {
  const fullName = userDisplayName(player) ?? 'Participant';
  const details = [registration?.jerseyNumber ? `#${registration.jerseyNumber}` : null, registration?.position ?? null]
    .filter(Boolean)
    .join(' ');
  return details ? `${fullName} (${details})` : fullName;
};

const scoringParticipantLabel = (
  player?: UserData | null,
  registration?: TeamPlayerRegistration | null,
): string => {
  const fullName = userDisplayName(player) ?? 'Player';
  return registration?.jerseyNumber ? `${fullName} #${registration.jerseyNumber}` : fullName;
};

const buildParticipantOptions = (team: Team | null | undefined, eventTeamId: string | null): MatchRosterParticipantOption[] => {
  const playersById = new Map(teamPlayers(team)
    .map((player) => {
      const id = entityId(player);
      return id ? [id, player] as const : null;
    })
    .filter((entry): entry is readonly [string, UserData] => Boolean(entry)));
  const registrations = teamPlayerRegistrations(team)
    .filter((registration) => {
      const status = String(registration.status ?? '').trim().toUpperCase();
      const registrantType = String(registration.registrantType ?? '').trim().toUpperCase();
      const rosterRole = String(registration.rosterRole ?? 'PARTICIPANT').trim().toUpperCase();
      return ['ACTIVE', 'STARTED'].includes(status)
        && rosterRole === 'PARTICIPANT'
        && registrantType !== 'TEAM'
        && registration.userId !== eventTeamId;
    });
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
  return teamPlayers(team).reduce<MatchRosterParticipantOption[]>((options, player) => {
    const id = entityId(player);
    if (id) {
      options.push({
        value: id,
        label: participantLabel(player, null),
        scoringLabel: scoringParticipantLabel(player, null),
        participantUserId: id,
        eventRegistrationId: null,
        eventTeamId,
      });
    }
    return options;
  }, []);
};

const dateLabel = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatClockSeconds = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatClockSecondsAsMinutes = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatIncidentClock = (seconds: number): string => formatClockSeconds(seconds);

const durationSecondsForSegmentSequence = (rules: ResolvedMatchRules, sequence: number): number | null => {
  const durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence[sequence - 1]
    ?? rules.timekeeping.segmentDurationMinutes;
  return durationMinutes && durationMinutes > 0 ? durationMinutes * 60 : null;
};

const regulationOffsetSecondsForSegment = (segment: MatchSegment | undefined, rules: ResolvedMatchRules): number => {
  if (!segment || !rules.timekeeping.addedTimeEnabled) return 0;
  const sequence = Math.max(1, Math.trunc(Number(segment.sequence) || 1));
  let offsetSeconds = 0;
  for (let index = 1; index < sequence; index += 1) {
    offsetSeconds += durationSecondsForSegmentSequence(rules, index) ?? 0;
  }
  return offsetSeconds;
};

const formatAddedTimeIncidentClock = (regulationEndSeconds: number, addedSeconds: number): string => {
  const regulationMinute = Math.max(0, Math.trunc(regulationEndSeconds / 60));
  const addedMinute = Math.max(1, Math.ceil(Math.max(1, addedSeconds) / 60));
  return `${regulationMinute}+${addedMinute}`;
};

const parseIncidentClockInput = (
  value: string,
  options: { allowAddedTimeNotation: boolean },
): { minute: number; clock: string | null; clockSeconds: number } | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const addedTimeMatch = trimmed.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (addedTimeMatch && options.allowAddedTimeNotation) {
    const regulationMinute = Number(addedTimeMatch[1]);
    const addedMinute = Number(addedTimeMatch[2]);
    if (
      Number.isInteger(regulationMinute)
      && regulationMinute >= 0
      && Number.isInteger(addedMinute)
      && addedMinute > 0
    ) {
      const minute = regulationMinute + addedMinute;
      return {
        minute,
        clock: `${regulationMinute}+${addedMinute}`,
        clockSeconds: minute * 60,
      };
    }
    return null;
  }
  if (addedTimeMatch) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const minute = Math.trunc(parsed);
  return {
    minute,
    clock: null,
    clockSeconds: minute * 60,
  };
};

const incidentInputValue = (incident: { minute?: number | null; clock?: string | null }): string => {
  const clock = normalizeToken(incident.clock);
  if (clock && /^\d+\+\d+$/.test(clock)) return clock;
  return typeof incident.minute === 'number' ? String(incident.minute) : '';
};

const incidentInputValueFromClock = (clockDetails: { minute: number | null; clock: string | null }): string => {
  const clock = normalizeToken(clockDetails.clock);
  if (clock && /^\d+\+\d+$/.test(clock)) return clock;
  return clockDetails.minute === null ? '' : String(clockDetails.minute);
};

const incidentTimeLabel = (incident: { minute?: number | null; clock?: string | null }): string | null => (
  normalizeToken(incident.clock) ?? (typeof incident.minute === 'number' ? `${incident.minute}'` : null)
);

const existingSegmentCount = (match: Match): number => Math.max(
  Array.isArray(match.segments) ? match.segments.length : 0,
  Array.isArray(match.team1Points) ? match.team1Points.length : 0,
  Array.isArray(match.team2Points) ? match.team2Points.length : 0,
  Array.isArray(match.setResults) ? match.setResults.length : 0,
  0,
);

const DEFAULT_TIMEKEEPING: ResolvedMatchTimekeepingConfig = {
  timerMode: 'NONE',
  segmentDurationMinutes: null,
  segmentDurationMinutesBySequence: [],
  canUseAddedTime: false,
  addedTimeEnabled: false,
  stopAtRegulationEnd: true,
};

const incidentDefinitionLabel = (type: string): string => {
  const normalized = normalizedIncidentType(type);
  if (normalized === 'POINT') return 'Point';
  if (normalized === 'GOAL') return 'Goal';
  if (normalized === 'RUN') return 'Run';
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

const incidentDefinitionForType = (type: string): MatchIncidentTypeDefinition => {
  const code = normalizedIncidentType(type) || 'NOTE';
  const isScoring = ['POINT', 'GOAL', 'RUN', 'SCORE'].includes(code);
  return {
    code,
    label: incidentDefinitionLabel(code),
    kind: isScoring ? 'SCORING' : code === 'NOTE' ? 'NOTE' : code === 'ADMIN' ? 'ADMIN' : 'DISCIPLINE',
    requiresTeam: isScoring,
    requiresParticipant: false,
    defaultEnabled: true,
    linkedPointDelta: isScoring ? 1 : null,
    metadata: null,
  };
};

const normalizeIncidentDefinitionsForRules = (
  definitions: unknown,
  supportedIncidentTypes: string[],
): MatchIncidentTypeDefinition[] => {
  const byCode = new Map<string, MatchIncidentTypeDefinition>();
  const add = (definition: MatchIncidentTypeDefinition) => {
    const code = normalizedIncidentType(definition.code);
    if (!code) return;
    byCode.set(code, { ...definition, code });
  };
  if (Array.isArray(definitions)) {
    definitions.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const definition = entry as Partial<MatchIncidentTypeDefinition>;
      const code = normalizedIncidentType(definition.code);
      if (!code) return;
      add({
        ...incidentDefinitionForType(code),
        ...definition,
        code,
        label: typeof definition.label === 'string' && definition.label.trim()
          ? definition.label.trim()
          : incidentDefinitionLabel(code),
      });
    });
  }
  supportedIncidentTypes.forEach((type) => {
    const code = normalizedIncidentType(type);
    if (code && !byCode.has(code)) add(incidentDefinitionForType(code));
  });
  return Array.from(byCode.values());
};

const normalizeTimekeepingForRules = (
  source: Partial<ResolvedMatchRules>,
  scoringModel: ResolvedMatchRules['scoringModel'],
  segmentCount: number,
  event: Event,
): ResolvedMatchTimekeepingConfig => {
  const raw = (source.timekeeping && typeof source.timekeeping === 'object'
    ? source.timekeeping
    : {}) as Partial<ResolvedMatchTimekeepingConfig>;
  const timerMode = raw.timerMode === 'COUNT_UP'
    ? 'COUNT_UP'
    : raw.timerMode === 'NONE'
      ? 'NONE'
      : scoringModel === 'PERIODS'
        ? 'COUNT_UP'
        : 'NONE';
  const eventMatchDuration = positiveIntOrNull(event.matchDurationMinutes);
  const fallbackDuration = eventMatchDuration && segmentCount > 0 && timerMode !== 'NONE'
    ? Math.max(1, Math.round(eventMatchDuration / segmentCount))
    : null;
  const segmentDurationMinutes = positiveIntOrNull(raw.segmentDurationMinutes) ?? fallbackDuration;
  const sequenceDurations = Array.isArray(raw.segmentDurationMinutesBySequence)
    ? raw.segmentDurationMinutesBySequence
        .map((entry) => positiveIntOrNull(entry))
        .filter((entry): entry is number => entry !== null)
    : [];
  return {
    timerMode,
    segmentDurationMinutes,
    segmentDurationMinutesBySequence: sequenceDurations,
    canUseAddedTime: timerMode !== 'NONE' && raw.canUseAddedTime === true,
    addedTimeEnabled: timerMode !== 'NONE' && raw.canUseAddedTime === true && raw.addedTimeEnabled === true,
    stopAtRegulationEnd: timerMode === 'NONE'
      ? true
      : raw.canUseAddedTime === true && raw.addedTimeEnabled === true
        ? false
        : raw.stopAtRegulationEnd !== false,
  };
};

const activeRules = (match: Match, event: Event, usesSets: boolean, configuredSegmentCount: number): ResolvedMatchRules => {
  const eventRules = (event.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchResolvedRules = (match.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchSnapshotRules = (match.matchRulesSnapshot || {}) as Partial<ResolvedMatchRules>;
  const source = { ...eventRules, ...matchResolvedRules, ...matchSnapshotRules };
  const scoringModel = source.scoringModel ?? (usesSets ? 'SETS' : 'POINTS_ONLY');
  const supportsShootout = source.supportsShootout === true;
  const sourceSegmentCount = positiveIntOrNull(source.segmentCount);
  const fallbackSegmentCount = Math.max(configuredSegmentCount, existingSegmentCount(match), 1);
  const segmentCount = scoringModel === 'SETS'
    ? Math.max(sourceSegmentCount ?? 0, fallbackSegmentCount, 1)
    : scoringModel === 'POINTS_ONLY'
      ? 1
      : Math.max(sourceSegmentCount ?? 0, fallbackSegmentCount, 1);
  const usesPlayerRecordedScoring = matchResolvedRules.pointIncidentRequiresParticipant === true
    || eventRules.pointIncidentRequiresParticipant === true
    || matchSnapshotRules.pointIncidentRequiresParticipant === true;
  const supportedIncidentTypes = Array.isArray(source.supportedIncidentTypes) && source.supportedIncidentTypes.length
    ? source.supportedIncidentTypes
    : ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'];
  return {
    scoringModel,
    segmentCount,
    segmentLabel: source.segmentLabel || (scoringModel === 'SETS' ? 'Set' : scoringModel === 'INNINGS' ? 'Inning' : scoringModel === 'POINTS_ONLY' ? 'Total' : 'Period'),
    supportsDraw: source.supportsDraw === true && !supportsShootout,
    supportsOvertime: source.supportsOvertime === true,
    supportsShootout,
    canUseOvertime: source.canUseOvertime === true || source.supportsOvertime === true,
    canUseShootout: source.canUseShootout === true || source.supportsShootout === true,
    officialRoles: Array.isArray(source.officialRoles) ? source.officialRoles : [],
    supportedIncidentTypes,
    incidentTypeDefinitions: normalizeIncidentDefinitionsForRules(source.incidentTypeDefinitions, supportedIncidentTypes),
    autoCreatePointIncidentType: source.autoCreatePointIncidentType ?? 'POINT',
    pointIncidentRequiresParticipant: usesPlayerRecordedScoring,
    timekeeping: normalizeTimekeepingForRules(source, scoringModel, segmentCount, event),
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
  const pluralLabel = label === 'half'
    ? 'halves'
    : label.endsWith('y')
      ? `${label.slice(0, -1)}ies`
      : `${label}${label.endsWith('s') ? 'es' : 's'}`;
  return `${rules.segmentCount} ${rules.segmentCount === 1 ? label : pluralLabel}`;
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

const INCIDENT_RETRY_DELAYS_MS = [3000, 15000, 30000] as const;
const INCIDENT_CONFIRM_NO_PROGRESS_TIMEOUT_MS = 10000;
const DIRECT_SCORE_DEBOUNCE_MS = 500;

const sleep = (milliseconds: number) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const incidentRetryDelayMs = (attempt: number) => (
  INCIDENT_RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), INCIDENT_RETRY_DELAYS_MS.length - 1)]
);

const incidentOperationId = (operation: MatchIncidentOperation): string | null => (
  typeof operation.id === 'string' && operation.id.trim() ? operation.id.trim() : null
);

const readPendingIncidentActions = (key: string): MatchIncidentOperation[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((operation): operation is MatchIncidentOperation => (
          ['CREATE', 'UPDATE', 'DELETE'].includes(operation?.action)
          && typeof operation.id === 'string'
          && operation.id.trim().length > 0
        ))
      : [];
  } catch {
    return [];
  }
};

const writePendingIncidentActions = (key: string, operations: MatchIncidentOperation[]) => {
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

const queuedCreateToIncident = (
  operation: MatchIncidentOperation,
  match: Match,
  eventId: string | null | undefined,
  fallbackSequence: number,
): MatchIncident | null => {
  const id = incidentOperationId(operation);
  if (!id || operation.action !== 'CREATE') return null;
  return {
    id,
    eventId: eventId ?? match.eventId ?? null,
    matchId: match.$id,
    segmentId: operation.segmentId ?? null,
    eventTeamId: operation.eventTeamId ?? null,
    eventRegistrationId: operation.eventRegistrationId ?? null,
    participantUserId: operation.participantUserId ?? null,
    officialUserId: operation.officialUserId ?? null,
    incidentType: operation.incidentType ?? 'NOTE',
    sequence: positiveInt(operation.sequence, fallbackSequence),
    minute: typeof operation.minute === 'number' ? operation.minute : null,
    clock: operation.clock ?? null,
    clockSeconds: typeof operation.clockSeconds === 'number' ? operation.clockSeconds : null,
    linkedPointDelta: typeof operation.linkedPointDelta === 'number' ? operation.linkedPointDelta : null,
    note: operation.note ?? null,
    metadata: null,
  };
};

const applyPendingIncidentDeltas = (
  source: MatchSegment[],
  operations: MatchIncidentOperation[],
): MatchSegment[] => {
  if (!operations.length) return source;
  return source.map((segment) => {
    const segmentId = segment.id ?? segment.$id;
    const scoringOperations = operations.filter((operation) => (
      (operation.action === 'CREATE' || operation.action === 'DELETE')
      && operation.segmentId === segmentId
      && operation.eventTeamId
      && typeof operation.linkedPointDelta === 'number'
      && Number.isFinite(operation.linkedPointDelta)
    ));
    if (!scoringOperations.length) return segment;
    const scores = { ...(segment.scores ?? {}) };
    scoringOperations.forEach((operation) => {
      const eventTeamId = operation.eventTeamId!;
      const direction = operation.action === 'DELETE' ? -1 : 1;
      scores[eventTeamId] = Math.max(0, score(scores[eventTeamId]) + (direction * Math.trunc(operation.linkedPointDelta ?? 0)));
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

const cloneSegmentsForState = (source: MatchSegment[]): MatchSegment[] => (
  source.map((segment) => ({
    ...segment,
    scores: { ...(segment.scores ?? {}) },
  }))
);

const segmentStateKey = (segment: Pick<MatchSegment, 'id' | '$id' | 'sequence'>): string => (
  segment.id ?? segment.$id ?? `sequence:${segment.sequence}`
);

const mergeSegmentOverride = (
  source: MatchSegment[],
  override: MatchSegment[] | null,
): MatchSegment[] => {
  if (!override?.length) {
    return cloneSegmentsForState(source);
  }
  const overrideByKey = new Map(override.map((segment) => [segmentStateKey(segment), {
    ...segment,
    scores: { ...(segment.scores ?? {}) },
  }]));
  const merged = cloneSegmentsForState(source).map((segment) => (
    overrideByKey.get(segmentStateKey(segment)) ?? segment
  ));
  overrideByKey.forEach((segment, key) => {
    if (!merged.some((entry) => segmentStateKey(entry) === key)) {
      merged.push(segment);
    }
  });
  return merged.sort((left, right) => left.sequence - right.sequence);
};

const resolveMatchDivision = (event: Event, match: Match, playoff: boolean): DivisionWithRuleConfig | null => {
  const matchDivisionKey = divisionKey(match.division)
    ?? divisionKey(match.team1?.division)
    ?? divisionKey(match.team2?.division);
  if (!matchDivisionKey) {
    return typeof match.division === 'object' && match.division
      ? match.division as DivisionWithRuleConfig
      : null;
  }

  const preferredSources = playoff
    ? [event.playoffDivisionDetails, event.divisionDetails, event.divisions]
    : [event.divisionDetails, event.divisions, event.playoffDivisionDetails];
  for (const source of preferredSources) {
    if (!Array.isArray(source)) continue;
    const sourceDivision = source.find((division) => divisionKey(division) === matchDivisionKey);
    if (sourceDivision) {
      return sourceDivision as DivisionWithRuleConfig;
    }
  }

  return typeof match.division === 'object' && match.division
    ? match.division as DivisionWithRuleConfig
    : null;
};

const divisionLeagueSetsPerMatch = (division: DivisionWithRuleConfig | null): number | null => (
  positiveIntOrNull(division?.setsPerMatch) ?? positiveIntOrNull(division?.leagueConfig?.setsPerMatch)
);

const divisionLeaguePointsToVictory = (division: DivisionWithRuleConfig | null): number[] | null => (
  pointsList(division?.pointsToVictory) ?? pointsList(division?.leagueConfig?.pointsToVictory)
);

const divisionPlayoffSetCount = (
  division: DivisionWithRuleConfig | null,
  losersBracket: boolean,
): number | null => {
  const playoffConfig = division?.playoffConfig;
  return losersBracket
    ? positiveIntOrNull(playoffConfig?.loserSetCount)
    : positiveIntOrNull(playoffConfig?.winnerSetCount);
};

const divisionPlayoffPointsToVictory = (
  division: DivisionWithRuleConfig | null,
  losersBracket: boolean,
): number[] | null => {
  const playoffConfig = division?.playoffConfig;
  return losersBracket
    ? pointsList(playoffConfig?.loserBracketPointsToVictory)
    : pointsList(playoffConfig?.winnerBracketPointsToVictory);
};

const hasPersistedSegment = (match: Match, segment: MatchSegment | undefined): boolean => {
  if (!segment || !Array.isArray(match.segments)) return false;
  const segmentId = segment.id ?? segment.$id ?? null;
  return match.segments.some((persisted) => (
    (segmentId && (persisted.id === segmentId || persisted.$id === segmentId))
    || persisted.sequence === segment.sequence
  ));
};

export default function ScoreUpdateModal({
  match,
  tournament,
  participantTeams = [],
  canManage,
  onSubmit,
  onScoreChange,
  onSetComplete,
  onMatchComplete,
  onClose,
  isOpen,
  team1Placeholder,
  team2Placeholder,
  embedded = false,
  defaultShowDetails = false,
  hideStatusControls = false,
}: ScoreUpdateModalProps) {
  const [segments, setSegments] = useState<MatchSegment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actualTimesSaving, setActualTimesSaving] = useState(false);
  const [timerSaving, setTimerSaving] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [segmentConfirming, setSegmentConfirming] = useState(false);
  const [showFieldMap, setShowFieldMap] = useState(false);
  const [showDetails, setShowDetails] = useState(defaultShowDetails);
  const [editingActualTimes, setEditingActualTimes] = useState(false);
  const [actualStartValue, setActualStartValue] = useState<Date | null>(null);
  const [actualEndValue, setActualEndValue] = useState<Date | null>(null);
  const [incidentType, setIncidentType] = useState('NOTE');
  const [incidentTeamId, setIncidentTeamId] = useState<string | null>(null);
  const [incidentParticipantId, setIncidentParticipantId] = useState<string | null>(null);
  const [incidentMinute, setIncidentMinute] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ teamId: string; delta: number } | null>(null);
  const [deletedIncidentIds, setDeletedIncidentIds] = useState<Set<string>>(() => new Set());
  const [optimisticIncidents, setOptimisticIncidents] = useState<MatchIncident[]>([]);
  const incidentQueueRef = useRef<MatchIncidentOperation[]>([]);
  const incidentQueueTimerRef = useRef<number | null>(null);
  const incidentRetryAttemptRef = useRef(0);
  const processingIncidentQueueRef = useRef(false);
  const segmentsRef = useRef<MatchSegment[]>([]);
  const localSegmentOverrideRef = useRef<MatchSegment[] | null>(null);
  const directScoreSyncTimerRef = useRef<number | null>(null);
  const directScoreEditVersionRef = useRef(0);
  const directScoreInvalidatedThroughVersionRef = useRef(0);
  const pendingDirectScoreSyncRef = useRef<PendingDirectScoreSync | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const regulationBeepKeyRef = useRef<string | null>(null);

  const team1Id = match.team1Id ?? entityId(match.team1);
  const team2Id = match.team2Id ?? entityId(match.team2);
  const eventTeamsById = useMemo(() => {
    const map = new Map<string, Team>();
    const addTeam = (team: Team) => {
      const id = entityId(team);
      if (id) map.set(id, mergeTeamRosterData(map.get(id), team));
    };
    if (match.team1) addTeam(match.team1 as Team);
    if (match.team2) addTeam(match.team2 as Team);
    if (match.teamOfficial) addTeam(match.teamOfficial as Team);
    (Array.isArray(tournament.teams) ? tournament.teams : []).forEach(addTeam);
    participantTeams.forEach(addTeam);
    return map;
  }, [match.team1, match.team2, match.teamOfficial, participantTeams, tournament.teams]);
  const team1 = team1Id ? eventTeamsById.get(team1Id) ?? match.team1 : match.team1;
  const team2 = team2Id ? eventTeamsById.get(team2Id) ?? match.team2 : match.team2;
  const team1Label = bracketTeamLabel(match, team1, match.previousLeftMatch, team1Placeholder, 'team1');
  const team2Label = bracketTeamLabel(match, team2, match.previousRightMatch, team2Placeholder, 'team2');
  const teamOfficialId = match.teamOfficialId ?? entityId(match.teamOfficial);
  const teamOfficial = teamOfficialId ? eventTeamsById.get(teamOfficialId) ?? match.teamOfficial : match.teamOfficial;
  const usesSets = typeof tournament.usesSets === 'boolean' ? tournament.usesSets : Boolean(tournament.leagueConfig?.usesSets);
  const isTimedMatch = !usesSets;
  const playoff = tournament.eventType === 'TOURNAMENT' || Boolean(match.losersBracket || match.winnerNextMatchId || match.loserNextMatchId);
  const matchDivision = useMemo(
    () => resolveMatchDivision(tournament, match, playoff),
    [match, playoff, tournament],
  );
  const pointTargets = playoff
    ? divisionPlayoffPointsToVictory(matchDivision, Boolean(match.losersBracket))
      ?? (match.losersBracket ? tournament.loserBracketPointsToVictory : tournament.winnerBracketPointsToVictory)
    : divisionLeaguePointsToVictory(matchDivision)
      ?? tournament.pointsToVictory
      ?? tournament.leagueConfig?.pointsToVictory;
  const fallbackSegmentCount = useMemo(() => {
    if (isTimedMatch) return 1;
    const fromTargets = Array.isArray(pointTargets) && pointTargets.length ? pointTargets.length : 1;
    if (playoff) {
      return positiveInt(
        divisionPlayoffSetCount(matchDivision, Boolean(match.losersBracket))
          ?? (match.losersBracket ? tournament.loserSetCount : tournament.winnerSetCount),
        fromTargets,
      );
    }
    return positiveInt(
      divisionLeagueSetsPerMatch(matchDivision)
        ?? tournament.setsPerMatch
        ?? tournament.leagueConfig?.setsPerMatch,
      fromTargets,
    );
  }, [isTimedMatch, match.losersBracket, matchDivision, playoff, pointTargets, tournament.leagueConfig?.setsPerMatch, tournament.loserSetCount, tournament.setsPerMatch, tournament.winnerSetCount]);
  const rules = useMemo(() => activeRules(match, tournament, usesSets, fallbackSegmentCount), [fallbackSegmentCount, match, tournament, usesSets]);
  const totalSegments = Math.max(1, rules.segmentCount);
  const scoringIncidentType = rules.autoCreatePointIncidentType ?? 'POINT';
  const incidentDefinitionsByCode = useMemo(() => (
    new Map(rules.incidentTypeDefinitions.map((definition) => [normalizedIncidentType(definition.code), definition]))
  ), [rules.incidentTypeDefinitions]);
  const incidentLabelForType = (type: string): string => (
    incidentDefinitionsByCode.get(normalizedIncidentType(type))?.label ?? matchLogTypeLabel(type)
  );
  const incidentBadgeColorForType = (type: string, scoring: boolean): string => {
    if (scoring) return 'blue';
    const cardColor = incidentDefinitionsByCode.get(normalizedIncidentType(type))?.cardColor;
    if (cardColor === 'yellow') return 'yellow';
    if (cardColor === 'red') return 'red';
    if (cardColor === 'blue') return 'blue';
    return 'gray';
  };
  const scoringIncidentLabel = incidentLabelForType(scoringIncidentType);
  const scoringActionLabel = normalizedIncidentType(scoringIncidentType) === 'POINT' ? 'Point' : scoringIncidentLabel;
  const activeSegment = segments[activeIndex] ?? segments[0];
  const team1Score = scoreForSegment(activeSegment, activeIndex, team1Id, match.team1Points);
  const team2Score = scoreForSegment(activeSegment, activeIndex, team2Id, match.team2Points);
  const activeSegmentDurationMinutes = activeSegment
    ? rules.timekeeping.segmentDurationMinutesBySequence[activeSegment.sequence - 1]
      ?? rules.timekeeping.segmentDurationMinutes
    : rules.timekeeping.segmentDurationMinutes;
  const activeSegmentDurationSeconds = activeSegmentDurationMinutes ? activeSegmentDurationMinutes * 60 : null;
  const hasMatchClock = rules.timekeeping.timerMode !== 'NONE' && Boolean(activeSegmentDurationSeconds);
  const useCumulativeClock = rules.timekeeping.addedTimeEnabled === true;
  const activeSegmentRegulationOffsetSeconds = regulationOffsetSecondsForSegment(activeSegment, rules);
  const activeSegmentRegulationEndSeconds = activeSegmentRegulationOffsetSeconds + (activeSegmentDurationSeconds ?? 0);
  const activeSegmentStartDate = coerceActualDate(activeSegment?.startedAt ?? null);
  const activeSegmentEndDate = coerceActualDate(activeSegment?.endedAt ?? null);
  const rawTimerElapsedSeconds = activeSegmentStartDate
    ? Math.max(
        0,
        Math.floor(((activeSegmentEndDate?.getTime() ?? timerNow) - activeSegmentStartDate.getTime()) / 1000),
      )
    : 0;
  const clockElapsedSeconds = hasMatchClock && activeSegmentDurationSeconds && rules.timekeeping.stopAtRegulationEnd
    ? Math.min(rawTimerElapsedSeconds, activeSegmentDurationSeconds)
    : rawTimerElapsedSeconds;
  const clockInAddedTime = Boolean(
    hasMatchClock
    && activeSegmentDurationSeconds
    && rules.timekeeping.addedTimeEnabled
    && rawTimerElapsedSeconds > activeSegmentDurationSeconds,
  );
  const activeTimerRunning = Boolean(
    hasMatchClock
    && activeSegmentStartDate
    && !activeSegmentEndDate
    && (!rules.timekeeping.stopAtRegulationEnd || !activeSegmentDurationSeconds || rawTimerElapsedSeconds < activeSegmentDurationSeconds),
  );
  const regulationClockEnded = Boolean(
    hasMatchClock
    && activeSegmentStartDate
    && !activeSegmentEndDate
    && activeSegmentDurationSeconds
    && rules.timekeeping.stopAtRegulationEnd
    && rawTimerElapsedSeconds >= activeSegmentDurationSeconds,
  );
  const clockDisplay = (() => {
    const formatDisplayClock = useCumulativeClock ? formatClockSecondsAsMinutes : formatClockSeconds;
    if (!hasMatchClock) return 'No match clock';
    if (!activeSegmentStartDate) {
      return formatDisplayClock(useCumulativeClock ? activeSegmentRegulationOffsetSeconds : 0);
    }
    if (clockInAddedTime && activeSegmentDurationSeconds) {
      const regulationEndSeconds = useCumulativeClock ? activeSegmentRegulationEndSeconds : activeSegmentDurationSeconds;
      return `${formatDisplayClock(regulationEndSeconds)} +${formatClockSeconds(rawTimerElapsedSeconds - activeSegmentDurationSeconds)}`;
    }
    return formatDisplayClock(useCumulativeClock
      ? activeSegmentRegulationOffsetSeconds + clockElapsedSeconds
      : clockElapsedSeconds);
  })();
  const timerSegmentKey = `${match.$id}:${activeSegment?.id ?? activeSegment?.sequence ?? activeIndex}`;
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
  const scoringRequiresParticipant = rules.pointIncidentRequiresParticipant === true;
  const useScoringIncidentsForScore = !scoringRequiresParticipant && !persistedScoreDataAvailable;
  const scoringUsesIncidentWorkflow = tournament.autoCreatePointMatchIncidents === true
    || scoringRequiresParticipant
    || useScoringIncidentsForScore;
  const supportedIncidentTypes = useMemo(() => (
    rules.supportedIncidentTypes.some((type) => isScoringIncidentType(type, rules))
      ? rules.supportedIncidentTypes
      : [scoringIncidentType, ...rules.supportedIncidentTypes]
  ), [rules, scoringIncidentType]);
  const manualIncidentTypes = useMemo(() => (
    scoringUsesIncidentWorkflow
      ? supportedIncidentTypes
      : supportedIncidentTypes.filter((type) => !isScoringIncidentType(type, rules))
  ), [rules, scoringUsesIncidentWorkflow, supportedIncidentTypes]);
  const defaultIncidentType = manualIncidentTypes.includes('NOTE')
    ? 'NOTE'
    : manualIncidentTypes[0] ?? scoringIncidentType;
  const incidentRetryStorageKey = pendingIncidentStorageKey(tournament.$id ?? match.eventId, match.$id);
  const teamOptions = [
    ...(team1Id ? [{ value: team1Id, label: team1Label }] : []),
    ...(team2Id ? [{ value: team2Id, label: team2Label }] : []),
  ];
  const participantOptionsByTeam = useMemo(() => ({
    ...(team1Id ? { [team1Id]: buildParticipantOptions(team1 as Team | null | undefined, team1Id) } : {}),
    ...(team2Id ? { [team2Id]: buildParticipantOptions(team2 as Team | null | undefined, team2Id) } : {}),
  }), [team1, team1Id, team2, team2Id]);
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
  const selectedIncidentIsScoring = isScoringIncidentType(incidentType, rules);
  const selectedIncidentRequiresParticipant = selectedIncidentIsScoring && rules.pointIncidentRequiresParticipant === true;
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
      scoringUsesIncidentWorkflow
      || !isScoringIncidentType(incident.incidentType, rules)
    ))
  ), [allIncidents, rules, scoringUsesIncidentWorkflow]);
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
    eventTeamId === team1Id ? team1Label : eventTeamId === team2Id ? team2Label : 'Match'
  );
  const participantLabelForIncident = (incident: { eventRegistrationId?: string | null; participantUserId?: string | null }): string | null => {
    if (incident.eventRegistrationId) {
      const label = participantLabelsByRegistrationId.get(incident.eventRegistrationId);
      if (label) return label;
    }
    return incident.participantUserId ? participantLabelsByUserId.get(incident.participantUserId) ?? null : null;
  };
  const scoringIncidentDescription = (incident: { eventTeamId?: string | null; eventRegistrationId?: string | null; participantUserId?: string | null; minute?: number | null; clock?: string | null }) => (
    [
      teamLabelForId(incident.eventTeamId),
      participantLabelForIncident(incident),
      incidentTimeLabel(incident),
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
  const officialAssignments = match.officialIds ?? [];
  const hasTeamOfficial = Boolean(teamOfficialId || teamOfficial);
  const hasOfficials = officialAssignments.length > 0 || hasTeamOfficial;
  const resultStatus = normalizedIncidentType(match.resultStatus);
  const resultType = normalizedIncidentType(match.resultType);
  const lifecycleStatus = normalizedIncidentType(match.status);
  const statusReason = typeof match.statusReason === 'string' ? match.statusReason.trim() : '';
  const showStatusBlock = Boolean(statusReason)
    || (resultStatus.length > 0 && !['PENDING', 'OFFICIAL'].includes(resultStatus))
    || (resultType.length > 0 && resultType !== 'REGULATION')
    || ['CANCELLED', 'FORFEIT', 'SUSPENDED'].includes(lifecycleStatus);
  const currentClockDetails = (): { minute: number | null; clock: string | null; clockSeconds: number | null } => {
    if (!hasMatchClock || !activeSegmentStartDate) {
      return { minute: null, clock: null, clockSeconds: null };
    }
    const segmentClockSeconds = Math.max(0, Math.trunc(clockElapsedSeconds));
    const clockSeconds = useCumulativeClock
      ? activeSegmentRegulationOffsetSeconds + segmentClockSeconds
      : segmentClockSeconds;
    return {
      minute: Math.max(0, Math.ceil(clockSeconds / 60)),
      clock: useCumulativeClock && clockInAddedTime && activeSegmentDurationSeconds
        ? formatAddedTimeIncidentClock(activeSegmentRegulationEndSeconds, rawTimerElapsedSeconds - activeSegmentDurationSeconds)
        : useCumulativeClock ? formatClockSecondsAsMinutes(clockSeconds) : formatIncidentClock(clockSeconds),
      clockSeconds,
    };
  };
  const incidentClockDetails = () => {
    const clockDetails = currentClockDetails();
    const manualClockDetails = parseIncidentClockInput(incidentMinute, {
      allowAddedTimeNotation: rules.timekeeping.addedTimeEnabled === true,
    });
    if (manualClockDetails) {
      const clockMatchesCurrent = manualClockDetails.clock !== null
        && manualClockDetails.clock === normalizeToken(clockDetails.clock);
      return {
        minute: manualClockDetails.minute,
        clock: manualClockDetails.clock ?? clockDetails.clock,
        clockSeconds: clockMatchesCurrent ? clockDetails.clockSeconds : manualClockDetails.clockSeconds,
      };
    }
    return clockDetails;
  };
  const resetIncidentForm = () => {
    const clockDetails = currentClockDetails();
    setEditingIncidentId(null);
    setIncidentType(defaultIncidentType);
    setIncidentTeamId(team1Id ?? team2Id ?? null);
    setIncidentParticipantId((team1Id && participantOptionsByTeam[team1Id]?.[0]?.value) ?? (team2Id && participantOptionsByTeam[team2Id]?.[0]?.value) ?? null);
    setIncidentMinute(incidentInputValueFromClock(clockDetails));
    setIncidentNote('');
  };
  const nextIncidentId = () => {
    const randomId = globalThis.crypto?.randomUUID?.();
    if (randomId) return randomId;
    return `${match.$id}_incident_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };
  const persistIncidentQueue = (operations: MatchIncidentOperation[]) => {
    incidentQueueRef.current = operations.map((operation) => ({ ...operation }));
    if (!incidentQueueRef.current.length) {
      incidentRetryAttemptRef.current = 0;
    }
    writePendingIncidentActions(incidentRetryStorageKey, incidentQueueRef.current);
  };
  const enqueueIncidentOperation = (operation: MatchIncidentOperation) => {
    const id = incidentOperationId(operation);
    if (!id) return;
    const existingQueue = incidentQueueRef.current;
    const existingIndex = existingQueue.findIndex((queued) => incidentOperationId(queued) === id);
    if (operation.action === 'UPDATE' && existingIndex >= 0 && existingQueue[existingIndex].action === 'CREATE') {
      persistIncidentQueue(existingQueue.map((queued, index) => (
        index === existingIndex ? { ...queued, ...operation, action: 'CREATE' } : queued
      )));
      return;
    }
    if (operation.action === 'DELETE' && existingIndex >= 0 && existingQueue[existingIndex].action === 'CREATE') {
      persistIncidentQueue(existingQueue.filter((_, index) => index !== existingIndex));
      return;
    }
    persistIncidentQueue([
      ...existingQueue.filter((queued) => incidentOperationId(queued) !== id),
      { ...operation, id },
    ]);
  };
  const forgetIncidentAction = (operation: MatchIncidentOperation) => {
    const id = incidentOperationId(operation);
    if (!id) return;
    const next = incidentQueueRef.current.filter((queued, index) => (
      index !== 0 || incidentOperationId(queued) !== id || queued.action !== operation.action
    ));
    persistIncidentQueue(next);
  };
  const pendingIncidentActions = () => incidentQueueRef.current.map((operation) => ({ ...operation }));
  const clearIncidentQueueTimer = () => {
    if (incidentQueueTimerRef.current) {
      window.clearTimeout(incidentQueueTimerRef.current);
      incidentQueueTimerRef.current = null;
    }
  };

  const clearDirectScoreSyncTimer = () => {
    if (directScoreSyncTimerRef.current) {
      window.clearTimeout(directScoreSyncTimerRef.current);
      directScoreSyncTimerRef.current = null;
    }
  };

  const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const playRegulationBeep = () => {
    const context = ensureAudioContext();
    if (!context) return;
    const now = context.currentTime;
    for (let index = 0; index < 3; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + index * 0.32;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.5, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.26);
    }
  };

  const applyLocalSegmentState = (next: MatchSegment[]) => {
    const cloned = cloneSegmentsForState(next);
    localSegmentOverrideRef.current = cloneSegmentsForState(cloned);
    segmentsRef.current = cloned;
    setSegments(cloned);
    return cloned;
  };

  const cancelPendingDirectScoreSync = (invalidateQueuedSyncs = false) => {
    clearDirectScoreSyncTimer();
    if (invalidateQueuedSyncs) {
      directScoreInvalidatedThroughVersionRef.current = Math.max(
        directScoreInvalidatedThroughVersionRef.current,
        directScoreEditVersionRef.current,
      );
    }
    pendingDirectScoreSyncRef.current = null;
  };

  useEffect(() => {
    localSegmentOverrideRef.current = null;
    pendingDirectScoreSyncRef.current = null;
    directScoreEditVersionRef.current = 0;
    directScoreInvalidatedThroughVersionRef.current = 0;
    clearDirectScoreSyncTimer();
  }, [match.$id]);

  useEffect(() => {
    const persistedIncidentIds = new Set(
      (Array.isArray(match.incidents) ? match.incidents : [])
        .map((incident) => entityId(incident))
        .filter((id): id is string => Boolean(id)),
    );
    const queuedActions = readPendingIncidentActions(incidentRetryStorageKey)
      .filter((operation) => operation.action !== 'CREATE' || !persistedIncidentIds.has(operation.id ?? ''));
    incidentQueueRef.current = queuedActions;
    writePendingIncidentActions(incidentRetryStorageKey, queuedActions);
    const persistedSegments = buildSegments(matchSegmentSnapshot, totalSegments, team1Id, team2Id);
    const incidentFallbackSegments = useScoringIncidentsForScore
      ? applyMatchIncidentDeltas(persistedSegments, match.incidents, rules)
      : persistedSegments;
    const next = mergeSegmentOverride(
      applyPendingIncidentDeltas(incidentFallbackSegments, queuedActions),
      localSegmentOverrideRef.current,
    );
    segmentsRef.current = next;
    setSegments(next);
    setActiveIndex((current) => {
      if (localSegmentOverrideRef.current?.length && current >= 0 && current < next.length) {
        return current;
      }
      return Math.max(0, next.findIndex((segment) => segment.status !== 'COMPLETE'));
    });
    setDeletedIncidentIds(new Set(
      queuedActions
        .filter((operation) => operation.action === 'DELETE')
        .map((operation) => operation.id)
        .filter((id): id is string => Boolean(id)),
    ));
    setOptimisticIncidents((current) => {
      const persistedIncidentIds = new Set(
        (match.incidents ?? [])
          .map((incident) => entityId(incident) ?? incident.id)
          .filter((id): id is string => Boolean(id)),
      );
      const queuedCreateIncidents = queuedActions
        .map((operation, index) => queuedCreateToIncident(operation, match, tournament.$id, index + 1))
        .filter((incident): incident is MatchIncident => Boolean(incident));
      const currentIncidents = current.filter((incident) => (
        incident.matchId === match.$id
        && !persistedIncidentIds.has(entityId(incident) ?? incident.id)
        && !queuedCreateIncidents.some((queued) => queued.id === (entityId(incident) ?? incident.id))
      ));
      return [...currentIncidents, ...queuedCreateIncidents];
    });
    setIncidentType(defaultIncidentType);
    setIncidentTeamId(team1Id ?? team2Id ?? null);
    setIncidentParticipantId((team1Id && participantOptionsByTeam[team1Id]?.[0]?.value) ?? (team2Id && participantOptionsByTeam[team2Id]?.[0]?.value) ?? null);
    setIncidentMinute('');
    setIncidentNote('');
    setEditingIncidentId(null);
    setActualStartValue(coerceActualDate(match.actualStart));
    setActualEndValue(coerceActualDate(match.actualEnd));
    setEditingActualTimes(false);
    if (queuedActions.length) {
      window.setTimeout(() => {
        void processIncidentQueue();
      }, 0);
    }
  }, [defaultIncidentType, incidentRetryStorageKey, match.$id, match.actualEnd, match.actualStart, match.incidents, matchSegmentSnapshot, participantOptionsByTeam, rules, team1Id, team2Id, totalSegments, useScoringIncidentsForScore]);

  useEffect(() => {
    if (!isOpen) {
      setShowFieldMap(false);
      setShowDetails(defaultShowDetails);
      setPendingPoint(null);
      setEditingActualTimes(false);
      localSegmentOverrideRef.current = null;
      pendingDirectScoreSyncRef.current = null;
      directScoreEditVersionRef.current = 0;
      directScoreInvalidatedThroughVersionRef.current = 0;
      clearDirectScoreSyncTimer();
    }
  }, [defaultShowDetails, isOpen, match.$id]);

  useEffect(() => {
    if (isOpen) {
      setShowDetails(defaultShowDetails);
    }
  }, [defaultShowDetails, isOpen, match.$id]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (!isOpen || !activeTimerRunning) {
      return undefined;
    }
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeTimerRunning, isOpen, timerSegmentKey]);

  useEffect(() => {
    if (!regulationClockEnded) {
      return;
    }
    if (regulationBeepKeyRef.current === timerSegmentKey) {
      return;
    }
    regulationBeepKeyRef.current = timerSegmentKey;
    playRegulationBeep();
  }, [regulationClockEnded, timerSegmentKey]);

  useEffect(() => () => {
    clearIncidentQueueTimer();
    clearDirectScoreSyncTimer();
  }, []);

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

  useEffect(() => {
    if (!isOpen || editingIncidentId || pendingPoint || incidentMinute.trim()) {
      return;
    }
    const clockDetails = currentClockDetails();
    if (clockDetails.minute !== null) {
      setIncidentMinute(incidentInputValueFromClock(clockDetails));
    }
  }, [activeSegment?.startedAt, activeSegment?.endedAt, editingIncidentId, incidentMinute, isOpen, pendingPoint, timerSegmentKey]);

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

  const syncPendingDirectScore = async (editVersion: number): Promise<void> => {
    const pendingSync = pendingDirectScoreSyncRef.current;
    if (!pendingSync || pendingSync.editVersion !== editVersion) {
      return;
    }
    if (editVersion <= directScoreInvalidatedThroughVersionRef.current) {
      pendingDirectScoreSyncRef.current = null;
      return;
    }
    const success = await emit(payload(segmentsRef.current, pendingSync.scoreSetAvailable
      ? {
          directScoreVersion: editVersion,
          scoreSet: {
            segmentId: pendingSync.segmentId,
            sequence: pendingSync.sequence,
            eventTeamId: pendingSync.eventTeamId,
            points: pendingSync.points,
          },
        }
      : {
          directScoreVersion: editVersion,
        }));
    if (success && pendingDirectScoreSyncRef.current?.editVersion === editVersion) {
      pendingDirectScoreSyncRef.current = null;
    }
  };

  const scheduleDirectScoreSync = (pendingSync: PendingDirectScoreSync) => {
    clearDirectScoreSyncTimer();
    if (pendingSync.editVersion <= directScoreInvalidatedThroughVersionRef.current) {
      return;
    }
    directScoreSyncTimerRef.current = window.setTimeout(() => {
      directScoreSyncTimerRef.current = null;
      void syncPendingDirectScore(pendingSync.editVersion);
    }, DIRECT_SCORE_DEBOUNCE_MS);
  };

  const executeNextIncidentAction = async (): Promise<boolean> => {
    const operation = incidentQueueRef.current[0];
    if (!operation) return true;
    const success = await emit(payload(segmentsRef.current, {
      incidentOperations: [{ ...operation }],
    }));
    if (success) {
      incidentRetryAttemptRef.current = 0;
      forgetIncidentAction(operation);
    }
    return success;
  };

  const scheduleIncidentQueueRetry = () => {
    if (incidentQueueTimerRef.current || !incidentQueueRef.current.length) return;
    const retryDelayMs = incidentRetryDelayMs(incidentRetryAttemptRef.current);
    incidentRetryAttemptRef.current += 1;
    incidentQueueTimerRef.current = window.setTimeout(() => {
      incidentQueueTimerRef.current = null;
      void processIncidentQueue();
    }, retryDelayMs);
  };

  const processIncidentQueue = async () => {
    if (processingIncidentQueueRef.current) return;
    clearIncidentQueueTimer();
    processingIncidentQueueRef.current = true;
    try {
      while (incidentQueueRef.current.length) {
        const success = await executeNextIncidentAction();
        if (!success) {
          scheduleIncidentQueueRetry();
          return;
        }
      }
    } finally {
      processingIncidentQueueRef.current = false;
    }
  };

  const drainIncidentQueueForConfirmation = async (): Promise<boolean> => {
    clearIncidentQueueTimer();
    while (processingIncidentQueueRef.current) {
      await sleep(50);
    }

    processingIncidentQueueRef.current = true;
    let elapsedWithoutReduction = 0;
    try {
      while (incidentQueueRef.current.length) {
        const beforeCount = incidentQueueRef.current.length;
        const success = await executeNextIncidentAction();
        const afterCount = incidentQueueRef.current.length;
        if (success || afterCount < beforeCount) {
          elapsedWithoutReduction = 0;
          continue;
        }
        const waitMs = Math.min(
          incidentRetryDelayMs(incidentRetryAttemptRef.current),
          INCIDENT_CONFIRM_NO_PROGRESS_TIMEOUT_MS - elapsedWithoutReduction,
        );
        if (waitMs <= 0) {
          return false;
        }
        incidentRetryAttemptRef.current += 1;
        await sleep(waitMs);
        elapsedWithoutReduction += waitMs;
      }
      return true;
    } finally {
      processingIncidentQueueRef.current = false;
      if (incidentQueueRef.current.length) {
        scheduleIncidentQueueRetry();
      }
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
    const next = applyLocalSegmentState(applyScoreDelta(segmentsRef.current, eventTeamId, delta));
    const nextSegment = next.find((segment) => {
      const segmentId = segment.id ?? segment.$id;
      const activeSegmentId = activeSegment.id ?? activeSegment.$id;
      return (activeSegmentId && segmentId === activeSegmentId) || segment.sequence === activeSegment.sequence;
    });
    const nextPendingSync = {
      editVersion: directScoreEditVersionRef.current + 1,
      segmentId: activeSegment.id ?? activeSegment.$id ?? null,
      sequence: activeSegment.sequence,
      eventTeamId,
      points: score(nextSegment?.scores?.[eventTeamId]),
      scoreSetAvailable: hasPersistedSegment(match, activeSegment),
    } satisfies PendingDirectScoreSync;
    directScoreEditVersionRef.current = nextPendingSync.editVersion;
    pendingDirectScoreSyncRef.current = nextPendingSync;
    scheduleDirectScoreSync(nextPendingSync);
  };

  const createScoringIncident = (
    eventTeamId: string | null,
    details: {
      participant?: MatchRosterParticipantOption | null;
      minute?: number | null;
      clock?: string | null;
      clockSeconds?: number | null;
      note?: string | null;
    } = {},
  ) => {
    if (!canManage || !activeSegment || !eventTeamId || activeSegment.status === 'COMPLETE') return;
    const next = applyLocalSegmentState(applyScoreDelta(segmentsRef.current, eventTeamId, 1));
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
      clock: details.clock ?? null,
      clockSeconds: details.clockSeconds ?? null,
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
      clock: incidentOperation.clock ?? null,
      clockSeconds: incidentOperation.clockSeconds ?? null,
      linkedPointDelta: 1,
      note: incidentOperation.note ?? null,
      metadata: null,
    };
    setOptimisticIncidents((current) => [
      ...current.filter((incident) => (entityId(incident) ?? incident.id) !== optimisticIncident.id),
      optimisticIncident,
    ]);
    enqueueIncidentOperation(incidentOperation);
    void processIncidentQueue();
  };

  const removeQueuedScoringIncident = (eventTeamId: string): boolean => {
    const activeSegmentId = activeSegment?.id ?? activeSegment?.$id ?? null;
    let retryIndex = -1;
    for (let index = incidentQueueRef.current.length - 1; index >= 0; index -= 1) {
      const operation = incidentQueueRef.current[index];
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
    const [operation] = incidentQueueRef.current.splice(retryIndex, 1);
    writePendingIncidentActions(incidentRetryStorageKey, incidentQueueRef.current);
    applyLocalSegmentState(applyScoreDelta(segmentsRef.current, eventTeamId, -score(operation.linkedPointDelta)));
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
    const next = shouldAdjustScore
      ? applyLocalSegmentState(applyScoreDelta(segmentsRef.current, incident.eventTeamId ?? null, -linkedDelta, incident.segmentId))
      : segmentsRef.current;
    setDeletedIncidentIds((current) => new Set(current).add(incidentId));
    setOptimisticIncidents((current) => current.filter((entry) => (entityId(entry) ?? entry.id) !== incidentId));
    if (editingIncidentId === incidentId) resetIncidentForm();
    const incidentOperation: MatchIncidentOperation = {
      action: 'DELETE',
      id: incidentId,
      segmentId: incident.segmentId ?? null,
      eventTeamId: incident.eventTeamId ?? null,
      incidentType: incident.incidentType,
      linkedPointDelta: shouldAdjustScore ? linkedDelta : null,
    };
    enqueueIncidentOperation(incidentOperation);
    void processIncidentQueue();
  };

  const participantValueForIncident = (incident: MatchIncident): string | null => {
    const options = incident.eventTeamId ? (participantOptionsByTeam[incident.eventTeamId] ?? []) : [];
    if (incident.eventRegistrationId && options.some((option) => option.value === incident.eventRegistrationId)) {
      return incident.eventRegistrationId;
    }
    if (incident.participantUserId) {
      return options.find((option) => option.participantUserId === incident.participantUserId || option.value === incident.participantUserId)?.value ?? null;
    }
    return null;
  };

  const editIncident = (incident: MatchIncident) => {
    if (!canManage) return;
    const incidentId = entityId(incident) ?? incident.id;
    if (!incidentId) return;
    setPendingPoint(null);
    setEditingIncidentId(incidentId);
    setIncidentType(incident.incidentType || defaultIncidentType);
    setIncidentTeamId(incident.eventTeamId ?? null);
    setIncidentParticipantId(participantValueForIncident(incident));
    setIncidentMinute(incidentInputValue(incident));
    setIncidentNote(incident.note ?? '');
  };

  const updateIncident = () => {
    if (!editingIncidentId) return;
    const existing = allIncidents.find((incident) => (entityId(incident) ?? incident.id) === editingIncidentId);
    if (!existing) return;

    const wasScoring = isScoringIncidentType(existing.incidentType, rules);
    const nextIsScoring = isScoringIncidentType(incidentType, rules);
    const previousDelta = wasScoring ? score(existing.linkedPointDelta) : 0;
    const nextDelta = nextIsScoring ? Math.max(1, score(existing.linkedPointDelta) || 1) : 0;
    const targetSegmentId = existing.segmentId ?? activeSegment?.id ?? null;
    let next = segmentsRef.current;
    if (previousDelta && existing.eventTeamId) {
      next = applyScoreDelta(next, existing.eventTeamId, -previousDelta, existing.segmentId);
    }
    if (nextDelta && incidentTeamId) {
      next = applyScoreDelta(next, incidentTeamId, nextDelta, targetSegmentId);
    }

    const incidentOperation: MatchIncidentOperation = {
      action: incidentQueueRef.current.some((operation) => operation.action === 'CREATE' && operation.id === editingIncidentId) ? 'CREATE' : 'UPDATE',
      id: editingIncidentId,
      segmentId: targetSegmentId,
      eventTeamId: incidentTeamId,
      eventRegistrationId: selectedParticipant?.eventRegistrationId ?? null,
      participantUserId: selectedParticipant?.participantUserId ?? null,
      incidentType,
      ...incidentClockDetails(),
      linkedPointDelta: nextIsScoring ? nextDelta : null,
      note: incidentNote.trim() || null,
    };
    const optimisticIncident: MatchIncident = {
      ...existing,
      segmentId: incidentOperation.segmentId ?? null,
      eventTeamId: incidentOperation.eventTeamId ?? null,
      eventRegistrationId: incidentOperation.eventRegistrationId ?? null,
      participantUserId: incidentOperation.participantUserId ?? null,
      incidentType: incidentOperation.incidentType ?? existing.incidentType,
      minute: incidentOperation.minute ?? null,
      clock: incidentOperation.clock ?? null,
      clockSeconds: incidentOperation.clockSeconds ?? null,
      linkedPointDelta: incidentOperation.linkedPointDelta ?? null,
      note: incidentOperation.note ?? null,
    };
    applyLocalSegmentState(next);
    setOptimisticIncidents((current) => [
      ...current.filter((incident) => (entityId(incident) ?? incident.id) !== editingIncidentId),
      optimisticIncident,
    ]);
    enqueueIncidentOperation(incidentOperation);
    void processIncidentQueue();
    resetIncidentForm();
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

  const targetForSegment = (segmentIndex: number): number | null => (
    resolveSetVictoryTarget(pointTargets, segmentIndex)
  );

  const targetForActive = (): number | null => targetForSegment(activeIndex);

  const setWinConditionMet = () => (
    getSetScoreState(team1Score, team2Score, targetForActive()).isValidFinalScore
  );

  const canIncreaseTeamScore = (eventTeamId: string | null): boolean => {
    if (rules.scoringModel !== 'SETS') return true;
    if (!eventTeamId) return false;
    const nextTeam1Score = eventTeamId === team1Id ? team1Score + 1 : team1Score;
    const nextTeam2Score = eventTeamId === team2Id ? team2Score + 1 : team2Score;
    return canIncreaseSetScore(
      team1Score,
      team2Score,
      nextTeam1Score,
      nextTeam2Score,
      targetForActive(),
    );
  };

  const requestScore = (eventTeamId: string | null, delta: number) => {
    if (!eventTeamId) return;
    if (delta > 0 && !canIncreaseTeamScore(eventTeamId)) return;
    if (delta > 0 && scoringUsesIncidentWorkflow) {
      const clockDetails = currentClockDetails();
      setPendingPoint({ teamId: eventTeamId, delta });
      setIncidentType(scoringIncidentType);
      setIncidentTeamId(eventTeamId);
      setIncidentParticipantId(participantOptionsByTeam[eventTeamId]?.[0]?.value ?? null);
      setIncidentMinute(incidentInputValueFromClock(clockDetails));
      setIncidentNote('');
      return;
    }
    updateScore(eventTeamId, delta);
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
    if (segmentConfirming) return;
    if (rules.scoringModel === 'SETS' && !setWinConditionMet()) {
      alert('A set can only finish at the victory target, or above it when the winner leads by 2.');
      return;
    }
    setSegmentConfirming(true);
    cancelPendingDirectScoreSync(true);
    const incidentQueueDrained = await drainIncidentQueueForConfirmation();
    if (!incidentQueueDrained) {
      setSegmentConfirming(false);
      alert('Incident updates are still waiting to sync. Please retry once the queue starts moving.');
      return;
    }
    const winnerEventTeamId = team1Score > team2Score ? team1Id : team2Score > team1Score ? team2Id : null;
    const endedAt = new Date().toISOString();
    const next = segmentsRef.current.map((segment, index) => (
      index === activeIndex ? { ...segment, status: 'COMPLETE', winnerEventTeamId, endedAt } satisfies MatchSegment : segment
    ));
    const confirmedSegment = next[activeIndex] ?? activeSegment;
    const shouldFinalize = matchComplete(next);
    const nextPayload = payload(next, {
      ...(shouldFinalize ? { finalize: true, time: endedAt } : {}),
      segmentOperations: [{
        id: confirmedSegment.id ?? confirmedSegment.$id,
        sequence: confirmedSegment.sequence,
        status: 'COMPLETE',
        scores: confirmedSegment.scores,
        winnerEventTeamId,
        endedAt,
      }],
    });
    try {
      if (onSetComplete) await onSetComplete(nextPayload);
      else if (!(await emit(nextPayload))) return;
    } catch (error) {
      console.error('Failed to persist segment result:', error);
      alert('Failed to save segment result. Please retry.');
      return;
    } finally {
      setSegmentConfirming(false);
    }
    applyLocalSegmentState(next);
    const nextOpen = next.findIndex((segment) => segment.status !== 'COMPLETE');
    if (nextOpen >= 0) setActiveIndex(nextOpen);
    if (shouldFinalize && onMatchComplete && !onSetComplete && !onScoreChange) {
      await onMatchComplete({ ...nextPayload, eventId: tournament.$id });
    }
  };

  const saveMatch = async () => {
    setLoading(true);
    const endedAt = new Date().toISOString();
    const next = isTimedMatch
      ? segmentsRef.current.map((segment, index) => {
          if (index !== 0 || !team1Id || !team2Id) return segment;
          return {
            ...segment,
            status: 'COMPLETE',
            endedAt,
            winnerEventTeamId: team1Score > team2Score ? team1Id : team2Score > team1Score ? team2Id : null,
          } satisfies MatchSegment;
        })
      : segmentsRef.current;
    cancelPendingDirectScoreSync(true);
    const incidentQueueDrained = await drainIncidentQueueForConfirmation();
    if (!incidentQueueDrained) {
      setLoading(false);
      alert('Incident updates are still waiting to sync. Please retry once the queue starts moving.');
      return;
    }
    const shouldFinalize = matchComplete(next);
    const nextPayload = payload(next, {
      ...(shouldFinalize ? { finalize: true, time: endedAt } : {}),
      segmentOperations: next.map((segment) => ({
        id: segment.id,
        sequence: segment.sequence,
        status: segment.status,
        scores: segment.scores,
        winnerEventTeamId: segment.winnerEventTeamId ?? null,
        endedAt: segment.endedAt ?? (segment.status === 'COMPLETE' ? endedAt : null),
      })),
    });
    try {
      if (onScoreChange) await onScoreChange(nextPayload);
      else if (onSubmit) await onSubmit(match.$id, nextPayload.team1Points, nextPayload.team2Points, nextPayload.setResults);
      applyLocalSegmentState(next);
      if (shouldFinalize && onMatchComplete && !onScoreChange) {
        await onMatchComplete({ ...nextPayload, eventId: tournament.$id });
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
      ? applyLocalSegmentState(applyScoreDelta(segmentsRef.current, incidentTeamId, 1))
      : segmentsRef.current;
    const clockDetails = incidentClockDetails();
    const incidentOperation: MatchIncidentOperation = {
      action: 'CREATE',
      id: nextIncidentId(),
      segmentId: activeSegment.id,
      eventTeamId: incidentTeamId,
      eventRegistrationId: selectedParticipant?.eventRegistrationId ?? null,
      participantUserId: selectedParticipant?.participantUserId ?? null,
      incidentType,
      minute: clockDetails.minute,
      clock: clockDetails.clock,
      clockSeconds: clockDetails.clockSeconds,
      linkedPointDelta: isScoring ? 1 : null,
      note: incidentNote.trim() || null,
    };
    const optimisticIncident: MatchIncident = {
      id: incidentOperation.id!,
      eventId: tournament.$id ?? match.eventId ?? null,
      matchId: match.$id,
      segmentId: incidentOperation.segmentId ?? null,
      eventTeamId: incidentOperation.eventTeamId ?? null,
      eventRegistrationId: incidentOperation.eventRegistrationId ?? null,
      participantUserId: incidentOperation.participantUserId ?? null,
      officialUserId: null,
      incidentType: incidentOperation.incidentType ?? incidentType,
      sequence: allIncidents.length
        ? Math.max(...allIncidents.map((incident) => Number(incident.sequence) || 0)) + 1
        : 1,
      minute: incidentOperation.minute ?? null,
      clock: incidentOperation.clock ?? null,
      clockSeconds: incidentOperation.clockSeconds ?? null,
      linkedPointDelta: incidentOperation.linkedPointDelta ?? null,
      note: incidentOperation.note ?? null,
      metadata: null,
    };
    setOptimisticIncidents((current) => [
      ...current.filter((incident) => (entityId(incident) ?? incident.id) !== optimisticIncident.id),
      optimisticIncident,
    ]);
    enqueueIncidentOperation(incidentOperation);
    void processIncidentQueue();
    setIncidentMinute('');
    setIncidentNote('');
  };

  const checkIn = (assignment: any) => {
    void emit(payload(segmentsRef.current, {
      officialCheckIn: {
        positionId: assignment.positionId,
        slotIndex: assignment.slotIndex,
        userId: assignment.userId,
        checkedIn: true,
      },
    }));
  };

  const saveActualTimes = async (nextStart: Date | null, nextEnd: Date | null, options?: { markInProgress?: boolean }) => {
    if (nextStart && nextEnd && nextEnd.getTime() <= nextStart.getTime()) {
      alert('Actual end time must be after the actual start time.');
      return false;
    }
    const previousStart = actualStartValue;
    const previousEnd = actualEndValue;
    setActualTimesSaving(true);
    setActualStartValue(nextStart);
    setActualEndValue(nextEnd);
    const lifecycle: MatchLifecycleOperation = {
      ...(options?.markInProgress ? { status: 'IN_PROGRESS' } : {}),
      actualStart: nextStart ? nextStart.toISOString() : null,
      actualEnd: nextEnd ? nextEnd.toISOString() : null,
    };
    const success = await emit(payload(segmentsRef.current, { lifecycle }));
    setActualTimesSaving(false);
    if (!success) {
      setActualStartValue(previousStart);
      setActualEndValue(previousEnd);
      return false;
    }
    setEditingActualTimes(false);
    return true;
  };

  const startMatch = () => {
    void startActiveSegmentTimer();
  };

  const startActiveSegmentTimer = async () => {
    if (!canManage || !activeSegment || !hasMatchClock || activeSegmentStartDate) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const next = segmentsRef.current.map((segment, index) => (
      index === activeIndex
        ? {
            ...segment,
            status: segment.status === 'COMPLETE' ? segment.status : 'IN_PROGRESS',
            startedAt: nowIso,
            endedAt: null,
          } satisfies MatchSegment
        : segment
    ));
    const activeNext = next[activeIndex] ?? activeSegment;
    const shouldSetActualStart = !actualStartValue;
    const lifecycle: MatchLifecycleOperation | undefined = shouldSetActualStart
      ? { status: 'IN_PROGRESS', actualStart: nowIso, actualEnd: null }
      : { status: 'IN_PROGRESS' };
    setTimerSaving(true);
    ensureAudioContext();
    const success = await emit(payload(next, {
      lifecycle,
      segmentOperations: [{
        id: activeNext.id ?? activeNext.$id,
        sequence: activeNext.sequence,
        status: activeNext.status,
        scores: activeNext.scores,
        winnerEventTeamId: activeNext.winnerEventTeamId ?? null,
        startedAt: nowIso,
        endedAt: null,
      }],
    }));
    setTimerSaving(false);
    if (!success) return;
    regulationBeepKeyRef.current = null;
    setTimerNow(now.getTime());
    if (shouldSetActualStart) {
      setActualStartValue(now);
      setActualEndValue(null);
    }
    applyLocalSegmentState(next);
  };

  const resetActiveSegmentTimer = async () => {
    if (!canManage || !activeSegment || !hasMatchClock) return;
    const activeScores = activeSegment.scores ?? {};
    const hasScore = Object.values(activeScores).some((value) => score(value) > 0);
    const nextStatus = hasScore ? 'IN_PROGRESS' : 'NOT_STARTED';
    const next = segmentsRef.current.map((segment, index) => (
      index === activeIndex
        ? {
            ...segment,
            status: segment.status === 'COMPLETE' ? segment.status : nextStatus,
            startedAt: null,
            endedAt: null,
          } satisfies MatchSegment
        : segment
    ));
    const activeNext = next[activeIndex] ?? activeSegment;
    const isFirstOpenSegment = activeNext.sequence === 1
      && !next.some((segment) => segment.sequence < activeNext.sequence && segment.status === 'COMPLETE');
    const lifecycle: MatchLifecycleOperation | undefined = isFirstOpenSegment
      ? { status: 'SCHEDULED', actualStart: null, actualEnd: null }
      : undefined;
    setTimerSaving(true);
    const success = await emit(payload(next, {
      ...(lifecycle ? { lifecycle } : {}),
      segmentOperations: [{
        id: activeNext.id ?? activeNext.$id,
        sequence: activeNext.sequence,
        status: activeNext.status,
        scores: activeNext.scores,
        winnerEventTeamId: activeNext.winnerEventTeamId ?? null,
        startedAt: null,
        endedAt: null,
      }],
    }));
    setTimerSaving(false);
    if (!success) return;
    regulationBeepKeyRef.current = null;
    setTimerNow(Date.now());
    if (lifecycle) {
      setActualStartValue(null);
      setActualEndValue(null);
    }
    applyLocalSegmentState(next);
  };

  const closePendingIncidentModal = () => {
    setPendingPoint(null);
    setIncidentMinute("");
    setIncidentNote("");
  };

  const savePendingIncident = () => {
    if (!pendingPoint) return;
    if (selectedIncidentIsScoring) {
      const clockDetails = incidentClockDetails();
      createScoringIncident(pendingPoint.teamId, {
        participant: selectedParticipant,
        minute: clockDetails.minute,
        clock: clockDetails.clock,
        clockSeconds: clockDetails.clockSeconds,
        note: incidentNote,
      });
    } else {
      addIncident();
    }
    closePendingIncidentModal();
  };

  const handleClose = () => {
    closePendingIncidentModal();
    onClose();
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
  const canScore =
    canManage && activeSegment?.status !== "COMPLETE" && !matchComplete();
  const activeSegmentLabel = activeSegment
    ? labelForSegment(rules, activeSegment.sequence)
    : labelForSegment(rules, 1);
  const fieldName = match.field?.name?.trim() || "Field location";
  const venueName =
    match.field?.location?.trim() || tournament.location?.trim() || "";
  const fieldTitle =
    venueName && venueName !== fieldName
      ? `${fieldName} | ${venueName}`
      : fieldName;
  const matchReference =
    typeof match.matchId === "number"
      ? `Match #${match.matchId}`
      : `Match ${match.$id}`;
  const firstTarget = targetForSegment(0);
  const summaryParts =
    rules.scoringModel === "SETS"
      ? [
          `Best of ${rules.segmentCount} ${rules.segmentLabel.toLowerCase()}${rules.segmentCount === 1 ? "" : "s"}`,
          firstTarget ? `Rally to ${firstTarget}` : null,
          "Win by 2",
        ].filter((part): part is string => Boolean(part))
      : [rulesSummary(rules)];
  const team1SetsWon = segments.filter(
    (segment) => segment.winnerEventTeamId === team1Id,
  ).length;
  const team2SetsWon = segments.filter(
    (segment) => segment.winnerEventTeamId === team2Id,
  ).length;
  const statusColor =
    match.status === "COMPLETE"
      ? "green"
      : match.status === "IN_PROGRESS"
        ? "green"
        : match.status === "CANCELLED"
          ? "red"
          : "blue";
  const actualDurationLabel = (() => {
    if (!actualStartValue || !actualEndValue) return "Not set";
    const totalMinutes = Math.max(
      0,
      Math.round(
        (actualEndValue.getTime() - actualStartValue.getTime()) / 60000,
      ),
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  })();

  const totalForTeam = (
    eventTeamId: string | null,
    fallbackScores: number[] | undefined,
  ): number =>
    rules.scoringModel === "SETS"
      ? segments.filter((segment) => segment.winnerEventTeamId === eventTeamId)
          .length
      : segments.reduce(
          (total, segment, index) =>
            total +
            scoreForSegment(segment, index, eventTeamId, fallbackScores),
          0,
        );

  const segmentSummaryValue = (
    segment: MatchSegment,
    segmentIndex: number,
    eventTeamId: string | null,
    fallbackScores: number[] | undefined,
  ): string => {
    const value = scoreForSegment(
      segment,
      segmentIndex,
      eventTeamId,
      fallbackScores,
    );
    if (value > 0 || segment.status !== "NOT_STARTED") return String(value);
    return "-";
  };

  const renderDetailRow = (label: string, value: string, node?: ReactNode) => (
    <Group
      key={label}
      justify="space-between"
      gap="md"
      wrap="nowrap"
      style={{
        borderBottom: "1px solid var(--mantine-color-gray-2)",
        paddingBlock: 6,
      }}
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {node ?? (
        <Text size="sm" fw={600} ta="right">
          {value}
        </Text>
      )}
    </Group>
  );

  const renderOfficialsList = () => (
    <Stack gap="xs">
      {hasOfficials ? (
        <>
          {officialAssignments.map((assignment, index) => (
            <Group
              key={`${assignment.positionId}:${assignment.slotIndex}:${index}`}
              justify="space-between"
              gap="sm"
              wrap="nowrap"
            >
              <Text size="sm" style={{ minWidth: 0 }}>
                {officialPositionLabel(assignment)}:{" "}
                {officialNameLabel(assignment)}
                {assignment.checkedIn ? " (checked in)" : ""}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Badge
                  color={assignment.checkedIn ? "green" : "gray"}
                  variant="light"
                >
                  {assignment.checkedIn ? "Checked in" : "Not checked in"}
                </Badge>
                {canManage && !assignment.checkedIn && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => checkIn(assignment)}
                  >
                    Check in
                  </Button>
                )}
              </Group>
            </Group>
          ))}
          {hasTeamOfficial && (
            <Group
              key={`team-official-${teamOfficialId ?? teamName(teamOfficial)}`}
              justify="space-between"
              gap="sm"
              wrap="nowrap"
            >
              <Text size="sm" style={{ minWidth: 0 }}>
                Team official: {teamName(teamOfficial)}
                {match.officialCheckedIn ? " (checked in)" : ""}
              </Text>
              <Badge
                color={match.officialCheckedIn ? "green" : "gray"}
                variant="light"
              >
                {match.officialCheckedIn ? "Checked in" : "Not checked in"}
              </Badge>
            </Group>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          No official slots assigned.
        </Text>
      )}
    </Stack>
  );

  const renderMatchLogList = () => {
    const list = (
      <Stack gap="xs">
        {incidentsForDisplay.length ? (
          incidentsForDisplay.map((incident) => {
            const isScoringIncident = isScoringIncidentType(
              incident.incidentType,
              rules,
            );
            const incidentLabel = isScoringIncident
              ? scoringIncidentLabel
              : incidentLabelForType(incident.incidentType);
            return (
              <Paper key={incident.id} withBorder p="sm" radius="sm">
                <Group
                  justify="space-between"
                  align="flex-start"
                  gap="sm"
                  wrap="nowrap"
                >
                  <Group gap="sm" align="flex-start" style={{ minWidth: 0 }}>
                    <Badge
                      variant="light"
                      color={incidentBadgeColorForType(incident.incidentType, isScoringIncident)}
                    >
                      {incidentLabel}
                    </Badge>
                    <div style={{ minWidth: 0 }}>
                      {isScoringIncident ? (
                        <Text fw={600} size="sm">
                          {scoringIncidentDescription(incident)}
                        </Text>
                      ) : (
                        <>
                          <Text fw={600} size="sm">
                            {incidentLabelForType(incident.incidentType)}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {[
                              teamLabelForId(incident.eventTeamId),
                              incidentTimeLabel(incident),
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          </Text>
                        </>
                      )}
                      {!isScoringIncident && incident.note && (
                        <Text size="sm">{incident.note}</Text>
                      )}
                    </div>
                  </Group>
                  {canManage && (
                    <Group gap={4} wrap="nowrap">
                      <Button
                        aria-label={`Edit ${incidentLabel}`}
                        variant="subtle"
                        size="xs"
                        leftSection={<SquarePen size={14} />}
                        onClick={() => editIncident(incident)}
                        style={{ height: 28, paddingInline: 8 }}
                      >
                        Edit
                      </Button>
                      <ActionIcon
                        aria-label={`Remove ${incidentLabel}`}
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => removeIncident(incident)}
                      >
                        -
                      </ActionIcon>
                    </Group>
                  )}
                </Group>
              </Paper>
            );
          })
        ) : (
          <Text size="sm" c="dimmed">
            No match details recorded.
          </Text>
        )}
      </Stack>
    );

    return incidentsForDisplay.length > MATCH_LOG_VISIBLE_ITEM_COUNT ? (
      <ScrollArea.Autosize
        mah={MATCH_LOG_LIST_MAX_HEIGHT}
        type="auto"
        offsetScrollbars
        data-testid="match-log-scroll-area"
      >
        {list}
      </ScrollArea.Autosize>
    ) : list;
  };

  const renderIncidentForm = () =>
    canManage && manualIncidentTypes.length > 0 ? (
      <>
        <Divider />
        <Stack gap="xs">
          {editingIncidentId && <Text fw={600}>Edit Match Log</Text>}
          <Group grow align="flex-start">
            <Select
              label="Log type"
              data={manualIncidentTypes.map((type) => ({
                value: type,
                label: incidentLabelForType(type),
              }))}
              value={incidentType}
              onChange={(value) =>
                setIncidentType(value ?? defaultIncidentType)
              }
            />
            <Select
              label="Team"
              data={teamOptions}
              value={incidentTeamId}
              onChange={setIncidentTeamId}
              clearable
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label={
                rules.pointIncidentRequiresParticipant &&
                isScoringIncidentType(incidentType, rules)
                  ? "Player"
                  : "Player (optional)"
              }
              data={activeParticipantOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={incidentParticipantId}
              onChange={setIncidentParticipantId}
              clearable={
                !(
                  rules.pointIncidentRequiresParticipant &&
                  isScoringIncidentType(incidentType, rules)
                )
              }
              disabled={
                !incidentTeamId || activeParticipantOptions.length === 0
              }
            />
            <TextInput
              label="Minute"
              placeholder={rules.timekeeping.addedTimeEnabled ? "45+1" : "Optional"}
              inputMode={rules.timekeeping.addedTimeEnabled ? "text" : "numeric"}
              value={incidentMinute}
              onChange={(event) => setIncidentMinute(event.currentTarget.value)}
            />
          </Group>
          <Textarea
            label="Details"
            placeholder="Time, player, penalty, or note"
            value={incidentNote}
            onChange={(event) => setIncidentNote(event.currentTarget.value)}
            minRows={2}
          />
          <Group justify="flex-end">
            {editingIncidentId && (
              <Button variant="default" onClick={resetIncidentForm}>
                Cancel Edit
              </Button>
            )}
            <Button
              variant="light"
              onClick={editingIncidentId ? updateIncident : addIncident}
              disabled={
                rules.pointIncidentRequiresParticipant &&
                isScoringIncidentType(incidentType, rules) &&
                !selectedParticipant
              }
            >
              {editingIncidentId ? "Save Match Log" : "Add to Match Log"}
            </Button>
          </Group>
        </Stack>
      </>
    ) : null;

  const renderStatusCard = () => (
    <Paper withBorder p="md" radius="md" h="100%">
      <Stack gap="xs">
        <Group gap="xs">
          <ListChecks size={16} />
          <Text fw={700} size="sm">
            Status
          </Text>
        </Group>
        {renderDetailRow(
          "Match Status",
          titleCaseValue(match.status),
          <Badge color={statusColor} variant="light">
            {titleCaseValue(match.status)}
          </Badge>,
        )}
        {renderDetailRow(`Current ${rules.segmentLabel}`, activeSegmentLabel)}
        {renderDetailRow(
          rules.scoringModel === "SETS" ? "Sets Won" : "Segments Won",
          `${team1SetsWon} - ${team2SetsWon}`,
        )}
        {showStatusBlock && match.resultType
          ? renderDetailRow("Result", titleCaseValue(match.resultType))
          : null}
        {statusReason ? <Text size="sm">{statusReason}</Text> : null}
      </Stack>
    </Paper>
  );

  const renderActualTimesCard = (editable: boolean) => (
    <Paper withBorder p="md" radius="md" h="100%">
      <Stack gap="xs">
        <Group justify="space-between" align="center" gap="xs">
          <Group gap="xs">
            <Timer size={16} />
            <Text fw={700} size="sm">
              Actual Times
            </Text>
          </Group>
          {editable && canManage && !editingActualTimes && (
            <Button
              size="xs"
              variant="subtle"
              leftSection={<SquarePen size={14} />}
              onClick={() => setEditingActualTimes(true)}
            >
              Edit Times
            </Button>
          )}
        </Group>
        {editingActualTimes && editable ? (
          <Stack gap="xs">
            <DateTimePicker
              label="Actual start"
              value={actualStartValue}
              onChange={(value) => setActualStartValue(coerceActualDate(value))}
              withSeconds
              valueFormat="MM/DD/YYYY hh:mm:ss A"
              timePickerProps={MATCH_TIME_PICKER_PROPS}
              clearable
            />
            <DateTimePicker
              label="Actual end"
              value={actualEndValue}
              onChange={(value) => setActualEndValue(coerceActualDate(value))}
              withSeconds
              valueFormat="MM/DD/YYYY hh:mm:ss A"
              timePickerProps={MATCH_TIME_PICKER_PROPS}
              minDate={actualStartValue ?? undefined}
              clearable
            />
            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setActualStartValue(coerceActualDate(match.actualStart));
                  setActualEndValue(coerceActualDate(match.actualEnd));
                  setEditingActualTimes(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                loading={actualTimesSaving}
                onClick={() =>
                  void saveActualTimes(actualStartValue, actualEndValue)
                }
              >
                Save Times
              </Button>
            </Group>
          </Stack>
        ) : (
          <>
            {renderDetailRow("Scheduled Start", dateLabel(match.start ?? null))}
            {renderDetailRow(
              "Actual Start",
              dateLabel(actualStartValue?.toISOString() ?? null),
            )}
            {renderDetailRow(
              "Actual End",
              dateLabel(actualEndValue?.toISOString() ?? null),
            )}
            {renderDetailRow("Match Duration", actualDurationLabel)}
          </>
        )}
      </Stack>
    </Paper>
  );

  const renderTimerCard = () => {
    if (!hasMatchClock) return null;
    const timerStarted = Boolean(activeSegmentStartDate);
    const timerActionLabel = timerStarted
      ? 'Reset Timer'
      : activeSegment?.sequence === 1 && !actualStartValue
        ? 'Start Match'
        : `Start ${activeSegmentLabel}`;
    return (
      <Paper withBorder p="md" radius="md" h="100%">
        <Stack gap="sm">
          <Group justify="space-between" align="center" gap="xs">
            <Group gap="xs">
              <Timer size={16} />
              <Text fw={700} size="sm">
                Match Clock
              </Text>
            </Group>
            <Badge
              color={activeTimerRunning ? 'green' : regulationClockEnded ? 'red' : timerStarted ? 'gray' : 'blue'}
              variant="light"
            >
              {activeTimerRunning ? 'Running' : regulationClockEnded ? 'Regulation ended' : timerStarted ? 'Stopped' : 'Ready'}
            </Badge>
          </Group>
          <div>
            <Text size="xs" c="dimmed" fw={700}>
              {activeSegmentLabel}
            </Text>
            <Text
              fw={800}
              lh={1}
              style={{ fontVariantNumeric: 'tabular-nums', fontSize: 42 }}
              c={clockInAddedTime ? 'orange' : regulationClockEnded ? 'red' : undefined}
            >
              {clockDisplay}
            </Text>
            <Text size="xs" c="dimmed">
              {activeSegmentDurationMinutes
                ? `${activeSegmentDurationMinutes} minute regulation ${rules.segmentLabel.toLowerCase()}`
                : 'No regulation length configured'}
              {rules.timekeeping.addedTimeEnabled ? ' with added time' : ''}
            </Text>
          </div>
          {canManage ? (
            <Group gap="xs">
              <Button
                size="xs"
                loading={timerSaving}
                disabled={activeSegment?.status === 'COMPLETE'}
                onClick={timerStarted ? resetActiveSegmentTimer : startMatch}
              >
                {timerActionLabel}
              </Button>
              {regulationClockEnded ? (
                <Text size="xs" c="red" fw={600}>
                  Regulation time reached.
                </Text>
              ) : null}
            </Group>
          ) : null}
        </Stack>
      </Paper>
    );
  };

  const renderOfficialsCard = () => (
    <Paper withBorder p="md" radius="md" h="100%">
      <Stack gap="sm">
        <Group gap="xs">
          <ShieldCheck size={16} />
          <Text fw={700} size="sm">
            Officials
          </Text>
        </Group>
        {renderOfficialsList()}
      </Stack>
    </Paper>
  );

  const renderMatchLogCard = () => (
    <Paper withBorder p="md" radius="md" h="100%">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ListChecks size={16} />
            <Text fw={700} size="sm">
              Match Log
            </Text>
          </Group>
        </Group>
        {renderMatchLogList()}
        {renderIncidentForm()}
      </Stack>
    </Paper>
  );

  const renderReadOnlyDetails = () => (
    <Tabs defaultValue="log" mt="md">
      <Tabs.List>
        <Tabs.Tab value="log" leftSection={<ListChecks size={14} />}>
          Match Log
        </Tabs.Tab>
        <Tabs.Tab value="notes" leftSection={<CalendarDays size={14} />}>
          Notes
        </Tabs.Tab>
        <Tabs.Tab value="officials" leftSection={<ShieldCheck size={14} />}>
          Officials
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="log" pt="sm">
        {renderMatchLogList()}
      </Tabs.Panel>
      <Tabs.Panel value="notes" pt="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {renderStatusCard()}
          {renderActualTimesCard(false)}
        </SimpleGrid>
      </Tabs.Panel>
      <Tabs.Panel value="officials" pt="sm">
        {renderOfficialsList()}
      </Tabs.Panel>
    </Tabs>
  );

  const renderSegmentTabs = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${segments.length + 1}, minmax(0, 1fr))`,
        borderBottom: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      {segments.map((segment, index) => (
        <button
          key={`tab-${segment.id}`}
          type="button"
          onClick={() => setActiveIndex(index)}
          style={{
            appearance: "none",
            background: "transparent",
            border: 0,
            borderBottom:
              index === activeIndex
                ? "2px solid var(--mantine-primary-color-filled)"
                : "2px solid transparent",
            color:
              index === activeIndex
                ? "var(--mantine-primary-color-filled)"
                : "var(--mantine-color-gray-6)",
            cursor: "pointer",
            font: "inherit",
            fontSize: 14,
            fontWeight: index === activeIndex ? 700 : 500,
            padding: "10px 8px",
          }}
        >
          {labelForSegment(rules, segment.sequence)}
        </button>
      ))}
      <Text ta="center" size="sm" fw={500} c="dimmed" py={10}>
        Total
      </Text>
    </div>
  );

  const renderTeamScoreCard = (
    slotKey: 'team1' | 'team2',
    team: Match["team1"] | Match["team2"],
    eventTeamId: string | null,
    current: number,
    displayName: string,
    fallbackScores: number[] | undefined,
  ) => {
    const total = totalForTeam(eventTeamId, fallbackScores);
    return (
      <Paper
        key={eventTeamId ?? slotKey}
        withBorder
        p="md"
        radius="md"
        h="100%"
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group
              gap="sm"
              wrap="nowrap"
              style={{ minWidth: 0, flex: "1 1 0" }}
            >
              {team && (
                <Avatar
                  src={getTeamAvatarUrl(team, 56)}
                  radius="xl"
                  size={56}
                  alt={displayName}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <Text
                  fw={700}
                  title={displayName}
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName}
                </Text>
                {canManage && (
                  <Text size="xs" fw={700} c="blue">
                    {activeSegmentLabel}
                  </Text>
                )}
              </div>
            </Group>
            {!canManage && (
              <Text fw={800} size="2rem" lh={1}>
                {current}
              </Text>
            )}
          </Group>

          {canManage ? (
            <>
              <Group justify="center" gap="xl" wrap="nowrap">
                {canScore && !scoringUsesIncidentWorkflow && (
                  <ActionIcon
                    variant="light"
                    color="blue"
                    onClick={() => requestScore(eventTeamId, -1)}
                    disabled={current === 0}
                  >
                    -
                  </ActionIcon>
                )}
                <Text ta="center" fw={800} size="2.5rem" lh={1}>
                  {current}
                </Text>
                {canScore && !scoringUsesIncidentWorkflow && (
                  <ActionIcon
                    variant="light"
                    color="blue"
                    onClick={() => requestScore(eventTeamId, 1)}
                    disabled={!canIncreaseTeamScore(eventTeamId)}
                  >
                    +
                  </ActionIcon>
                )}
              </Group>
              {canScore && scoringUsesIncidentWorkflow && eventTeamId && (
                <Group justify="center">
                  <Button
                    size="xs"
                    onClick={() => requestScore(eventTeamId, 1)}
                    disabled={!canIncreaseTeamScore(eventTeamId)}
                  >
                    Add Incident
                  </Button>
                </Group>
              )}
            </>
          ) : null}

          <Divider />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${segments.length + 1}, minmax(48px, 1fr))`,
              gap: 4,
            }}
          >
            {segments.map((segment, segmentIndex) => {
              const active = segmentIndex === activeIndex;
              const won = segment.winnerEventTeamId === eventTeamId;
              return (
                <div
                  key={`${eventTeamId}-${segment.id}`}
                  style={{
                    borderRadius: 6,
                    padding: "6px 4px",
                    textAlign: "center",
                    background: active
                      ? "var(--mantine-color-blue-light)"
                      : won
                        ? "var(--mantine-color-green-light)"
                        : "transparent",
                  }}
                >
                  <Text
                    size="xs"
                    fw={active ? 700 : 500}
                    c={active ? "blue" : "dimmed"}
                  >
                    {labelForSegment(rules, segment.sequence)}
                  </Text>
                  <Text size="sm" fw={700}>
                    {segmentSummaryValue(
                      segment,
                      segmentIndex,
                      eventTeamId,
                      fallbackScores,
                    )}
                  </Text>
                </div>
              );
            })}
            <div
              style={{
                borderRadius: 6,
                padding: "6px 4px",
                textAlign: "center",
              }}
            >
              <Text size="xs" c="dimmed">
                Total
              </Text>
              <Text size="sm" fw={700}>
                {total}
              </Text>
            </div>
          </div>
        </Stack>
      </Paper>
    );
  };

  const content = (
    <Stack gap="lg" p={embedded ? 0 : "lg"}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text c="blue" size="sm" fw={700}>
            {matchReference}
          </Text>
          <Text fw={800} size="xl">
            {team1Label} vs {team2Label}
          </Text>
          <Text c="dimmed" size="sm">
            {summaryParts.join("  |  ")}
          </Text>
        </div>
        <Group gap="sm" wrap="nowrap">
          <Badge color={statusColor} variant="light" size="lg">
            {titleCaseValue(match.status)}
          </Badge>
          {!embedded && (
            <ActionIcon
              aria-label="Close match operations"
              variant="subtle"
              color="gray"
              onClick={handleClose}
            >
              <X size={18} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      <Paper withBorder p="md" radius="md" shadow="xs">
        <Group justify="space-between" align="center" gap="md" wrap="wrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIconLike>
              <Table2 size={18} />
            </ThemeIconLike>
            <Text fw={700} style={{ minWidth: 0 }}>
              {fieldTitle}
            </Text>
          </Group>
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<MapPin size={14} />}
              rightSection={<ChevronRight size={14} />}
              disabled={!mapEmbedSrc}
              onClick={() => setShowFieldMap((value) => !value)}
            >
              {showFieldMap ? "Hide Field Location" : "View Field Location"}
            </Button>
            {canManage && googleMapsLink && (
              <Button
                component="a"
                href={googleMapsLink}
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                size="xs"
                leftSection={<ExternalLink size={14} />}
              >
                Open in Maps
              </Button>
            )}
          </Group>
        </Group>
        {!canManage && (
          <>
            <Divider my="sm" />
            <Group
              justify="space-between"
              align="center"
              gap="sm"
              wrap="nowrap"
            >
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                leftSection={<ListChecks size={16} />}
                rightSection={
                  showDetails ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )
                }
                onClick={() => setShowDetails((value) => !value)}
                styles={{ root: { paddingInline: 0 } }}
              >
                Match Details
              </Button>
              {googleMapsLink && (
                <Button
                  component="a"
                  href={googleMapsLink}
                  target="_blank"
                  rel="noreferrer"
                  variant="default"
                  size="xs"
                  leftSection={<ExternalLink size={14} />}
                >
                  Open in Maps
                </Button>
              )}
            </Group>
            <Collapse in={showDetails}>{renderReadOnlyDetails()}</Collapse>
          </>
        )}
        {showFieldMap && mapEmbedSrc && (
          <div
            className="mt-3 overflow-hidden rounded-md border border-gray-200"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              title="Match field location preview"
              src={mapEmbedSrc}
              className="h-full w-full"
              loading="lazy"
              allowFullScreen
            />
          </div>
        )}
      </Paper>

      {renderSegmentTabs()}

      <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {renderTeamScoreCard(
          "team1",
          team1,
          team1Id,
          team1Score,
          team1Label,
          match.team1Points,
        )}
        <Group justify="center" align="center">
          <Badge variant="outline" color="gray" radius="xl">
            VS
          </Badge>
        </Group>
        {renderTeamScoreCard(
          "team2",
          team2,
          team2Id,
          team2Score,
          team2Label,
          match.team2Points,
        )}
      </div>

      {canManage && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: hasMatchClock ? 3 : 2 }} spacing="md">
            {renderStatusCard()}
            {renderTimerCard()}
            {renderActualTimesCard(true)}
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {renderOfficialsCard()}
            {renderMatchLogCard()}
          </SimpleGrid>
        </Stack>
      )}

      {(!embedded || (canManage && !hideStatusControls)) && (
        <>
          <Divider />
          <Group justify={embedded ? "flex-end" : "space-between"}>
            {!embedded && (
              <Button variant="default" onClick={handleClose}>
                Close
              </Button>
            )}
            {!hideStatusControls && (
              <Group>
                {canManage && !actualStartValue && !hasMatchClock && (
                  <Button onClick={() => void saveActualTimes(new Date(), actualEndValue, { markInProgress: true })} loading={actualTimesSaving}>
                    Start Match
                  </Button>
                )}
                {canManage &&
                  activeSegment?.status !== "COMPLETE" &&
                  (!isTimedMatch || rules.scoringModel !== "POINTS_ONLY") && (
                    <Button
                      onClick={confirmSegment}
                      loading={segmentConfirming}
                      disabled={
                        segmentConfirming ||
                        (rules.scoringModel === "SETS" && !setWinConditionMet())
                      }
                    >
                      Confirm {labelForSegment(rules, activeSegment?.sequence ?? 1)}
                    </Button>
                  )}
                {canManage &&
                  isTimedMatch &&
                  rules.scoringModel === "POINTS_ONLY" && (
                    <Button onClick={saveMatch} loading={loading}>
                      Finish Match
                    </Button>
                  )}
              </Group>
            )}
          </Group>
        </>
      )}
    </Stack>
  );

  const pendingIncidentModal = (
    <Modal
      opened={isOpen && Boolean(pendingPoint)}
      onClose={closePendingIncidentModal}
      centered
      size="md"
      title="Record Incident"
      zIndex={300}
    >
      <Stack gap="xs">
        <Select
          label="Log type"
          data={manualIncidentTypes.map((type) => ({
            value: type,
            label: incidentLabelForType(type),
          }))}
          value={incidentType}
          onChange={(value) =>
            setIncidentType(value ?? scoringIncidentType)
          }
        />
        <Select
          label={
            selectedIncidentRequiresParticipant
              ? "Player"
              : "Player (optional)"
          }
          data={activeParticipantOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={incidentParticipantId}
          onChange={setIncidentParticipantId}
          clearable={!selectedIncidentRequiresParticipant}
          disabled={activeParticipantOptions.length === 0}
        />
        <TextInput
          label="Minute"
          placeholder={rules.timekeeping.addedTimeEnabled ? "45+1" : "Optional"}
          inputMode={rules.timekeeping.addedTimeEnabled ? "text" : "numeric"}
          value={incidentMinute}
          onChange={(event) => setIncidentMinute(event.currentTarget.value)}
        />
        <Textarea
          label="Details"
          placeholder="Time, player, or note"
          value={incidentNote}
          onChange={(event) => setIncidentNote(event.currentTarget.value)}
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={closePendingIncidentModal}>
            Cancel
          </Button>
          <Button
            onClick={savePendingIncident}
            disabled={
              selectedIncidentRequiresParticipant && !selectedParticipant
            }
          >
            Save Incident
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  if (embedded) {
    return isOpen ? (
      <>
        {content}
        {pendingIncidentModal}
      </>
    ) : null;
  }

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={handleClose}
        centered
        size={canManage ? 980 : 760}
        withCloseButton={false}
        padding={0}
      >
        {content}
      </Modal>
      {pendingIncidentModal}
    </>
  );
}

function ThemeIconLike({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "var(--mantine-color-blue-light)",
        borderRadius: 8,
        color: "var(--mantine-primary-color-filled)",
        display: "inline-flex",
        flex: "0 0 auto",
        height: 36,
        justifyContent: "center",
        width: 36,
      }}
    >
      {children}
    </div>
  );
}
