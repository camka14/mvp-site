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

const buildParticipantOptions = (team: Team | null | undefined, eventTeamId: string | null): MatchRosterParticipantOption[] => {
  const playersById = new Map(teamPlayers(team).map((player) => [player.$id, player]));
  const registrations = teamPlayerRegistrations(team)
    .filter((registration) => ['ACTIVE', 'STARTED'].includes(String(registration.status ?? '').trim().toUpperCase()));
  if (registrations.length) {
    return registrations.map((registration) => ({
      value: registration.id,
      label: participantLabel(playersById.get(registration.userId), registration),
      participantUserId: registration.userId,
      eventRegistrationId: registration.id,
      eventTeamId,
    }));
  }
  return teamPlayers(team).map((player) => ({
    value: player.$id,
    label: participantLabel(player, null),
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
  const source = (match.matchRulesSnapshot || match.resolvedMatchRules || event.resolvedMatchRules || {}) as Partial<ResolvedMatchRules>;
  const scoringModel = source.scoringModel ?? (usesSets ? 'SETS' : 'POINTS_ONLY');
  return {
    scoringModel,
    segmentCount: positiveInt(source.segmentCount, segmentCount),
    segmentLabel: source.segmentLabel || (scoringModel === 'SETS' ? 'Set' : scoringModel === 'INNINGS' ? 'Inning' : scoringModel === 'POINTS_ONLY' ? 'Total' : 'Period'),
    supportsDraw: source.supportsDraw === true,
    supportsOvertime: source.supportsOvertime === true,
    supportsShootout: source.supportsShootout === true,
    officialRoles: Array.isArray(source.officialRoles) ? source.officialRoles : [],
    supportedIncidentTypes: Array.isArray(source.supportedIncidentTypes) && source.supportedIncidentTypes.length
      ? source.supportedIncidentTypes
      : ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
    autoCreatePointIncidentType: source.autoCreatePointIncidentType ?? 'POINT',
    pointIncidentRequiresParticipant: source.pointIncidentRequiresParticipant === true,
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

const legacyArray = (values: number[] | undefined, length: number): number[] => {
  const next = (Array.isArray(values) ? values : []).slice(0, length).map(score);
  while (next.length < length) next.push(0);
  return next;
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
  const finalizedRef = useRef(false);

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
  const activeSegment = segments[activeIndex] ?? segments[0];
  const team1Score = scoreForSegment(activeSegment, activeIndex, team1Id, match.team1Points);
  const team2Score = scoreForSegment(activeSegment, activeIndex, team2Id, match.team2Points);
  const teamOptions = [
    ...(team1Id ? [{ value: team1Id, label: teamName(match.team1) }] : []),
    ...(team2Id ? [{ value: team2Id, label: teamName(match.team2) }] : []),
  ];
  const participantOptionsByTeam = useMemo(() => ({
    ...(team1Id ? { [team1Id]: buildParticipantOptions(match.team1 as Team | null | undefined, team1Id) } : {}),
    ...(team2Id ? { [team2Id]: buildParticipantOptions(match.team2 as Team | null | undefined, team2Id) } : {}),
  }), [match.team1, match.team2, team1Id, team2Id]);
  const activeParticipantOptions = incidentTeamId ? (participantOptionsByTeam[incidentTeamId] ?? []) : [];
  const selectedParticipant = incidentParticipantId
    ? activeParticipantOptions.find((option) => option.value === incidentParticipantId) ?? null
    : null;
  const parseIncidentMinute = () => {
    const trimmed = incidentMinute.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
  };

  useEffect(() => {
    finalizedRef.current = false;
    const next = buildSegments(match, totalSegments, team1Id, team2Id);
    setSegments(next);
    setActiveIndex(Math.max(0, next.findIndex((segment) => segment.status !== 'COMPLETE')));
    setIncidentType(rules.supportedIncidentTypes.includes('NOTE') ? 'NOTE' : rules.supportedIncidentTypes[0] ?? 'NOTE');
    setIncidentTeamId(team1Id ?? team2Id ?? null);
    setIncidentParticipantId((team1Id && participantOptionsByTeam[team1Id]?.[0]?.value) ?? (team2Id && participantOptionsByTeam[team2Id]?.[0]?.value) ?? null);
    setIncidentMinute('');
    setIncidentNote('');
  }, [match.$id, match.incidents, match.segments, match.setResults, match.team1Points, match.team2Points, participantOptionsByTeam, rules, team1Id, team2Id, totalSegments]);

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

  const emit = (nextPayload: ScorePayload) => {
    Promise.resolve(onScoreChange?.(nextPayload)).catch((error) => console.warn('Match operation update failed:', error));
  };

  const updateScore = (eventTeamId: string | null, delta: number, note?: string) => {
    if (!canManage || !activeSegment || !eventTeamId || activeSegment.status === 'COMPLETE') return;
    const next = segments.map((segment, index) => {
      if (index !== activeIndex) return segment;
      const nextScore = Math.max(0, score(segment.scores?.[eventTeamId]) + delta);
      return {
        ...segment,
        status: nextScore > 0 ? 'IN_PROGRESS' : segment.status,
        scores: { ...(segment.scores ?? {}), [eventTeamId]: nextScore },
      } satisfies MatchSegment;
    });
    setSegments(next);
    if (autoPointIncidents) {
      emit(payload(next, {
        incidentOperations: [{
          action: 'CREATE',
          segmentId: activeSegment.id,
          eventTeamId,
          eventRegistrationId: selectedParticipant?.eventRegistrationId ?? null,
          participantUserId: selectedParticipant?.participantUserId ?? null,
          incidentType: rules.autoCreatePointIncidentType ?? 'POINT',
          linkedPointDelta: delta,
          minute: parseIncidentMinute(),
          note: note?.trim() || null,
        }],
      }));
      return;
    }
    emit(payload(next, {
      segmentOperations: [{
        id: activeSegment.id,
        sequence: activeSegment.sequence,
        status: next[activeIndex].status,
        scores: next[activeIndex].scores,
      }],
    }));
  };

  const requestScore = (eventTeamId: string | null, delta: number) => {
    if (!eventTeamId) return;
    if (autoPointIncidents && delta > 0) {
      setPendingPoint({ teamId: eventTeamId, delta });
      setIncidentType(rules.autoCreatePointIncidentType ?? 'POINT');
      setIncidentTeamId(eventTeamId);
      setIncidentMinute('');
      setIncidentNote('');
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
    const nextPayload = payload(next, {
      segmentOperations: [{
        id: activeSegment.id,
        sequence: activeSegment.sequence,
        status: 'COMPLETE',
        scores: activeSegment.scores,
        winnerEventTeamId,
        endedAt,
      }],
    });
    try {
      if (onSetComplete) await onSetComplete(nextPayload);
      else emit(nextPayload);
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
    const nextPayload = payload(next, {
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
    emit(payload(segments, {
      incidentOperations: [{
        action: 'CREATE',
        segmentId: activeSegment.id,
        eventTeamId: incidentTeamId,
        eventRegistrationId: selectedParticipant?.eventRegistrationId ?? null,
        participantUserId: selectedParticipant?.participantUserId ?? null,
        incidentType,
        minute: parseIncidentMinute(),
        note: incidentNote.trim() || null,
      }],
    }));
    setIncidentMinute('');
    setIncidentNote('');
  };

  const checkIn = (assignment: any) => {
    emit(payload(segments, {
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
            {match.status ?? 'SCHEDULED'}
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
                  <Text fw={600}>{match.resultStatus ?? 'Pending'}</Text>
                  <Text size="sm">{match.statusReason || 'No status reason'}</Text>
                </div>
                <div>
                  <Text c="dimmed" size="sm">Actual Times</Text>
                  <Text size="sm">Start: {dateLabel(match.actualStart)}</Text>
                  <Text size="sm">End: {dateLabel(match.actualEnd)}</Text>
                </div>
                <div>
                  <Text c="dimmed" size="sm">Rules</Text>
                  <Text size="sm">{rules.scoringModel.replace('_', ' ')} - {rules.segmentCount} {rules.segmentLabel.toLowerCase()}</Text>
                  <Text size="sm">Match log: {rules.supportedIncidentTypes.map(matchLogTypeLabel).join(', ')}</Text>
                </div>
              </Group>

              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Segment</Table.Th>
                    <Table.Th>{teamName(match.team1)}</Table.Th>
                    <Table.Th>{teamName(match.team2)}</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Winner</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {segments.map((segment) => (
                    <Table.Tr key={segment.id}>
                      <Table.Td>{labelForSegment(rules, segment.sequence)}</Table.Td>
                      <Table.Td>{scoreForSegment(segment, segment.sequence - 1, team1Id, match.team1Points)}</Table.Td>
                      <Table.Td>{scoreForSegment(segment, segment.sequence - 1, team2Id, match.team2Points)}</Table.Td>
                      <Table.Td>{segment.status}</Table.Td>
                      <Table.Td>{segment.winnerEventTeamId === team1Id ? teamName(match.team1) : segment.winnerEventTeamId === team2Id ? teamName(match.team2) : '-'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              <Stack gap="xs">
                <Text c="dimmed" size="sm">Officials</Text>
                {(match.officialIds ?? []).length ? (match.officialIds ?? []).map((assignment, index) => (
                  <Group key={`${assignment.positionId}:${assignment.slotIndex}:${index}`} justify="space-between">
                    <Text size="sm">{assignment.positionId} slot {assignment.slotIndex + 1}: {assignment.userId}</Text>
                    <Group gap="xs">
                      <Badge color={assignment.checkedIn ? 'green' : 'gray'}>{assignment.checkedIn ? 'Checked in' : 'Not checked in'}</Badge>
                      {canManage && !assignment.checkedIn && <Button size="xs" variant="light" onClick={() => checkIn(assignment)}>Check in</Button>}
                    </Group>
                  </Group>
                )) : <Text size="sm">No official slots assigned.</Text>}
              </Stack>

              <Stack gap="xs">
                <Text c="dimmed" size="sm">Match Log</Text>
                {(match.incidents ?? []).length ? [...(match.incidents ?? [])].sort((a, b) => a.sequence - b.sequence).map((incident) => (
                  <Group key={incident.id} justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600} size="sm">{matchLogTypeLabel(incident.incidentType)}</Text>
                      <Text size="sm" c="dimmed">
                        {incident.eventTeamId === team1Id ? teamName(match.team1) : incident.eventTeamId === team2Id ? teamName(match.team2) : 'Match'}
                        {incident.linkedPointDelta ? `, point change ${incident.linkedPointDelta > 0 ? '+' : ''}${incident.linkedPointDelta}` : ''}
                      </Text>
                    </div>
                    <Text size="sm">{incident.note || '-'}</Text>
                  </Group>
                )) : <Text size="sm">No match details recorded.</Text>}
              </Stack>

              {canManage && (
                <Stack gap="xs">
                  <Group grow>
                    <Select label="Log type" data={rules.supportedIncidentTypes.map((type) => ({ value: type, label: matchLogTypeLabel(type) }))} value={incidentType} onChange={(value) => setIncidentType(value ?? 'NOTE')} />
                    <Select label="Team" data={teamOptions} value={incidentTeamId} onChange={setIncidentTeamId} clearable />
                  </Group>
                  <Group grow>
                    <Select
                      label={rules.pointIncidentRequiresParticipant && incidentType === (rules.autoCreatePointIncidentType ?? 'POINT') ? 'Player' : 'Player (optional)'}
                      data={activeParticipantOptions.map((option) => ({ value: option.value, label: option.label }))}
                      value={incidentParticipantId}
                      onChange={setIncidentParticipantId}
                      clearable={!rules.pointIncidentRequiresParticipant}
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
                      disabled={rules.pointIncidentRequiresParticipant && incidentType === (rules.autoCreatePointIncidentType ?? 'POINT') && !selectedParticipant}
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
              <Text fw={600}>Record Scoring Details</Text>
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
                    updateScore(pendingPoint.teamId, pendingPoint.delta, incidentNote);
                    setPendingPoint(null);
                    setIncidentMinute('');
                    setIncidentNote('');
                  }}
                  disabled={rules.pointIncidentRequiresParticipant && !selectedParticipant}
                >
                  Save Point
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        <Group grow align="stretch">
          {[{ team: match.team1, teamId: team1Id, current: team1Score }, { team: match.team2, teamId: team2Id, current: team2Score }].map(({ team, teamId, current }, index) => (
            <Paper key={teamId ?? index} withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Group>
                  {team && <Avatar src={getTeamAvatarUrl(team, 40)} radius="xl" size={40} alt={teamName(team)} />}
                  <Text fw={600}>{teamName(team)}</Text>
                </Group>
                {canScore && (
                  <Group gap="xs">
                    <ActionIcon variant="light" color="red" onClick={() => requestScore(teamId, -1)} disabled={current === 0}>-</ActionIcon>
                    <ActionIcon variant="light" color="green" onClick={() => requestScore(teamId, 1)}>+</ActionIcon>
                  </Group>
                )}
              </Group>
              <Text ta="center" fw={700} size="xl">{current}</Text>
              <Group justify="center" gap="xs" mt={6}>
                {segments.map((segment, segmentIndex) => (
                  <Text key={`${teamId}-${segment.id}`} size="sm" className={`${segmentIndex === activeIndex ? 'bg-blue-100 text-blue-800' : segment.winnerEventTeamId === teamId ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} px-2 py-1 rounded`}>
                    {scoreForSegment(segment, segmentIndex, teamId, teamId === team1Id ? match.team1Points : match.team2Points)}
                  </Text>
                ))}
              </Group>
            </Paper>
          ))}
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
