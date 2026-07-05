'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { Trash2, X } from 'lucide-react';

import { parseLocalDateTime } from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { getSetScoreState, resolveSetVictoryTarget } from '@/lib/matchSetScoring';
import { filterValidNextMatchCandidates, validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';

import type { Event, EventOfficial, EventOfficialPosition, Field, Match, MatchOfficialAssignment, MatchSegment, ResolvedMatchRules, Team, UserData } from '@/types';

import ScoreUpdateModal from './ScoreUpdateModal';

type ScoreUpdateModalComponentProps = ComponentProps<typeof ScoreUpdateModal>;
type MatchStatusRules = Pick<ResolvedMatchRules, 'scoringModel' | 'segmentCount' | 'segmentLabel'>;

const EMPTY_MATCHES: Match[] = [];
const EMPTY_FIELDS: Field[] = [];
const EMPTY_TEAMS: Team[] = [];
const EMPTY_USERS: UserData[] = [];
const EMPTY_OFFICIAL_POSITIONS: EventOfficialPosition[] = [];
const EMPTY_EVENT_OFFICIALS: EventOfficial[] = [];
const RESULT_TYPE_OPTIONS = [
  { value: 'REGULATION', label: 'Regulation result' },
  { value: 'FORFEIT', label: 'Forfeit' },
  { value: 'NO_CONTEST', label: 'No contest / cancelled' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

interface MatchEditModalProps {
  opened: boolean;
  match: Match | null;
  tournament?: Event | null;
  allMatches?: Match[];
  fields?: Field[];
  teams?: Team[];
  participantTeams?: Team[];
  officials?: UserData[];
  officialPositions?: EventOfficialPosition[];
  eventOfficials?: EventOfficial[];
  doTeamsOfficiate?: boolean;
  canManageOperations?: boolean;
  isCreateMode?: boolean;
  creationContext?: 'schedule' | 'bracket';
  eventType?: string | null;
  enforceScheduleFields?: boolean;
  onScoreChange?: ScoreUpdateModalComponentProps['onScoreChange'];
  onSetComplete?: ScoreUpdateModalComponentProps['onSetComplete'];
  onScoreSubmit?: ScoreUpdateModalComponentProps['onSubmit'];
  onMatchComplete?: ScoreUpdateModalComponentProps['onMatchComplete'];
  team1Placeholder?: string;
  team2Placeholder?: string;
  onClose: () => void;
  onSave: (updated: Match) => void;
  onDelete?: (target: Match) => void;
}

const MATCH_TIME_PICKER_PROPS = {
  format: '12h' as const,
  withDropdown: false,
  amPmLabels: { am: 'AM', pm: 'PM' },
};

const coerceDate = (value?: string | Date | null): Date | null => parseLocalDateTime(value ?? null);
const coerceInstantDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const positiveIntOrNull = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
};

const nonNegativeScore = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
};

const pointsList = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value
    .map((entry) => positiveIntOrNull(entry))
    .filter((entry): entry is number => entry !== null);
  return normalized.length ? normalized : null;
};

const targetsToInput = (targets: number[] | null | undefined): string => (
  Array.isArray(targets) && targets.length > 0 ? targets.join(', ') : ''
);

const parseTargetsInput = (value: string): number[] => (
  value
    .split(',')
    .map((entry) => positiveIntOrNull(entry.trim()))
    .filter((entry): entry is number => entry !== null)
);

const resizeTargets = (targets: number[], segmentCount: number, fallbackTarget = 21): number[] => {
  const count = Math.max(1, segmentCount);
  const next = targets.slice(0, count);
  const fill = next[next.length - 1] ?? fallbackTarget;
  while (next.length < count) {
    next.push(fill);
  }
  return next;
};

const normalizeScoringModel = (value: unknown, fallback: ResolvedMatchRules['scoringModel'] = 'SETS'): ResolvedMatchRules['scoringModel'] => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ['SETS', 'PERIODS', 'INNINGS', 'POINTS_ONLY'].includes(normalized)
    ? normalized as ResolvedMatchRules['scoringModel']
    : fallback;
};

