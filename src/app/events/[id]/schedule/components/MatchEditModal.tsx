'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Group, Text, Button, Alert, Select, Divider, Checkbox, Switch } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';

import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { filterValidNextMatchCandidates, validateAndNormalizeBracketGraph, type BracketNode } from '@/server/matches/bracketGraph';

import type { EventOfficial, EventOfficialPosition, Field, Match, MatchOfficialAssignment, Team, UserData } from '@/types';

interface MatchEditModalProps {
  opened: boolean;
  match: Match | null;
  allMatches?: Match[];
  fields?: Field[];
  teams?: Team[];
  officials?: UserData[];
  officialPositions?: EventOfficialPosition[];
  eventOfficials?: EventOfficial[];
  doTeamsOfficiate?: boolean;
  isCreateMode?: boolean;
  creationContext?: 'schedule' | 'bracket';
  eventType?: string | null;
  enforceScheduleFields?: boolean;
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
  allMatches = [],
  fields = [],
  teams = [],
  officials = [],
  officialPositions = [],
  eventOfficials = [],
  doTeamsOfficiate = false,
  isCreateMode = false,
  creationContext = 'bracket',
  eventType = null,
  enforceScheduleFields = false,
  onClose,
  onSave,
  onDelete,
}: MatchEditModalProps) {
  const [startValue, setStartValue] = useState<Date | null>(null);
  const [endValue, setEndValue] = useState<Date | null>(null);
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
  const [error, setError] = useState<string | null>(null);
  const requiresScheduleFields = enforceScheduleFields || creationContext === 'schedule';

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!match || !opened) {
      setStartValue(null);
      setEndValue(null);
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
      setError(null);
      return;
    }

    setStartValue(coerceDate(match.start));
    setEndValue(coerceDate(match.end));
    setFieldId(getEntityId(match.field));
    setTeam1Id(resolveMatchTeamId(match, 'team1'));
    setTeam2Id(resolveMatchTeamId(match, 'team2'));
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
  }, [eventOfficials, match, officialPositions, opened]);
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
        label: field.name || `Field ${field.fieldNumber ?? ''}`.trim(),
      });
      return acc;
    }, []),
    [fields],
  );

  const selectedTeam1 = useMemo(() => findTeamById(team1Id, teams, match?.team1), [team1Id, teams, match]);
  const selectedTeam2 = useMemo(() => findTeamById(team2Id, teams, match?.team2), [team2Id, teams, match]);
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

    if (team1Id && team2Id && team1Id === team2Id) {
      setError('Team 1 and Team 2 must be different.');
      return;
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

    const updated: Match = {
      ...match,
      start: startValue ? formatLocalDateTime(startValue) : null,
      end: endValue ? formatLocalDateTime(endValue) : null,
      locked,
      losersBracket,
      winnerNextMatchId: selectedWinnerNextMatchId ?? undefined,
      loserNextMatchId: selectedLoserNextMatchId ?? undefined,
    };
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

    const nextField = findFieldById(fieldId);
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

  return (
    <Modal opened={opened} onClose={handleClose} title={isCreateMode ? 'Add Match' : 'Edit Match'} centered size="lg">
      <Stack gap="md">
        {error && (
          <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="dimmed">Match</Text>
            <Text fw={600}>{match?.matchId ?? match?.$id}</Text>
          </div>
          <div className="text-right">
            <Text size="sm" c="dimmed">Bracket</Text>
            <Text fw={600}>
              {losersBracket ? 'Losers Bracket' : 'Winners Bracket'}
            </Text>
          </div>
        </Group>

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

        <Select
          label="Team 1"
          data={team1Options}
          value={team1Id}
          onChange={setTeam1Id}
          placeholder="Select team"
          clearable
        />
        <Select
          label="Team 2"
          data={team2Options}
          value={team2Id}
          onChange={setTeam2Id}
          placeholder="Select team"
          clearable
        />
        <Select
          label="Team Official"
          description={doTeamsOfficiate ? undefined : 'Optional when teams are not providing officials.'}
          data={teamOptions}
          value={teamOfficialId}
          onChange={setTeamOfficialId}
          placeholder="Select official team"
          clearable
        />
        {officialPositions.length > 0 ? (
          <Stack gap="sm">
            <Divider label="Official Assignments" />
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
              return (
                <Select
                  key={`${position.id}:${slotIndex}`}
                  label={position.count > 1 ? `${position.name} ${slotIndex + 1}` : position.name}
                  data={options}
                  value={currentValue}
                  onChange={(value) => handleOfficialAssignmentChange(position.id, slotIndex, value)}
                  placeholder="Unassigned"
                  clearable
                  searchable
                  nothingFoundMessage={options.length ? 'No matches' : 'No eligible officials or players'}
                />
              );
            })}
          </Stack>
        ) : (
          <Select
            label="Official"
            data={officialOptions}
            value={userOfficialId}
            onChange={setUserOfficialId}
            placeholder="Select official"
            clearable
            searchable
            nothingFoundMessage={officialOptions.length ? 'No matches' : 'No officials available'}
          />
        )}

        {fieldOptions.length > 0 && (
          <Select
            label="Field"
            data={fieldOptions}
            value={fieldId}
            onChange={setFieldId}
            placeholder="Select field"
            clearable
          />
        )}

        <DateTimePicker
          label={requiresScheduleFields ? 'Start time' : 'Start time (optional)'}
          value={startValue}
          onChange={handleStartDateChange}
          withSeconds
          valueFormat="MM/DD/YYYY hh:mm:ss A"
          timePickerProps={MATCH_TIME_PICKER_PROPS}
          required={requiresScheduleFields}
        />
        <DateTimePicker
          label={requiresScheduleFields ? 'End time' : 'End time (optional)'}
          value={endValue}
          onChange={handleEndDateChange}
          withSeconds
          valueFormat="MM/DD/YYYY hh:mm:ss A"
          timePickerProps={MATCH_TIME_PICKER_PROPS}
          required={requiresScheduleFields}
          minDate={startValue ?? undefined}
        />

        <Divider label="Bracket Links" />

        <Select
          label="Winner advances to"
          data={winnerNextOptions}
          value={selectedWinnerNextMatchId}
          onChange={setWinnerNextMatchId}
          placeholder="No next winner match"
          clearable
          searchable
          nothingFoundMessage={winnerNextOptions.length ? 'No matches' : 'No valid matches'}
        />
        <Select
          label="Loser advances to"
          data={loserNextOptions}
          value={selectedLoserNextMatchId}
          onChange={setLoserNextMatchId}
          placeholder="No next loser match"
          clearable
          searchable
          nothingFoundMessage={loserNextOptions.length ? 'No matches' : 'No valid matches'}
        />

        <Divider label="Match Operations" />
        <Text size="sm" c="dimmed">
          Scores, segment winners, official check-in, and the match log are handled from Match Details.
        </Text>

        <Group justify="space-between" mt="md">
          <Group>
            {onDelete && (
              <Button
                variant="light"
                color="red"
                onClick={handleDelete}
              >
                {isCreateMode ? 'Discard match' : 'Delete match'}
              </Button>
            )}
          </Group>
          <Group>
            <Button variant="default" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={requiresScheduleFields && (!startValue || !endValue || !fieldId)}>
              {isCreateMode ? 'Create match' : 'Save changes'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