const resolveEditablePolicySource = (
  match: Match,
  event: Event | null | undefined,
): Partial<ResolvedMatchRules> => ({
  ...((event?.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>),
  ...((match.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>),
  ...((match.matchRulesSnapshot || {}) as Partial<ResolvedMatchRules>),
});

const statusExistingSegmentCount = (match: Match): number => Math.max(
  Array.isArray(match.segments) ? match.segments.length : 0,
  Array.isArray(match.team1Points) ? match.team1Points.length : 0,
  Array.isArray(match.team2Points) ? match.team2Points.length : 0,
  Array.isArray(match.setResults) ? match.setResults.length : 0,
  0,
);

const actualSetCount = (match: Match, statusSegments?: MatchSegment[] | null): number => Math.max(
  Array.isArray(statusSegments) ? statusSegments.length : 0,
  statusExistingSegmentCount(match),
  1,
);

const resolveStatusRules = (match: Match, event: Event | null | undefined): MatchStatusRules => {
  const usesSets = typeof event?.usesSets === 'boolean' ? event.usesSets : Boolean(event?.leagueConfig?.usesSets);
  const eventRules = (event?.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchResolvedRules = (match.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const matchSnapshotRules = (match.matchRulesSnapshot || {}) as Partial<ResolvedMatchRules>;
  const source = { ...eventRules, ...matchResolvedRules, ...matchSnapshotRules };
  const scoringModel = source.scoringModel ?? (usesSets ? 'SETS' : 'POINTS_ONLY');
  const sourceSegmentCount = positiveIntOrNull(source.segmentCount);
  const configuredSegmentCount = scoringModel === 'SETS'
    ? positiveIntOrNull((event as any)?.setsPerMatch)
      ?? positiveIntOrNull(event?.leagueConfig?.setsPerMatch)
      ?? positiveIntOrNull((event as any)?.winnerSetCount)
      ?? 1
    : 1;
  const segmentCount = scoringModel === 'POINTS_ONLY'
    ? 1
    : match.matchRulesSnapshot && sourceSegmentCount
      ? Math.max(sourceSegmentCount, statusExistingSegmentCount(match), 1)
      : Math.max(sourceSegmentCount ?? 0, configuredSegmentCount, statusExistingSegmentCount(match), 1);
  const segmentLabel = source.segmentLabel
    || (scoringModel === 'SETS' ? 'Set' : scoringModel === 'INNINGS' ? 'Inning' : scoringModel === 'POINTS_ONLY' ? 'Match' : 'Half');
  return { scoringModel, segmentCount, segmentLabel };
};

const statusLabelForSegment = (rules: MatchStatusRules, sequence: number): string => (
  rules.scoringModel === 'POINTS_ONLY' ? 'Match' : `${rules.segmentLabel} ${sequence}`
);

const segmentScoreForTeam = (
  segment: MatchSegment | undefined,
  index: number,
  eventTeamId: string | null,
  fallbackScores: number[] | undefined,
): number => (
  eventTeamId
    ? nonNegativeScore(segment?.scores?.[eventTeamId] ?? fallbackScores?.[index])
    : nonNegativeScore(fallbackScores?.[index])
);

const buildStatusSegments = (
  match: Match,
  rules: MatchStatusRules,
  team1Id: string | null,
  team2Id: string | null,
): MatchSegment[] => {
  const sortedSegments = Array.isArray(match.segments)
    ? [...match.segments].sort((left, right) => left.sequence - right.sequence)
    : [];
  const segmentBySequence = new Map(sortedSegments.map((segment) => [segment.sequence, segment]));
  const matchId = normalizeOptionalId(match.$id) ?? normalizeOptionalId((match as any).id) ?? 'match';

  return Array.from({ length: rules.segmentCount }, (_, index) => {
    const sequence = index + 1;
    const existing = segmentBySequence.get(sequence);
    const team1Score = segmentScoreForTeam(existing, index, team1Id, match.team1Points);
    const team2Score = segmentScoreForTeam(existing, index, team2Id, match.team2Points);
    const scores: Record<string, number> = {};
    if (team1Id) scores[team1Id] = team1Score;
    if (team2Id) scores[team2Id] = team2Score;
    const legacyResult = nonNegativeScore(match.setResults?.[index]);
    const winnerEventTeamId = existing?.winnerEventTeamId
      ?? (legacyResult === 1 ? team1Id : legacyResult === 2 ? team2Id : null);

    return {
      id: existing?.id ?? existing?.$id ?? `${matchId}_segment_${sequence}`,
      $id: existing?.$id ?? existing?.id ?? `${matchId}_segment_${sequence}`,
      eventId: existing?.eventId ?? match.eventId ?? null,
      matchId,
      sequence,
      status: existing?.status ?? (winnerEventTeamId ? 'COMPLETE' : team1Score > 0 || team2Score > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'),
      scores: existing?.scores ? { ...existing.scores } : scores,
      winnerEventTeamId,
      startedAt: existing?.startedAt ?? null,
      endedAt: existing?.endedAt ?? null,
      resultType: existing?.resultType ?? null,
      statusReason: existing?.statusReason ?? null,
      metadata: existing?.metadata ?? null,
    };
  });
};

const statusLegacyFromSegments = (
  segments: MatchSegment[],
  team1Id: string | null,
  team2Id: string | null,
) => {
  const team1Points = segments.map((segment) => team1Id ? nonNegativeScore(segment.scores?.[team1Id]) : 0);
  const team2Points = segments.map((segment) => team2Id ? nonNegativeScore(segment.scores?.[team2Id]) : 0);
  return {
    team1Points,
    team2Points,
    setResults: segments.map((segment, index) => {
      if (segment.winnerEventTeamId === team1Id) return 1;
      if (segment.winnerEventTeamId === team2Id) return 2;
      if (segment.status === 'COMPLETE' && team1Points[index] !== team2Points[index]) {
        return team1Points[index] > team2Points[index] ? 1 : 2;
      }
      return 0;
    }),
  };
};

const segmentWinnerEventTeamId = (segment: MatchSegment, team1Id: string | null, team2Id: string | null): string | null => {
  const team1Score = team1Id ? nonNegativeScore(segment.scores?.[team1Id]) : 0;
  const team2Score = team2Id ? nonNegativeScore(segment.scores?.[team2Id]) : 0;
  if (team1Score > team2Score) return team1Id;
  if (team2Score > team1Score) return team2Id;
  return null;
};

const hasAnySegmentScore = (segment: MatchSegment): boolean => (
  Object.values(segment.scores ?? {}).some((value) => nonNegativeScore(value) > 0)
);

const resetSegmentConfirmation = (segment: MatchSegment): MatchSegment => ({
  ...segment,
  status: hasAnySegmentScore(segment) ? 'IN_PROGRESS' : 'NOT_STARTED',
  winnerEventTeamId: null,
  endedAt: null,
  resultType: null,
  statusReason: null,
});

const statusMatchComplete = (
  segments: MatchSegment[],
  rules: MatchStatusRules,
  team1Id: string | null,
  team2Id: string | null,
): boolean => {
  if (!team1Id || !team2Id) return false;
  if (rules.scoringModel === 'SETS') {
    const winsNeeded = Math.max(1, Math.ceil(rules.segmentCount / 2));
    const team1Wins = segments.filter((segment) => segment.winnerEventTeamId === team1Id).length;
    const team2Wins = segments.filter((segment) => segment.winnerEventTeamId === team2Id).length;
    return team1Wins >= winsNeeded || team2Wins >= winsNeeded;
  }
  return segments.every((segment) => segment.status === 'COMPLETE');
};

const resolveCompletedMatchWinner = (
  segments: MatchSegment[],
  rules: MatchStatusRules,
  team1Id: string | null,
  team2Id: string | null,
): string | null => {
  if (!statusMatchComplete(segments, rules, team1Id, team2Id)) {
    return null;
  }
  if (!team1Id || !team2Id) {
    return null;
  }
  if (rules.scoringModel === 'SETS') {
    const team1Wins = segments.filter((segment) => segment.winnerEventTeamId === team1Id).length;
    const team2Wins = segments.filter((segment) => segment.winnerEventTeamId === team2Id).length;
    if (team1Wins === team2Wins) return null;
    return team1Wins > team2Wins ? team1Id : team2Id;
  }
  const totals = statusLegacyFromSegments(segments, team1Id, team2Id);
  const team1Total = totals.team1Points.reduce((total, score) => total + score, 0);
  const team2Total = totals.team2Points.reduce((total, score) => total + score, 0);
  if (team1Total === team2Total) return null;
  return team1Total > team2Total ? team1Id : team2Id;
};

const resolveStatusPointTargets = (match: Match, event: Event | null | undefined): number[] | null => {
  const matchTargets = pointsList((match.matchRulesSnapshot as any)?.setPointTargets)
    ?? pointsList((match.resolvedMatchRules as any)?.setPointTargets);
  if (matchTargets) return matchTargets;

  const matchDivisionId = typeof match.division === 'string'
    ? normalizeOptionalId(match.division)
    : normalizeOptionalId((match.division as any)?.id) ?? normalizeOptionalId((match.division as any)?.$id);
  const divisionSources = [
    event?.divisionDetails,
    event?.playoffDivisionDetails,
    event?.divisions,
  ];
  for (const source of divisionSources) {
    if (!Array.isArray(source)) continue;
    const division = source.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const id = normalizeOptionalId((entry as any).id) ?? normalizeOptionalId((entry as any).$id);
      return id && matchDivisionId && id.toLowerCase() === matchDivisionId.toLowerCase();
    }) as any;
    const divisionTargets = pointsList(division?.pointsToVictory) ?? pointsList(division?.leagueConfig?.pointsToVictory);
    if (divisionTargets) return divisionTargets;
  }

  return pointsList((event as any)?.pointsToVictory)
    ?? pointsList(event?.leagueConfig?.pointsToVictory)
    ?? pointsList((event as any)?.winnerBracketPointsToVictory);
};

export const actualMatchTimePayload = (
  actualStart: Date | null,
  actualEnd: Date | null,
): Pick<Match, 'actualStart' | 'actualEnd'> => ({
  actualStart: actualStart ? actualStart.toISOString() : null,
  actualEnd: actualEnd ? actualEnd.toISOString() : null,
});

const getEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as { $id?: unknown; id?: unknown };
  const idCandidate = typeof row.$id === 'string' && row.$id.trim().length > 0
    ? row.$id
    : typeof row.id === 'string' && row.id.trim().length > 0
      ? row.id
      : null;
  return idCandidate ? idCandidate.trim() : null;
};

const normalizeOptionalId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveMatchTeamId = (match: Match | null | undefined, slot: 'team1' | 'team2'): string | null => {
  if (!match) {
    return null;
  }
  const idFromField = slot === 'team1'
    ? normalizeOptionalId(match.team1Id)
    : normalizeOptionalId(match.team2Id);
  if (idFromField) {
    return idFromField;
  }
  return slot === 'team1' ? getTeamId(match.team1) : getTeamId(match.team2);
};

const resolveTeamName = (team: Match['team1'], fallbackTeams: Team[]): string => {
  if (team && typeof team === 'object') {
    if ('name' in team && team?.name) {
      return team.name as string;
    }
    if ('players' in team && Array.isArray((team as any).players) && (team as any).players.length > 0) {
      const compact = (team as any).players.map((player: any) => {
        const piece = [player.firstName, player.lastName].filter(Boolean).join(' ');
        return piece || 'Player';
      });
      if (compact.length > 0) {
        return compact.join(' & ');
      }
    }
  }

  const rawId = getEntityId(team);
  if (rawId) {
    const matchTeam = fallbackTeams.find((candidate) => getEntityId(candidate) === rawId);
    if (matchTeam?.name) {
      return matchTeam.name;
    }
  }

  return 'TBD';
};

const getTeamId = (team?: Match['team1']): string | null => {
  if (!team) return null;
  return getEntityId(team);
};

const getUserId = (user?: Match['official']): string | null => {
  if (!user) return null;
  return getEntityId(user);
};

const encodeAssignmentValue = (holderType: MatchOfficialAssignment['holderType'], id: string) => `${holderType}:${id}`;

const decodeAssignmentValue = (
  value: string | null,
): { holderType: MatchOfficialAssignment['holderType']; id: string } | null => {
  if (!value) {
    return null;
  }
  const [holderType, ...rest] = value.split(':');
  const id = rest.join(':').trim();
  if (!id || (holderType !== 'OFFICIAL' && holderType !== 'PLAYER')) {
    return null;
  }
  return { holderType, id };
};

const normalizeAssignments = (value: unknown): MatchOfficialAssignment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: Array<MatchOfficialAssignment | null> = value
    .map((entry): MatchOfficialAssignment | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const positionId = normalizeOptionalId(row.positionId)
        ?? normalizeOptionalId(typeof row.position === 'string' ? row.position : getEntityId(row.position))
        ?? '';
      const userId = normalizeOptionalId(row.userId)
        ?? normalizeOptionalId(row.officialId)
        ?? '';
      const slotIndexRaw = row.slotIndex ?? row.slot ?? 0;
      const slotIndex = Number(slotIndexRaw);
      const holderTypeToken = typeof row.holderType === 'string' ? row.holderType.trim().toUpperCase() : '';
      const isLegacyOfficialAssignment = Boolean(
        normalizeOptionalId(row.officialId)
        || normalizeOptionalId(row.eventOfficialId),
      );
      const holderType = holderTypeToken === 'PLAYER'
        ? 'PLAYER'
        : holderTypeToken === 'OFFICIAL' || isLegacyOfficialAssignment
          ? 'OFFICIAL'
          : null;
      if (!positionId || !userId || !holderType || !Number.isInteger(slotIndex) || slotIndex < 0) {
        return null;
      }
      return {
        positionId,
        slotIndex,
        holderType,
        userId,
        eventOfficialId: typeof row.eventOfficialId === 'string' && row.eventOfficialId.trim().length > 0
          ? row.eventOfficialId.trim()
          : undefined,
        checkedIn: typeof row.checkedIn === 'boolean' ? row.checkedIn : undefined,
        hasConflict: typeof row.hasConflict === 'boolean' ? row.hasConflict : undefined,
      };
    });
  return normalized.filter((entry): entry is MatchOfficialAssignment => entry !== null);
};

const formatUserLabel = (user?: Partial<UserData> | null): string => {
  if (!user) return 'Official';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (name) {
    return name;
  }
  if (user.userName) {
    return user.userName;
  }
  return 'Official';
};

const findTeamById = (id: string | null, allTeams: Team[], fallback?: Match['team1']): Team | undefined => {
  if (!id) return undefined;
  const fromList = allTeams.find((team) => getEntityId(team) === id);
  if (fromList) return fromList;
  if (fallback && typeof fallback === 'object' && getEntityId(fallback) === id) {
    return fallback as Team;
  }
  return undefined;
};

export default function MatchEditModal({
  opened,
  match,
  tournament = null,
  allMatches = EMPTY_MATCHES,
  fields = EMPTY_FIELDS,
  teams = EMPTY_TEAMS,
  participantTeams = EMPTY_TEAMS,
  officials = EMPTY_USERS,
  officialPositions = EMPTY_OFFICIAL_POSITIONS,
  eventOfficials = EMPTY_EVENT_OFFICIALS,
  doTeamsOfficiate = false,
  canManageOperations = false,
  isCreateMode = false,
  creationContext = 'bracket',
  eventType = null,
  enforceScheduleFields = false,
  onScoreChange,
  onSetComplete,
  onScoreSubmit,
  onMatchComplete,
  team1Placeholder,
  team2Placeholder,
  onClose,
  onSave,
  onDelete,
}: MatchEditModalProps) {
  const [startValue, setStartValue] = useState<Date | null>(null);
  const [endValue, setEndValue] = useState<Date | null>(null);
  const [actualStartValue, setActualStartValue] = useState<Date | null>(null);
  const [actualEndValue, setActualEndValue] = useState<Date | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [team1Id, setTeam1Id] = useState<string | null>(null);
  const [team2Id, setTeam2Id] = useState<string | null>(null);
  const [teamOfficialId, setTeamOfficialId] = useState<string | null>(null);
  const [userOfficialId, setUserOfficialId] = useState<string | null>(null);
  const [officialAssignments, setOfficialAssignments] = useState<MatchOfficialAssignment[]>([]);
  const [winnerNextMatchId, setWinnerNextMatchId] = useState<string | null>(null);
  const [loserNextMatchId, setLoserNextMatchId] = useState<string | null>(null);
  const [losersBracket, setLosersBracket] = useState(false);
  const [locked, setLocked] = useState(false);
  const [policyPointTargets, setPolicyPointTargets] = useState('');
  const [policyMatchMinutes, setPolicyMatchMinutes] = useState<number | null>(null);
  const [policyTouched, setPolicyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchStartedValue, setMatchStartedValue] = useState(false);
  const [statusSegmentsValue, setStatusSegmentsValue] = useState<MatchSegment[]>([]);
  const [resultTypeValue, setResultTypeValue] = useState<string>('REGULATION');
  const [winnerEventTeamIdValue, setWinnerEventTeamIdValue] = useState<string | null>(null);
  const [forfeitingEventTeamIdValue, setForfeitingEventTeamIdValue] = useState<string | null>(null);
  const [statusReasonValue, setStatusReasonValue] = useState('');
  const requiresScheduleFields = enforceScheduleFields || creationContext === 'schedule';
  const editableMatchId = useMemo(() => normalizeOptionalId(match?.$id), [match?.$id]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!match || !opened) {
      setStartValue(null);
      setEndValue(null);
      setActualStartValue(null);
      setActualEndValue(null);
      setFieldId(null);
      setTeam1Id(null);
      setTeam2Id(null);
      setTeamOfficialId(null);
      setUserOfficialId(null);
      setOfficialAssignments([]);
      setWinnerNextMatchId(null);
      setLoserNextMatchId(null);
      setLosersBracket(false);
      setLocked(false);
      setPolicyPointTargets('');
      setPolicyMatchMinutes(null);
      setPolicyTouched(false);
      setError(null);
      setMatchStartedValue(false);
      setStatusSegmentsValue([]);
      setResultTypeValue('REGULATION');
      setWinnerEventTeamIdValue(null);
      setForfeitingEventTeamIdValue(null);
      setStatusReasonValue('');
      return;
    }

    setStartValue(coerceDate(match.start));
    setEndValue(coerceDate(match.end));
    setActualStartValue(coerceInstantDate(match.actualStart));
    setActualEndValue(coerceInstantDate(match.actualEnd));
    setFieldId(getEntityId(match.field));
    const initialTeam1Id = resolveMatchTeamId(match, 'team1');
    const initialTeam2Id = resolveMatchTeamId(match, 'team2');
    setTeam1Id(initialTeam1Id);
    setTeam2Id(initialTeam2Id);
    const initialTeamOfficialId =
      normalizeOptionalId(match.teamOfficialId) ??
      getTeamId(match.teamOfficial) ??
      // Legacy fallback when official held team data
      getTeamId((match as any).official);
    setTeamOfficialId(initialTeamOfficialId);
    setUserOfficialId(normalizeOptionalId(match.officialId) ?? getUserId(match.official));
    const normalizedAssignments = normalizeAssignments(match.officialIds);
    if (normalizedAssignments.length > 0) {
      setOfficialAssignments(normalizedAssignments);
    } else if (officialPositions.length > 0) {
      const legacyOfficialId = normalizeOptionalId(match.officialId) ?? getUserId(match.official);
      const firstPosition = officialPositions[0];
      const fallbackEventOfficial = legacyOfficialId
        ? eventOfficials.find((official) => official.userId === legacyOfficialId)
        : undefined;
      setOfficialAssignments(
        legacyOfficialId && firstPosition
          ? [{
              positionId: firstPosition.id,
              slotIndex: 0,
              holderType: 'OFFICIAL',
              userId: legacyOfficialId,
              eventOfficialId: fallbackEventOfficial?.id,
            }]
          : [],
      );
    } else {
      setOfficialAssignments([]);
    }

    setWinnerNextMatchId(normalizeOptionalId(match.winnerNextMatchId) ?? null);
    setLoserNextMatchId(normalizeOptionalId(match.loserNextMatchId) ?? null);
    setLosersBracket(Boolean(match.losersBracket));
    setLocked(Boolean(match.locked));
    setError(null);
    const initialStatusRules = resolveStatusRules(match, tournament);
    const initialStatusSegments = buildStatusSegments(match, initialStatusRules, initialTeam1Id, initialTeam2Id);
    setStatusSegmentsValue(initialStatusSegments);
    const initialResultType = String(match.resultType ?? '').toUpperCase();
    const initialStatus = String(match.status ?? '').toUpperCase();
    const initialWinnerId = normalizeOptionalId(match.winnerEventTeamId);
    const initialTeamIds = [initialTeam1Id, initialTeam2Id].filter((teamId): teamId is string => Boolean(teamId));
    if (initialResultType === 'FORFEIT') {
      setResultTypeValue('FORFEIT');
      setWinnerEventTeamIdValue(initialWinnerId);
      setForfeitingEventTeamIdValue(initialWinnerId ? initialTeamIds.find((teamId) => teamId !== initialWinnerId) ?? null : null);
    } else if (initialResultType === 'NO_CONTEST' || initialStatus === 'CANCELLED') {
      setResultTypeValue('NO_CONTEST');
      setWinnerEventTeamIdValue(null);
      setForfeitingEventTeamIdValue(null);
    } else if (initialStatus === 'SUSPENDED') {
      setResultTypeValue('SUSPENDED');
      setWinnerEventTeamIdValue(null);
      setForfeitingEventTeamIdValue(null);
    } else {
      setResultTypeValue('REGULATION');
      setWinnerEventTeamIdValue(initialWinnerId);
      setForfeitingEventTeamIdValue(null);
    }
    setStatusReasonValue(typeof match.statusReason === 'string' ? match.statusReason : '');
    setMatchStartedValue(Boolean(
      ['IN_PROGRESS', 'COMPLETE'].includes(String(match.status ?? '').toUpperCase())
      || initialStatusSegments.some((segment) => segment.status === 'IN_PROGRESS' || segment.status === 'COMPLETE'),
    ));
    const policySource = resolveEditablePolicySource(match, tournament);
    const initialSetCount = actualSetCount(match, initialStatusSegments);
    const initialTargets = pointsList((policySource as any).setPointTargets)
      ?? resolveStatusPointTargets(match, tournament)
      ?? [];
    const initialSegmentMinutes = positiveIntOrNull(policySource.timekeeping?.segmentDurationMinutes);
    const initialMatchMinutes = positiveIntOrNull((tournament as any)?.matchDurationMinutes)
      ?? (initialSegmentMinutes
        ? initialSegmentMinutes * Math.max(1, initialSetCount)
        : null);
    setPolicyPointTargets(targetsToInput(initialTargets));
    setPolicyMatchMinutes(initialMatchMinutes);
    setPolicyTouched(false);
  }, [editableMatchId, eventOfficials, officialPositions, opened, tournament]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const allMatchOptions = useMemo(() => {
    const map = new Map<string, string>();
    allMatches.forEach((candidate) => {
      const id = normalizeOptionalId(candidate.$id);
      if (!id) {
        return;
      }
      const label = typeof candidate.matchId === 'number'
        ? `Match #${candidate.matchId}`
        : id;
      map.set(id, label);
    });
    const currentId = normalizeOptionalId(match?.$id);
    if (currentId && !map.has(currentId)) {
      map.set(
        currentId,
        typeof match?.matchId === 'number' ? `Match #${match.matchId}` : currentId,
      );
    }
    return map;
  }, [allMatches, match]);

  const currentMatchId = useMemo(
    () => normalizeOptionalId(match?.$id),
    [match?.$id],
  );

  const bracketNodes = useMemo<BracketNode[]>(() => {
    const ids = new Set<string>();
    const candidates: Match[] = [];
    allMatches.forEach((candidate) => {
      const id = normalizeOptionalId(candidate.$id);
      if (!id || ids.has(id)) {
        return;
      }
      ids.add(id);
      candidates.push(candidate);
    });
    if (match && currentMatchId && !ids.has(currentMatchId)) {
      candidates.push(match);
    }

    return candidates.reduce<BracketNode[]>((acc, candidate) => {
      const id = normalizeOptionalId(candidate.$id);
      if (!id) {
        return acc;
      }
      const isCurrent = currentMatchId === id;
      acc.push({
        id,
        matchId: typeof candidate.matchId === 'number' ? candidate.matchId : null,
        previousLeftId: normalizeOptionalId(candidate.previousLeftId) ?? null,
        previousRightId: normalizeOptionalId(candidate.previousRightId) ?? null,
        winnerNextMatchId: normalizeOptionalId(isCurrent ? winnerNextMatchId : candidate.winnerNextMatchId) ?? null,
        loserNextMatchId: normalizeOptionalId(isCurrent ? loserNextMatchId : candidate.loserNextMatchId) ?? null,
      });
      return acc;
    }, []);
  }, [allMatches, currentMatchId, loserNextMatchId, match, winnerNextMatchId]);

  const winnerCandidateIds = useMemo(() => {
    if (!currentMatchId) {
      return [] as string[];
    }
    return filterValidNextMatchCandidates({
      sourceId: currentMatchId,
      nodes: bracketNodes,
      lane: 'winner',
    });
  }, [bracketNodes, currentMatchId]);

  const loserCandidateIds = useMemo(() => {
    if (!currentMatchId) {
      return [] as string[];
    }
    return filterValidNextMatchCandidates({
      sourceId: currentMatchId,
      nodes: bracketNodes,
      lane: 'loser',
    });
  }, [bracketNodes, currentMatchId]);

  const winnerNextOptions = useMemo(
    () => winnerCandidateIds.map((id) => ({ value: id, label: allMatchOptions.get(id) ?? id })),
    [allMatchOptions, winnerCandidateIds],
  );
  const loserNextOptions = useMemo(
    () => loserCandidateIds.map((id) => ({ value: id, label: allMatchOptions.get(id) ?? id })),
    [allMatchOptions, loserCandidateIds],
  );

  const selectedWinnerNextMatchId = useMemo(
    () => (winnerNextMatchId && winnerCandidateIds.includes(winnerNextMatchId) ? winnerNextMatchId : null),
    [winnerCandidateIds, winnerNextMatchId],
  );
  const selectedLoserNextMatchId = useMemo(
    () => (loserNextMatchId && loserCandidateIds.includes(loserNextMatchId) ? loserNextMatchId : null),
    [loserCandidateIds, loserNextMatchId],
  );

  const matchTeam1Id = useMemo(() => resolveMatchTeamId(match, 'team1'), [match]);
  const matchTeam2Id = useMemo(() => resolveMatchTeamId(match, 'team2'), [match]);
  const matchTeamOfficialId = useMemo(
    () => normalizeOptionalId(match?.teamOfficialId) ?? getTeamId(match?.teamOfficial) ?? getTeamId((match as any)?.official),
    [match],
  );
  const matchUserOfficialId = useMemo(
    () => normalizeOptionalId(match?.officialId) ?? getUserId(match?.official),
    [match],
  );

  const teamOptions = useMemo(() => {
    // Deduplicate by team id to avoid double entries when upstream data repeats teams.
    const optionsMap = new Map<string, { value: string; label: string }>();

    teams.forEach((team) => {
      const teamId = getEntityId(team);
      if (!teamId) {
        return;
      }
      optionsMap.set(teamId, {
        value: teamId,
        label: resolveTeamName(team, teams),
      });
    });

    const ensureOption = (id: string | null, label: string) => {
      if (!id || !label) return;
      if (!optionsMap.has(id)) {
        optionsMap.set(id, { value: id, label });
      }
    };

    ensureOption(matchTeam1Id, resolveTeamName(match?.team1, teams));
    ensureOption(matchTeam2Id, resolveTeamName(match?.team2, teams));
    ensureOption(matchTeamOfficialId, resolveTeamName(match?.teamOfficial ?? (match as any)?.official, teams));

    return Array.from(optionsMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [teams, matchTeam1Id, matchTeam2Id, matchTeamOfficialId, match]);

  const officialOptions = useMemo(() => {
    const options = (officials ?? []).reduce<Array<{ value: string; label: string }>>((acc, official) => {
      const officialId = getEntityId(official);
      if (!officialId) {
        return acc;
      }
      acc.push({
        value: officialId,
        label: formatUserLabel(official),
      });
      return acc;
    }, []);

    const ensureOption = (id: string | null, label: string) => {
      if (!id || !label) return;
      if (!options.some((option) => option.value === id)) {
        options.push({ value: id, label });
      }
    };

    ensureOption(matchUserOfficialId, formatUserLabel(match?.official as UserData));

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [officials, matchUserOfficialId, match]);

  const team1Options = useMemo(
    () => teamOptions.filter((option) => !team2Id || option.value === team1Id || option.value !== team2Id),
    [teamOptions, team1Id, team2Id],
  );

  const team2Options = useMemo(
    () => teamOptions.filter((option) => !team1Id || option.value === team2Id || option.value !== team1Id),
    [teamOptions, team1Id, team2Id],
  );

  const fieldOptions = useMemo(
    () => fields.reduce<Array<{ value: string; label: string }>>((acc, field) => {
      const fieldId = getEntityId(field);
      if (!fieldId) {
        return acc;
      }
      acc.push({
        value: fieldId,
        label: getFieldDisplayName(field),
      });
      return acc;
    }, []),
    [fields],
  );

  const selectedTeam1 = useMemo(() => findTeamById(team1Id, teams, match?.team1), [team1Id, teams, match]);
  const selectedTeam2 = useMemo(() => findTeamById(team2Id, teams, match?.team2), [team2Id, teams, match]);
  const resultTeamOptions = useMemo(
    () => [
      team1Id ? { value: team1Id, label: resolveTeamName(selectedTeam1 ?? match?.team1, teams) } : null,
      team2Id ? { value: team2Id, label: resolveTeamName(selectedTeam2 ?? match?.team2, teams) } : null,
    ].filter((option): option is { value: string; label: string } => Boolean(option)),
    [match?.team1, match?.team2, selectedTeam1, selectedTeam2, team1Id, team2Id, teams],
  );
  const resultTypeIsForfeit = resultTypeValue === 'FORFEIT';
  const resultTypeIsNoContest = resultTypeValue === 'NO_CONTEST';
  const resultTypeIsSuspended = resultTypeValue === 'SUSPENDED';
  const resultTypeIsExceptional = resultTypeIsForfeit || resultTypeIsNoContest || resultTypeIsSuspended;
  const derivedForfeitWinnerId = resultTypeIsForfeit
    ? resultTeamOptions.find((option) => option.value !== forfeitingEventTeamIdValue)?.value ?? null
    : null;
  const selectedTeamOfficial = useMemo(
    () => findTeamById(teamOfficialId, teams, match?.teamOfficial ?? (match as any)?.official),
    [teamOfficialId, teams, match],
  );
  const selectedUserOfficial = useMemo(() => {
    const fromList = officials.find((official) => getEntityId(official) === userOfficialId);
    if (fromList) {
      return fromList;
    }
    if (match?.official && getUserId(match.official) === userOfficialId && typeof match.official === 'object') {
      return match.official as UserData;
    }
    return undefined;
  }, [officials, userOfficialId, match]);
  const normalizedEventOfficials = useMemo<EventOfficial[]>(() => (
    (Array.isArray(eventOfficials) ? eventOfficials : [])
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const row = entry as EventOfficial & { $id?: string };
        const id = normalizeOptionalId(row.id) ?? normalizeOptionalId(row.$id);
        const userId = normalizeOptionalId(row.userId);
        if (!id || !userId) {
          return null;
        }
        return {
          ...row,
          id,
          userId,
          positionIds: Array.isArray(row.positionIds)
            ? row.positionIds.map((positionId) => String(positionId).trim()).filter(Boolean)
            : [],
          fieldIds: Array.isArray(row.fieldIds)
            ? row.fieldIds.map((idToken) => String(idToken).trim()).filter(Boolean)
            : [],
        } satisfies EventOfficial;
      })
      .filter((entry): entry is EventOfficial => Boolean(entry))
  ), [eventOfficials]);
  const eventOfficialById = useMemo(
    () => new Map(normalizedEventOfficials.map((official) => [official.id, official] as const)),
    [normalizedEventOfficials],
  );
  const eventOfficialByUserId = useMemo(
    () => new Map(normalizedEventOfficials.map((official) => [official.userId, official] as const)),
    [normalizedEventOfficials],
  );
  const officialUserById = useMemo(() => {
    const map = new Map<string, UserData>();
    officials.forEach((official) => {
      const officialId = getEntityId(official);
      if (officialId) {
        map.set(officialId, official);
      }
    });
    if (match?.official && typeof match.official === 'object') {
      const officialId = getUserId(match.official);
      if (officialId) {
        map.set(officialId, match.official as UserData);
      }
    }
    return map;
  }, [officials, match]);
  const playerCandidates = useMemo(() => {
    const map = new Map<string, { user: UserData; teamName: string }>();
    const registerTeamPlayers = (team?: Team) => {
      if (!team || !Array.isArray(team.players)) {
        return;
      }
      const teamName = resolveTeamName(team, teams);
      team.players.forEach((player) => {
        const playerId = typeof player?.$id === 'string' ? player.$id.trim() : '';
        if (playerId && !map.has(playerId)) {
          map.set(playerId, { user: player, teamName });
        }
      });
    };
    registerTeamPlayers(selectedTeam1);
    registerTeamPlayers(selectedTeam2);
    return map;
  }, [selectedTeam1, selectedTeam2, teams]);
  const assignmentSlots = useMemo(
    () => officialPositions.flatMap((position) =>
      Array.from({ length: Math.max(1, Math.trunc(position.count || 1)) }, (_, slotIndex) => ({
        position,
        slotIndex,
      })),
    ),
    [officialPositions],
  );
  const assignmentBySlotKey = useMemo(() => {
    const map = new Map<string, MatchOfficialAssignment>();
    normalizeAssignments(officialAssignments).forEach((assignment) => {
      map.set(`${assignment.positionId}:${assignment.slotIndex}`, assignment);
    });
    return map;
  }, [officialAssignments]);

  const getAssignmentOptions = useCallback((position: EventOfficialPosition, assignment?: MatchOfficialAssignment) => {
    const optionsByValue = new Map<string, string>();
    const addOption = (value: string, label: string) => {
      if (!optionsByValue.has(value)) {
        optionsByValue.set(value, label);
      }
    };
    normalizedEventOfficials.forEach((eventOfficial) => {
      if (eventOfficial.isActive === false) {
        return;
      }
      if (!eventOfficial.positionIds.includes(position.id)) {
        return;
      }
      if (fieldId && eventOfficial.fieldIds.length > 0 && !eventOfficial.fieldIds.includes(fieldId)) {
        return;
      }
      const user = officialUserById.get(eventOfficial.userId);
      addOption(
        encodeAssignmentValue('OFFICIAL', eventOfficial.id),
        `Official: ${formatUserLabel(user ?? { userName: eventOfficial.userId })}`,
      );
    });
    playerCandidates.forEach(({ user, teamName }, playerId) => {
      addOption(
        encodeAssignmentValue('PLAYER', playerId),
        `Player: ${formatUserLabel(user)} (${teamName})`,
      );
    });
    if (assignment?.holderType === 'OFFICIAL') {
      const assignmentUserId = normalizeOptionalId(assignment.userId);
      const assignedEventOfficial = (
        normalizeOptionalId(assignment.eventOfficialId)
          ? eventOfficialById.get(normalizeOptionalId(assignment.eventOfficialId) as string)
          : undefined
      ) ?? (assignmentUserId ? eventOfficialByUserId.get(assignmentUserId) : undefined);
      if (assignedEventOfficial) {
        const user = officialUserById.get(assignedEventOfficial.userId);
        addOption(
          encodeAssignmentValue('OFFICIAL', assignedEventOfficial.id),
          `Official: ${formatUserLabel(user ?? { userName: assignedEventOfficial.userId })}`,
        );
      } else if (assignmentUserId) {
        const fallbackUser = officialUserById.get(assignmentUserId);
        addOption(
          encodeAssignmentValue('OFFICIAL', assignmentUserId),
          `Official: ${formatUserLabel(fallbackUser ?? { userName: assignmentUserId })}`,
        );
      }
    }
    if (assignment?.holderType === 'PLAYER') {
      const assignmentUserId = normalizeOptionalId(assignment.userId);
      if (assignmentUserId && !optionsByValue.has(encodeAssignmentValue('PLAYER', assignmentUserId))) {
        const player = playerCandidates.get(assignmentUserId);
        const label = player
          ? `Player: ${formatUserLabel(player.user)} (${player.teamName})`
          : `Player: ${assignmentUserId}`;
        addOption(encodeAssignmentValue('PLAYER', assignmentUserId), label);
      }
    }
    return Array.from(optionsByValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [eventOfficialById, eventOfficialByUserId, fieldId, normalizedEventOfficials, officialUserById, playerCandidates]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleStartDateChange = (value: Date | string | null) => {
    const nextStart = parseLocalDateTime(value);
    if (nextStart && startValue && endValue) {
      const deltaMs = endValue.getTime() - startValue.getTime();
      setEndValue(new Date(nextStart.getTime() + deltaMs));
    }
    setStartValue(nextStart);
  };

  const handleEndDateChange = (value: Date | string | null) => {
    setEndValue(parseLocalDateTime(value));
  };

  const handleActualStartDateChange = (value: Date | string | null) => {
    setActualStartValue(parseLocalDateTime(value));
  };

  const handleActualEndDateChange = (value: Date | string | null) => {
    setActualEndValue(parseLocalDateTime(value));
  };

  const handleOfficialAssignmentChange = (
    positionId: string,
    slotIndex: number,
    value: string | null,
  ) => {
    const decoded = decodeAssignmentValue(value);
    setOfficialAssignments((prev) => {
      const next = normalizeAssignments(prev).filter(
        (assignment) => !(assignment.positionId === positionId && assignment.slotIndex === slotIndex),
      );
      if (!decoded) {
        return next;
      }
      if (decoded.holderType === 'OFFICIAL') {
        const eventOfficial = eventOfficialById.get(decoded.id) ?? eventOfficialByUserId.get(decoded.id);
        if (!eventOfficial) {
          const fallbackUserId = normalizeOptionalId(decoded.id);
          if (!fallbackUserId) {
            return next;
          }
          next.push({
            positionId,
            slotIndex,
            holderType: 'OFFICIAL',
            userId: fallbackUserId,
          });
          return next;
        }
        next.push({
          positionId,
          slotIndex,
          holderType: 'OFFICIAL',
          userId: eventOfficial.userId,
          eventOfficialId: eventOfficial.id,
        });
        return next;
      }
      next.push({
        positionId,
        slotIndex,
        holderType: 'PLAYER',
        userId: decoded.id,
      });
      return next;
    });
  };

  const findFieldById = (id: string | null): Field | undefined => {
    if (!id) return undefined;
    const fromList = fields.find((field) => getEntityId(field) === id);
    if (fromList) return fromList;
    if (match?.field && typeof match.field === 'object' && getEntityId(match.field) === id) {
      return match.field;
    }
    return undefined;
  };
  const selectedField = findFieldById(fieldId);

  const operationsMatch = useMemo<Match | null>(() => {
    if (!match || isCreateMode) {
      return null;
    }

    const next: Match = {
      ...match,
      fieldId: fieldId ?? null,
      team1Id: team1Id ?? null,
      team2Id: team2Id ?? null,
      teamOfficialId: teamOfficialId ?? null,
      officialId: userOfficialId ?? null,
      officialIds: normalizeAssignments(officialAssignments),
      ...actualMatchTimePayload(actualStartValue, actualEndValue),
    };

    if (selectedField) {
      next.field = { ...selectedField };
    } else {
      delete (next as any).field;
    }
    if (selectedTeam1) {
      next.team1 = { ...selectedTeam1 };
    } else {
      delete (next as any).team1;
    }
    if (selectedTeam2) {
      next.team2 = { ...selectedTeam2 };
    } else {
      delete (next as any).team2;
    }
    if (selectedTeamOfficial) {
      next.teamOfficial = { ...selectedTeamOfficial };
    } else {
      delete (next as any).teamOfficial;
    }
    if (selectedUserOfficial) {
      next.official = { ...selectedUserOfficial };
    } else {
      delete (next as any).official;
    }

    return next;
  }, [
    actualEndValue,
    actualStartValue,
    fieldId,
    isCreateMode,
    match,
    officialAssignments,
    selectedField,
    selectedTeam1,
    selectedTeam2,
    selectedTeamOfficial,
    selectedUserOfficial,
    team1Id,
    team2Id,
    teamOfficialId,
    userOfficialId,
  ]);

  const statusRules = useMemo(
    () => (operationsMatch ? resolveStatusRules(operationsMatch, tournament) : null),
    [operationsMatch, tournament],
  );
  const statusTeam1Id = useMemo(() => resolveMatchTeamId(operationsMatch, 'team1'), [operationsMatch]);
  const statusTeam2Id = useMemo(() => resolveMatchTeamId(operationsMatch, 'team2'), [operationsMatch]);
  const statusSegments = statusSegmentsValue;
  const statusPointTargets = useMemo(
    () => (operationsMatch ? resolveStatusPointTargets(operationsMatch, tournament) : null),
    [operationsMatch, tournament],
  );
  const matchStartedChecked = matchStartedValue;

  const handleMatchStartedChange = useCallback((checked: boolean) => {
    setMatchStartedValue(checked);
    if (!checked) {
      setStatusSegmentsValue((current) => current.map(resetSegmentConfirmation));
    }
    setError(null);
  }, []);

  const segmentHasValidFinalScore = useCallback((segment: MatchSegment, index: number): boolean => {
    if (!statusRules || statusRules.scoringModel !== 'SETS') {
      return true;
    }
    const target = resolveSetVictoryTarget(statusPointTargets, index);
    if (!target) {
      return true;
    }
    const team1Score = statusTeam1Id ? nonNegativeScore(segment.scores?.[statusTeam1Id]) : 0;
    const team2Score = statusTeam2Id ? nonNegativeScore(segment.scores?.[statusTeam2Id]) : 0;
    return getSetScoreState(team1Score, team2Score, target).isValidFinalScore;
  }, [statusPointTargets, statusRules, statusTeam1Id, statusTeam2Id]);

  const handleSegmentConfirmedChange = useCallback((sequence: number, checked: boolean) => {
    if (!statusRules) {
      return;
    }
    const targetSegment = statusSegments.find((segment) => segment.sequence === sequence);
    if (!targetSegment) {
      return;
    }
    if (checked && !segmentHasValidFinalScore(targetSegment, sequence - 1)) {
      setError('A set can only be confirmed at the victory target, or above it when the winner leads by 2.');
      return;
    }
    setStatusSegmentsValue((current) => current.map((segment) => {
      if (!checked && segment.sequence >= sequence) {
        return resetSegmentConfirmation(segment);
      }
      if (segment.sequence !== sequence) {
        return segment;
      }
      const winnerEventTeamId = checked
        ? segmentWinnerEventTeamId(segment, statusTeam1Id, statusTeam2Id)
        : null;
      return {
        ...segment,
        status: checked ? 'COMPLETE' : resetSegmentConfirmation(segment).status,
        winnerEventTeamId,
        endedAt: checked ? segment.endedAt ?? null : null,
        resultType: checked ? segment.resultType ?? null : null,
        statusReason: checked ? segment.statusReason ?? null : null,
      } satisfies MatchSegment;
    }));
    setError(null);
  }, [
    segmentHasValidFinalScore,
    statusRules,
    statusSegments,
    statusTeam1Id,
    statusTeam2Id,
  ]);

  const handleSave = () => {
    if (!match) {
      handleClose();
      return;
    }

    if (requiresScheduleFields) {
      if (!fieldId || !startValue || !endValue) {
        setError('Field, start, and end are required for schedule-created matches.');
        return;
      }
      if (endValue.getTime() <= startValue.getTime()) {
        setError('End time must be after the start time.');
        return;
      }
    } else if (startValue && endValue && endValue.getTime() <= startValue.getTime()) {
      setError('End time must be after the start time.');
      return;
    }
    if (actualStartValue && actualEndValue && actualEndValue.getTime() <= actualStartValue.getTime()) {
      setError('Actual end time must be after the actual start time.');
      return;
    }

    if (team1Id && team2Id && team1Id === team2Id) {
      setError('Team 1 and Team 2 must be different.');
      return;
    }
    if (resultTypeIsForfeit) {
      if (!forfeitingEventTeamIdValue || !derivedForfeitWinnerId) {
        setError('Forfeit requires selecting the team that forfeited.');
        return;
      }
    }

    const nodesForValidation = bracketNodes.map((node) => {
      if (!currentMatchId || node.id !== currentMatchId) {
        return node;
      }
      return {
        ...node,
        winnerNextMatchId: selectedWinnerNextMatchId,
        loserNextMatchId: selectedLoserNextMatchId,
      } satisfies BracketNode;
    });
    const graphValidation = validateAndNormalizeBracketGraph(nodesForValidation);
    if (!graphValidation.ok) {
      setError(graphValidation.errors[0]?.message ?? 'Invalid bracket links.');
      return;
    }

    if (isCreateMode && String(eventType ?? '').toUpperCase() === 'TOURNAMENT' && currentMatchId) {
      const normalizedNode = graphValidation.normalizedById[currentMatchId];
      const hasAnyLink = Boolean(
        normalizeOptionalId(selectedWinnerNextMatchId)
        || normalizeOptionalId(selectedLoserNextMatchId)
        || normalizedNode?.previousLeftId
        || normalizedNode?.previousRightId,
      );
      if (!hasAnyLink) {
        setError('Tournament match creation requires at least one bracket link.');
        return;
      }
    }

    const shouldSaveMatchPolicy = Boolean(match.matchRulesSnapshot) || policyTouched;
    const policySource = resolveEditablePolicySource(match, tournament);
    const policyScoringModel = normalizeScoringModel(
      policySource.scoringModel ?? statusRules?.scoringModel,
      (tournament?.usesSets || tournament?.leagueConfig?.usesSets) ? 'SETS' : 'POINTS_ONLY',
    );
    const parsedPolicySegmentCount = policyScoringModel === 'SETS'
      ? actualSetCount(match, statusSegments)
      : policyScoringModel === 'POINTS_ONLY'
        ? 1
        : Math.max(1, statusRules?.segmentCount ?? positiveIntOrNull(policySource.segmentCount) ?? 1);
    const parsedPolicyTargets = parseTargetsInput(policyPointTargets);
    const fallbackTarget = parsedPolicyTargets[0]
      ?? resolveStatusPointTargets(match, tournament)?.[0]
      ?? 21;
    const policySnapshot = shouldSaveMatchPolicy
      ? ({
          ...policySource,
          scoringModel: policyScoringModel,
          segmentCount: parsedPolicySegmentCount,
          segmentLabel: policySource.segmentLabel
            ?? (policyScoringModel === 'SETS' ? 'Set' : policyScoringModel === 'INNINGS' ? 'Inning' : policyScoringModel === 'POINTS_ONLY' ? 'Total' : 'Period'),
          setPointTargets: policyScoringModel === 'SETS'
            ? resizeTargets(parsedPolicyTargets, parsedPolicySegmentCount, fallbackTarget)
            : [],
          supportsDraw: policySource.supportsDraw === true,
          supportsOvertime: policySource.supportsOvertime === true,
          supportsShootout: policySource.supportsShootout === true,
          canUseOvertime: policySource.canUseOvertime === true || policySource.supportsOvertime === true,
          canUseShootout: policySource.canUseShootout === true || policySource.supportsShootout === true,
          officialRoles: Array.isArray(policySource.officialRoles) ? policySource.officialRoles : [],
          supportedIncidentTypes: Array.isArray(policySource.supportedIncidentTypes) && policySource.supportedIncidentTypes.length
            ? policySource.supportedIncidentTypes
            : ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
          incidentTypeDefinitions: Array.isArray(policySource.incidentTypeDefinitions) ? policySource.incidentTypeDefinitions : [],
          autoCreatePointIncidentType: policySource.autoCreatePointIncidentType ?? 'POINT',
          pointIncidentRequiresParticipant: policySource.pointIncidentRequiresParticipant === true,
          timekeeping: {
            timerMode: policySource.timekeeping?.timerMode ?? (policyScoringModel === 'PERIODS' ? 'COUNT_UP' : 'NONE'),
            segmentDurationMinutes: policyScoringModel === 'SETS'
              ? null
              : (policyMatchMinutes && parsedPolicySegmentCount > 0 ? Math.max(1, Math.round(policyMatchMinutes / parsedPolicySegmentCount)) : null)
                ?? policySource.timekeeping?.segmentDurationMinutes
                ?? null,
            segmentDurationMinutesBySequence: policySource.timekeeping?.segmentDurationMinutesBySequence ?? [],
            canUseAddedTime: policySource.timekeeping?.canUseAddedTime === true,
            addedTimeEnabled: policySource.timekeeping?.addedTimeEnabled === true,
            stopAtRegulationEnd: policySource.timekeeping?.stopAtRegulationEnd ?? true,
          },
        } satisfies ResolvedMatchRules)
      : null;

    const updated: Match = {
      ...match,
      start: startValue ? startValue.toISOString() : null,
      end: endValue ? endValue.toISOString() : null,
      ...actualMatchTimePayload(actualStartValue, actualEndValue),
      locked,
      losersBracket,
      winnerNextMatchId: selectedWinnerNextMatchId ?? undefined,
      loserNextMatchId: selectedLoserNextMatchId ?? undefined,
    };
    if (policySnapshot) {
      updated.matchRulesSnapshot = policySnapshot;
      updated.resolvedMatchRules = policySnapshot;
    }
    if (statusRules) {
      const statusSegmentsForSave = (
        matchStartedValue && !resultTypeIsExceptional ? statusSegments : statusSegments.map(resetSegmentConfirmation)
      ).map((segment) => ({ ...segment, scores: { ...(segment.scores ?? {}) } }));
      const legacyStatus = matchStartedValue && !resultTypeIsExceptional
        ? statusLegacyFromSegments(statusSegmentsForSave, statusTeam1Id, statusTeam2Id)
        : {
            team1Points: Array.isArray(match.team1Points) ? [...match.team1Points] : [],
            team2Points: Array.isArray(match.team2Points) ? [...match.team2Points] : [],
            setResults: Array.isArray(match.setResults) ? [...match.setResults] : [],
          };
      const isMatchComplete = matchStartedValue
        && !resultTypeIsExceptional
        && statusMatchComplete(statusSegmentsForSave, statusRules, statusTeam1Id, statusTeam2Id);
      updated.segments = statusSegmentsForSave;
      updated.team1Points = legacyStatus.team1Points;
      updated.team2Points = legacyStatus.team2Points;
      updated.setResults = legacyStatus.setResults;
      const reason = statusReasonValue.trim() || null;
      if (resultTypeIsForfeit) {
        updated.status = 'COMPLETE';
        updated.resultStatus = 'FINAL';
        updated.resultType = 'FORFEIT';
        updated.winnerEventTeamId = derivedForfeitWinnerId;
        updated.statusReason = reason;
        updated.actualEnd = updated.actualEnd ?? new Date().toISOString();
        updated.locked = true;
      } else if (resultTypeIsNoContest) {
        updated.status = 'CANCELLED';
        updated.resultStatus = 'NO_CONTEST';
        updated.resultType = 'NO_CONTEST';
        updated.winnerEventTeamId = null;
        updated.statusReason = reason ?? 'Cancelled';
        updated.actualEnd = updated.actualEnd ?? new Date().toISOString();
        updated.locked = true;
      } else if (resultTypeIsSuspended) {
        updated.status = 'SUSPENDED';
        updated.resultStatus = null;
        updated.resultType = null;
        updated.winnerEventTeamId = null;
        updated.statusReason = reason ?? 'Suspended';
      } else {
        updated.status = matchStartedValue
          ? isMatchComplete ? 'COMPLETE' : 'IN_PROGRESS'
          : 'SCHEDULED';
        updated.winnerEventTeamId = isMatchComplete
          ? (winnerEventTeamIdValue ?? resolveCompletedMatchWinner(statusSegmentsForSave, statusRules, statusTeam1Id, statusTeam2Id))
          : null;
        updated.resultStatus = isMatchComplete ? updated.resultStatus ?? null : null;
        updated.resultType = isMatchComplete ? null : null;
        updated.statusReason = isMatchComplete ? reason : null;
      }
    }
    const sanitizedAssignments = assignmentSlots
      .map(({ position, slotIndex }) => assignmentBySlotKey.get(`${position.id}:${slotIndex}`) ?? null)
      .filter((assignment): assignment is MatchOfficialAssignment => Boolean(assignment));
    const duplicateAssignmentUserIds = sanitizedAssignments.reduce<Set<string>>((duplicates, assignment, index) => {
      if (sanitizedAssignments.findIndex((candidate) => candidate.userId === assignment.userId) !== index) {
        duplicates.add(assignment.userId);
      }
      return duplicates;
    }, new Set<string>());
    if (duplicateAssignmentUserIds.size > 0) {
      setError('The same user cannot hold more than one official position in the same match.');
      return;
    }
    const primaryOfficialAssignment = sanitizedAssignments.find((assignment) => assignment.holderType === 'OFFICIAL');

    const nextField = selectedField;
    updated.fieldId = fieldId ?? null;
    if (nextField) {
      updated.field = { ...nextField };
    } else {
      delete (updated as any).field;
    }

    const nextTeam1 = selectedTeam1;
    updated.team1Id = team1Id ?? null;
    if (nextTeam1) {
      updated.team1 = { ...nextTeam1 };
    } else {
      delete (updated as any).team1;
    }

    const nextTeam2 = selectedTeam2;
    updated.team2Id = team2Id ?? null;
    if (nextTeam2) {
      updated.team2 = { ...nextTeam2 };
    } else {
      delete (updated as any).team2;
    }

    updated.teamOfficialId = teamOfficialId ?? null;
    const nextTeamOfficial = selectedTeamOfficial;
    if (nextTeamOfficial) {
      updated.teamOfficial = { ...nextTeamOfficial };
    } else {
      delete (updated as any).teamOfficial;
    }

    updated.officialId = userOfficialId ?? null;
    const nextUserRef = selectedUserOfficial;
    if (nextUserRef) {
      updated.official = { ...nextUserRef };
    } else {
      delete (updated as any).official;
    }
    if (officialPositions.length > 0) {
      updated.officialIds = sanitizedAssignments;
      updated.officialId = primaryOfficialAssignment?.userId ?? null;
      const primaryOfficialUser = primaryOfficialAssignment
        ? officialUserById.get(primaryOfficialAssignment.userId)
        : undefined;
      if (primaryOfficialUser) {
        updated.official = { ...primaryOfficialUser };
      } else {
        delete (updated as any).official;
      }
    }

    setError(null);
    onSave(updated);
  };

  const handleDelete = () => {
    if (!match || !onDelete) {
      return;
    }
    const confirmed = window.confirm(
      isCreateMode
        ? 'Remove this unsaved match from the draft?'
        : 'Delete this match from the event? This cannot be undone.',
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    onDelete(match);
  };

  const modalTitle = isCreateMode ? 'Add Match' : 'Edit Match';
  const bracketLaneLabel = losersBracket ? 'Losers bracket' : 'Winners bracket';
  const saveDisabled = requiresScheduleFields && (!startValue || !endValue || !fieldId);
  const editablePolicySource = match ? resolveEditablePolicySource(match, tournament) : {};
  const editablePolicyScoringModel = normalizeScoringModel(
    editablePolicySource.scoringModel ?? statusRules?.scoringModel,
    (tournament?.usesSets || tournament?.leagueConfig?.usesSets) ? 'SETS' : 'POINTS_ONLY',
  );
  const isSetBasedPolicy = editablePolicyScoringModel === 'SETS';
  const isTimedPolicy = !isSetBasedPolicy
    && typeof editablePolicySource.timekeeping?.timerMode === 'string'
    && editablePolicySource.timekeeping.timerMode.trim().toUpperCase() !== 'NONE';
  const showMatchPolicyControls = isSetBasedPolicy || isTimedPolicy;
  const renderMatchStatusPanel = () => {
    if (!operationsMatch || !statusRules) {
      return null;
    }
    const matchStartedDisabled = !canManageOperations;

    return (
      <SectionPanel title="Match Status">
        <Stack gap="xs">
          <FieldRow label="Result type">
            <Select
              aria-label="Result type"
              data={RESULT_TYPE_OPTIONS}
              value={resultTypeValue}
              disabled={!canManageOperations}
              onChange={(value) => {
                const nextValue = value ?? 'REGULATION';
                setResultTypeValue(nextValue);
                if (nextValue !== 'FORFEIT') {
                  setForfeitingEventTeamIdValue(null);
                }
                if (nextValue === 'NO_CONTEST' || nextValue === 'SUSPENDED') {
                  setWinnerEventTeamIdValue(null);
                }
                setError(null);
              }}
              size="sm"
            />
          </FieldRow>
          {resultTypeIsForfeit && (
            <>
              <FieldRow label="Forfeiting team" required>
                <Select
                  aria-label="Forfeiting team"
                  data={resultTeamOptions}
                  value={forfeitingEventTeamIdValue}
                  disabled={!canManageOperations}
                  onChange={(value) => {
                    setForfeitingEventTeamIdValue(value);
                    const derivedWinner = resultTeamOptions.find((option) => option.value !== value)?.value ?? null;
                    setWinnerEventTeamIdValue(derivedWinner);
                    setError(null);
                  }}
                  placeholder="Select team"
                  size="sm"
                />
              </FieldRow>
              <FieldRow label="Winner">
                <Badge color={derivedForfeitWinnerId ? 'green' : 'gray'} variant="light">
                  {resultTeamOptions.find((option) => option.value === derivedForfeitWinnerId)?.label ?? 'Select forfeiting team'}
                </Badge>
              </FieldRow>
            </>
          )}
          {(resultTypeIsForfeit || resultTypeIsNoContest || resultTypeIsSuspended) && (
            <FieldRow label="Reason">
              <TextInput
                aria-label="Result reason"
                value={statusReasonValue}
                disabled={!canManageOperations}
                onChange={(event) => setStatusReasonValue(event.currentTarget.value)}
                placeholder={resultTypeIsForfeit ? 'Optional forfeit note' : resultTypeIsNoContest ? 'Weather, unsafe conditions, etc.' : 'Suspension reason'}
                size="sm"
              />
            </FieldRow>
          )}
          <Checkbox
            label="Match started"
            checked={matchStartedChecked}
            disabled={matchStartedDisabled || resultTypeIsExceptional}
            onChange={(event) => {
              void handleMatchStartedChange(event.currentTarget.checked);
            }}
          />
          <Stack gap={6} pl="lg">
            {statusSegments.map((segment, index) => {
              const checked = segment.status === 'COMPLETE';
              const previousComplete = statusSegments
                .slice(0, index)
                .every((entry) => entry.status === 'COMPLETE');
              const validFinalScore = segmentHasValidFinalScore(segment, index);
              const disabled =
                !canManageOperations
                || resultTypeIsExceptional
                || (!checked && (!matchStartedChecked || !previousComplete || !validFinalScore));
              return (
                <Checkbox
                  key={segment.id ?? segment.sequence}
                  label={`${statusLabelForSegment(statusRules, segment.sequence)} confirmed`}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    void handleSegmentConfirmedChange(segment.sequence, event.currentTarget.checked);
                  }}
                />
              );
            })}
          </Stack>
        </Stack>
      </SectionPanel>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      aria-label={modalTitle}
      centered
      size={operationsMatch && tournament ? 1120 : 940}
      padding={0}
      radius="md"
      withCloseButton={false}
      styles={{
        content: {
          maxHeight: 'calc(100dvh - 32px)',
          overflow: 'hidden',
        },
        body: {
          height: '100%',
        },
      }}
    >
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100dvh - 32px)' }}>
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Text c="blue" fw={700} size="sm">
                {isCreateMode ? 'New match' : 'Match'}
              </Text>
              <Text component="h2" fw={800} size="1.65rem" lh={1.15}>
                {modalTitle}
              </Text>
              <Group gap="xs" wrap="wrap">
                <Text size="sm" c="dimmed">Bracket lane:</Text>
                <Text size="sm" fw={600}>{bracketLaneLabel}</Text>
                <Badge color={isCreateMode ? 'gray' : 'green'} variant="light" radius="sm">
                  {isCreateMode ? 'Draft match' : 'Saved match'}
                </Badge>
              </Group>
            </Stack>
            <ActionIcon
              aria-label="Close match editor"
              variant="subtle"
              color="gray"
              onClick={handleClose}
            >
              <X size={18} />
            </ActionIcon>
          </Group>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          <Stack gap="sm">
            {error && (
              <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
                {error}
              </Alert>
            )}

            <Group
              justify="space-between"
              align="center"
              gap="md"
              className="rounded-md border border-gray-200 bg-white px-4 py-2"
            >
              <Switch
                label="Place match in losers bracket"
                checked={losersBracket}
                onChange={(event) => setLosersBracket(event.currentTarget.checked)}
              />

              <Checkbox
                label="Lock match (prevent auto-rescheduling)"
                checked={locked}
                onChange={(event) => setLocked(event.currentTarget.checked)}
              />
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm" verticalSpacing="sm">
              <Stack gap="sm">
                <SectionPanel title="Match Setup">
                  <Stack gap="sm">
                    <FieldRow label="Team 1">
                      <Select
                        aria-label="Team 1"
                        data={team1Options}
                        value={team1Id}
                        onChange={setTeam1Id}
                        placeholder="Select team"
                        clearable
                        size="sm"
                      />
                    </FieldRow>
                    <FieldRow label="Team 2">
                      <Select
                        aria-label="Team 2"
                        data={team2Options}
                        value={team2Id}
                        onChange={setTeam2Id}
                        placeholder="Select team"
                        clearable
                        size="sm"
                      />
                    </FieldRow>
                    <FieldRow label="Team Official">
                      <Select
                        aria-label="Team Official"
                        description={doTeamsOfficiate ? undefined : 'Optional when teams are not providing officials.'}
                        data={teamOptions}
                        value={teamOfficialId}
                        onChange={setTeamOfficialId}
                        placeholder="Select official team"
                        clearable
                        size="sm"
                      />
                    </FieldRow>
                  </Stack>
                </SectionPanel>

                {showMatchPolicyControls && (
                  <SectionPanel title="Match Rules">
                    <Stack gap="sm">
                      {isSetBasedPolicy && (
                        <FieldRow label="Score limits">
                          <TextInput
                            aria-label="Score limits"
                            value={policyPointTargets}
                            onChange={(event) => {
                              setPolicyPointTargets(event.currentTarget.value);
                              setPolicyTouched(true);
                            }}
                            placeholder="25, 25, 15"
                            size="sm"
                          />
                        </FieldRow>
                      )}
                      {isTimedPolicy && (
                        <FieldRow label="Match minutes">
                          <NumberInput
                            aria-label="Match minutes"
                            value={policyMatchMinutes ?? ''}
                            min={1}
                            step={1}
                            allowDecimal={false}
                            onChange={(value) => {
                              setPolicyMatchMinutes(typeof value === 'number' ? value : positiveIntOrNull(value));
                              setPolicyTouched(true);
                            }}
                            size="sm"
                          />
                        </FieldRow>
                      )}
                    </Stack>
                  </SectionPanel>
                )}

                <SectionPanel title="Schedule">
                  <Stack gap="sm">
                    {fieldOptions.length > 0 && (
                      <FieldRow label="Field" required={requiresScheduleFields}>
                        <Select
                          aria-label="Field"
                          data={fieldOptions}
                          value={fieldId}
                          onChange={setFieldId}
                          placeholder="Select field"
                          clearable
                          size="sm"
                        />
                      </FieldRow>
                    )}
                    <FieldRow label="Start time" required={requiresScheduleFields}>
                      <DateTimePicker
                        aria-label={requiresScheduleFields ? 'Start time' : 'Start time (optional)'}
                        value={startValue}
                        onChange={handleStartDateChange}
                        withSeconds
                        valueFormat="MM/DD/YYYY hh:mm:ss A"
                        timePickerProps={MATCH_TIME_PICKER_PROPS}
                        required={requiresScheduleFields}
                        size="sm"
                      />
                    </FieldRow>
                    <FieldRow label="End time" required={requiresScheduleFields}>
                      <DateTimePicker
                        aria-label={requiresScheduleFields ? 'End time' : 'End time (optional)'}
                        value={endValue}
                        onChange={handleEndDateChange}
                        withSeconds
                        valueFormat="MM/DD/YYYY hh:mm:ss A"
                        timePickerProps={MATCH_TIME_PICKER_PROPS}
                        required={requiresScheduleFields}
                        minDate={startValue ?? undefined}
                        size="sm"
                      />
                    </FieldRow>

                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <Stack gap="sm">
                        <Text fw={700} size="sm">Actual Times</Text>
                        <FieldRow label="Actual start time">
                          <DateTimePicker
                            aria-label="Actual start time"
                            value={actualStartValue}
                            onChange={handleActualStartDateChange}
                            withSeconds
                            valueFormat="MM/DD/YYYY hh:mm:ss A"
                            timePickerProps={MATCH_TIME_PICKER_PROPS}
                            clearable
                            size="sm"
                          />
                        </FieldRow>
                        <FieldRow label="Actual end time">
                          <DateTimePicker
                            aria-label="Actual end time"
                            value={actualEndValue}
                            onChange={handleActualEndDateChange}
                            withSeconds
                            valueFormat="MM/DD/YYYY hh:mm:ss A"
                            timePickerProps={MATCH_TIME_PICKER_PROPS}
                            minDate={actualStartValue ?? undefined}
                            clearable
                            size="sm"
                          />
                        </FieldRow>
                      </Stack>
                    </div>
                  </Stack>
                </SectionPanel>
              </Stack>

              <Stack gap="sm">
                <SectionPanel title="Official Assignments">
                  {officialPositions.length > 0 ? (
                    <Stack gap="sm">
                      {assignmentSlots.map(({ position, slotIndex }) => {
                        const assignment = assignmentBySlotKey.get(`${position.id}:${slotIndex}`);
                        const currentValue = assignment && (
                          assignment.holderType === 'PLAYER'
                          || assignment.holderType === 'OFFICIAL'
                        )
                          ? encodeAssignmentValue(
                              assignment.holderType,
                              assignment.holderType === 'OFFICIAL'
                                ? (
                                  (
                                    normalizeOptionalId(assignment.eventOfficialId)
                                    && eventOfficialById.has(normalizeOptionalId(assignment.eventOfficialId) as string)
                                  )
                                    ? (normalizeOptionalId(assignment.eventOfficialId) as string)
                                    : (eventOfficialByUserId.get(assignment.userId)?.id ?? assignment.userId)
                                )
                                : assignment.userId,
                            )
                          : null;
                        const options = getAssignmentOptions(position, assignment);
                        const label = position.count > 1 ? `${position.name} ${slotIndex + 1}` : position.name;
                        return (
                          <FieldRow key={`${position.id}:${slotIndex}`} label={label}>
                            <Select
                              aria-label={label}
                              data={options}
                              value={currentValue}
                              onChange={(value) => handleOfficialAssignmentChange(position.id, slotIndex, value)}
                              placeholder="Unassigned"
                              clearable
                              searchable
                              size="sm"
                              nothingFoundMessage={options.length ? 'No matches' : 'No eligible officials or players'}
                            />
                          </FieldRow>
                        );
                      })}
                      <Text size="xs" c="dimmed">Official assignments must be unique.</Text>
                    </Stack>
                  ) : (
                    <FieldRow label="Official">
                      <Select
                        aria-label="Official"
                        data={officialOptions}
                        value={userOfficialId}
                        onChange={setUserOfficialId}
                        placeholder="Select official"
                        clearable
                        searchable
                        size="sm"
                        nothingFoundMessage={officialOptions.length ? 'No matches' : 'No officials available'}
                      />
                    </FieldRow>
                  )}
                </SectionPanel>

                <SectionPanel title="Bracket Links">
                  <Stack gap="sm">
                    <FieldRow label="Winner advances to">
                      <Select
                        aria-label="Winner advances to"
                        data={winnerNextOptions}
                        value={selectedWinnerNextMatchId}
                        onChange={setWinnerNextMatchId}
                        placeholder="No next winner match"
                        clearable
                        searchable
                        size="sm"
                        nothingFoundMessage={winnerNextOptions.length ? 'No matches' : 'No valid matches'}
                      />
                    </FieldRow>
                    <FieldRow label="Loser advances to">
                      <Select
                        aria-label="Loser advances to"
                        data={loserNextOptions}
                        value={selectedLoserNextMatchId}
                        onChange={setLoserNextMatchId}
                        placeholder="No next loser match"
                        clearable
                        searchable
                        size="sm"
                        nothingFoundMessage={loserNextOptions.length ? 'No matches' : 'No valid matches'}
                      />
                    </FieldRow>
                    <Text size="xs" c="dimmed">Links must form a valid bracket graph.</Text>
                  </Stack>
                </SectionPanel>

                {renderMatchStatusPanel()}
              </Stack>
            </SimpleGrid>

            <SectionPanel title="Match Operations">
              {operationsMatch && tournament ? (
                <ScoreUpdateModal
                  match={operationsMatch}
                  tournament={tournament}
                  participantTeams={participantTeams}
                  canManage={canManageOperations}
                  onScoreChange={onScoreChange}
                  onSetComplete={onSetComplete}
                  onSubmit={onScoreSubmit}
                  onMatchComplete={onMatchComplete}
                  onClose={() => undefined}
                  isOpen={opened}
                  team1Placeholder={team1Placeholder}
                  team2Placeholder={team2Placeholder}
                  embedded
                  defaultShowDetails
                  hideStatusControls
                />
              ) : (
                <Text size="sm" c="dimmed">
                  Save the match before managing scores, segment winners, official check-in, and the match log.
                </Text>
              )}
            </SectionPanel>
          </Stack>
        </div>

        <Group justify="space-between" className="border-t border-gray-200 px-5 py-3 sm:px-6">
          <Group>
            {onDelete && (
              <Button
                variant="light"
                color="red"
                leftSection={<Trash2 size={16} />}
                onClick={handleDelete}
              >
                {isCreateMode ? 'Discard match' : 'Delete match'}
              </Button>
            )}
          </Group>
          <Group>
            <Button variant="default" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveDisabled}>
              {isCreateMode ? 'Create match' : 'Save changes'}
            </Button>
          </Group>
        </Group>
      </div>
    </Modal>
  );
}

function SectionPanel({ title, titleAction = null, children }: { title: string; titleAction?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="sm" shadow="none" role="region" aria-label={title}>
      <Stack gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <Text fw={800} size="sm">{title}</Text>
          {titleAction}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

function FieldRow({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
      <Text size="sm" fw={500} pt={6}>
        {label}
        {required && <Text span inherit c="red"> *</Text>}
      </Text>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
