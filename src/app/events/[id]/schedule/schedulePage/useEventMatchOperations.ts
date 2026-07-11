import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { createClientId } from '@/lib/clientId';
import { formatLocalDateTime } from '@/lib/dateUtils';
import { tournamentService } from '@/lib/tournamentService';
import type {
  Event,
  Field,
  Match,
  MatchIncidentOperation,
  MatchLifecycleOperation,
  MatchOfficialCheckInOperation,
  MatchSegment,
  MatchSegmentOperation,
  Team,
} from '@/types';

import {
  CLIENT_MATCH_PREFIX,
  LOCAL_PLACEHOLDER_PREFIX,
  asBulkMatchRef,
  clearMatchReferencesToTarget,
  cloneValue,
  getClientIdFromMatchId,
  isClientMatchId,
  nextMatchSequenceNumber,
  normalizeDraftBracketGraph,
  normalizeIdToken,
  type MatchCreateContext,
  type StagedMatchCreateMeta,
} from './helpers';

export type MatchOperationPayload = {
  matchId: string;
  segments?: MatchSegment[];
  finalize?: boolean;
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
  matchAction?: {
    action: 'FORFEIT' | 'CANCEL' | 'SUSPEND' | 'RESUME';
    forfeitingEventTeamId?: string | null;
    winnerEventTeamId?: string | null;
    reason?: string | null;
  };
  team1Points: number[];
  team2Points: number[];
  setResults: number[];
  time?: string;
};

type UseEventMatchOperationsParams = {
  activeEvent: Event | null;
  activeMatches: Match[];
  canEditMatches: boolean;
  changesMatches: Match[];
  eventId?: string;
  matches: Match[];
  onDraftMatchChanged: () => void;
  setChangesEvent: Dispatch<SetStateAction<Event | null>>;
  setChangesMatches: Dispatch<SetStateAction<Match[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setEvent: Dispatch<SetStateAction<Event | null>>;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setMatches: Dispatch<SetStateAction<Match[]>>;
};

export default function useEventMatchOperations({
  activeEvent,
  activeMatches,
  canEditMatches,
  changesMatches,
  eventId,
  matches,
  onDraftMatchChanged,
  setChangesEvent,
  setChangesMatches,
  setError,
  setEvent,
  setHasUnsavedChanges,
  setInfoMessage,
  setMatches,
}: UseEventMatchOperationsParams) {
  const [isMatchEditorOpen, setIsMatchEditorOpen] = useState(false);
  const [matchEditorContext, setMatchEditorContext] = useState<MatchCreateContext>('bracket');
  const [pendingCreateMatchId, setPendingCreateMatchId] = useState<string | null>(null);
  const [stagedMatchCreates, setStagedMatchCreates] = useState<Record<string, StagedMatchCreateMeta>>({});
  const [stagedMatchDeletes, setStagedMatchDeletes] = useState<string[]>([]);
  const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);
  const [scoreUpdateMatch, setScoreUpdateMatch] = useState<Match | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);

  const resetStagedMatchDrafts = useCallback(() => {
    setStagedMatchCreates({});
    setStagedMatchDeletes([]);
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');
  }, []);

  const resetMatchEditorState = useCallback(() => {
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, []);

  const closeScoreModal = useCallback(() => {
    setIsScoreModalOpen(false);
    setScoreUpdateMatch(null);
  }, []);

  const openScoreModalForMatch = useCallback((match: Match) => {
    setScoreUpdateMatch(match);
    setIsScoreModalOpen(true);
  }, []);

  const stageMatchCreate = useCallback((params: {
    creationContext: MatchCreateContext;
    seed?: Partial<Match>;
    openEditor?: boolean;
  }) => {
    if (!canEditMatches || !activeEvent?.$id) {
      return null;
    }

    const clientId = createClientId();
    const matchId = `${CLIENT_MATCH_PREFIX}${clientId}`;
    const now = new Date();
    const defaultStart = formatLocalDateTime(now);
    const defaultEnd = formatLocalDateTime(new Date(now.getTime() + 60 * 60 * 1000));
    const nextMatchId = nextMatchSequenceNumber(activeMatches);
    const isTournamentEvent = String(activeEvent.eventType ?? '').toUpperCase() === 'TOURNAMENT';
    const existingPlaceholderCount = activeMatches.reduce((count, match) => {
      const team1Name = (match.team1 as { name?: string } | null)?.name ?? '';
      const team2Name = (match.team2 as { name?: string } | null)?.name ?? '';
      const nameBucket = [team1Name, team2Name].join(' ').toLowerCase();
      return nameBucket.includes('place holder') ? count + 1 : count;
    }, 0);
    const placeholderTeam = isTournamentEvent
      ? ({
          $id: `${LOCAL_PLACEHOLDER_PREFIX}${clientId}`,
          name: `Place Holder ${existingPlaceholderCount + 1}`,
          division: normalizeIdToken(params.seed?.division as string | undefined) ?? undefined,
        } as unknown as Team)
      : undefined;

    const draft: Match = {
      $id: matchId,
      matchId: typeof params.seed?.matchId === 'number' ? params.seed.matchId : nextMatchId,
      eventId: activeEvent.$id,
      team1Id: null,
      team2Id: null,
      officialId: null,
      officialIds: [],
      teamOfficialId: null,
      fieldId: params.creationContext === 'schedule'
        ? normalizeIdToken(params.seed?.fieldId as string | undefined)
        : null,
      locked: false,
      team1Points: [],
      team2Points: [],
      setResults: [],
      losersBracket: Boolean(params.seed?.losersBracket),
      winnerNextMatchId: asBulkMatchRef(params.seed?.winnerNextMatchId as string | undefined),
      loserNextMatchId: asBulkMatchRef(params.seed?.loserNextMatchId as string | undefined),
      previousLeftId: asBulkMatchRef(params.seed?.previousLeftId as string | undefined),
      previousRightId: asBulkMatchRef(params.seed?.previousRightId as string | undefined),
      side: params.seed?.side ?? null,
      officialCheckedIn: false,
      start: params.creationContext === 'schedule' ? defaultStart : null,
      end: params.creationContext === 'schedule' ? defaultEnd : null,
      division: (params.seed?.division as string | undefined) ?? null,
      team1: placeholderTeam,
    };

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      base.push(cloneValue(draft) as Match);
      return base;
    });
    setStagedMatchCreates((prev) => ({
      ...prev,
      [matchId]: {
        clientId,
        creationContext: params.creationContext,
        autoPlaceholderTeam: isTournamentEvent,
      },
    }));
    setHasUnsavedChanges(true);

    if (params.openEditor) {
      setMatchEditorContext(params.creationContext);
      setPendingCreateMatchId(matchId);
      setMatchBeingEdited(cloneValue(draft) as Match);
      setIsMatchEditorOpen(true);
    }

    return draft;
  }, [activeEvent?.$id, activeEvent?.eventType, activeMatches, canEditMatches, matches, setChangesMatches, setHasUnsavedChanges]);

  const removeDraftMatch = useCallback((matchId: string, options?: {
    stageDelete?: boolean;
    markUnsaved?: boolean;
  }) => {
    const normalizedId = normalizeIdToken(matchId);
    if (!normalizedId) {
      return;
    }
    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      return base
        .filter((candidate) => candidate.$id !== normalizedId)
        .map((candidate) => clearMatchReferencesToTarget(candidate, normalizedId));
    });
    setStagedMatchCreates((prev) => {
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
    setStagedMatchDeletes((prev) => {
      const withoutTarget = prev.filter((candidate) => candidate !== normalizedId);
      if (options?.stageDelete && !isClientMatchId(normalizedId)) {
        return [...withoutTarget, normalizedId];
      }
      return withoutTarget;
    });
    if (options?.markUnsaved !== false) {
      setHasUnsavedChanges(true);
    }
  }, [matches, setChangesMatches, setHasUnsavedChanges]);

  const removeStagedClientMatch = useCallback((matchId: string) => {
    removeDraftMatch(matchId, { stageDelete: false, markUnsaved: false });
  }, [removeDraftMatch]);

  const handleMatchDelete = useCallback((target: Match) => {
    const targetId = normalizeIdToken(target.$id);
    if (!targetId) {
      return;
    }
    removeDraftMatch(targetId, {
      stageDelete: !isClientMatchId(targetId),
      markUnsaved: true,
    });
    if (pendingCreateMatchId === targetId) {
      setPendingCreateMatchId(null);
    }
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [pendingCreateMatchId, removeDraftMatch]);

  const handleAddScheduleMatch = useCallback(() => {
    stageMatchCreate({ creationContext: 'schedule', openEditor: true });
  }, [stageMatchCreate]);

  const handleAddBracketMatch = useCallback(() => {
    stageMatchCreate({ creationContext: 'bracket', openEditor: true });
  }, [stageMatchCreate]);

  const handleMatchEditRequest = useCallback((match: Match, context: MatchCreateContext = 'bracket') => {
    if (!canEditMatches) return;
    const sourceMatch = activeMatches.find((candidate) => candidate.$id === match.$id);
    if (!sourceMatch) return;
    setMatchEditorContext(context);
    setPendingCreateMatchId(null);
    setMatchBeingEdited(cloneValue(sourceMatch) as Match);
    setIsMatchEditorOpen(true);
  }, [activeMatches, canEditMatches]);

  const handleMatchEditClose = useCallback(() => {
    if (pendingCreateMatchId) {
      removeStagedClientMatch(pendingCreateMatchId);
      setPendingCreateMatchId(null);
    }
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [pendingCreateMatchId, removeStagedClientMatch]);

  const handleMatchEditSave = useCallback((updated: Match) => {
    const base = (changesMatches.length ? changesMatches : (cloneValue(matches) as Match[]))
      .map((item) => cloneValue(item) as Match);
    let replaced = false;
    const nextMatches = base.map((item) => {
      if (item.$id === updated.$id) {
        replaced = true;
        return cloneValue(updated) as Match;
      }
      return item;
    });
    if (!replaced) {
      nextMatches.push(cloneValue(updated) as Match);
    }

    const normalizedMatches = normalizeDraftBracketGraph(nextMatches);

    setChangesMatches(normalizedMatches);
    onDraftMatchChanged();
    if (isClientMatchId(updated.$id)) {
      setStagedMatchCreates((prev) => {
        if (prev[updated.$id]) {
          return prev;
        }
        return {
          ...prev,
          [updated.$id]: {
            clientId: getClientIdFromMatchId(updated.$id),
            creationContext: matchEditorContext,
            autoPlaceholderTeam: String(activeEvent?.eventType ?? '').toUpperCase() === 'TOURNAMENT',
          },
        };
      });
    }
    setHasUnsavedChanges(true);
    setPendingCreateMatchId(null);
    setMatchEditorContext('bracket');
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [
    activeEvent?.eventType,
    changesMatches,
    matchEditorContext,
    matches,
    onDraftMatchChanged,
    setChangesMatches,
    setHasUnsavedChanges,
  ]);

  const handleToggleLockAllMatches = useCallback((locked: boolean, matchIds: string[]) => {
    if (!canEditMatches || matchIds.length === 0) return;
    const matchIdSet = new Set(matchIds);
    const lockLabel = locked ? 'Locked' : 'Unlocked';

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      return base.map((match) => (
        matchIdSet.has(match.$id)
          ? ({ ...match, locked } as Match)
          : match
      ));
    });
    setHasUnsavedChanges(true);

    setInfoMessage(`${lockLabel} ${matchIdSet.size} match${matchIdSet.size === 1 ? '' : 'es'}.`);
  }, [canEditMatches, matches, setChangesMatches, setHasUnsavedChanges, setInfoMessage]);

  const handleMatchCalendarMove = useCallback((
    target: Match,
    range: { start: Date; end: Date; fieldId?: string | null },
  ) => {
    if (!canEditMatches) return;
    const targetId = normalizeIdToken(target.$id);
    if (!targetId || !(range.start instanceof Date) || Number.isNaN(range.start.getTime())) {
      return;
    }

    const nextStart = new Date(range.start.getTime());
    const nextEnd = range.end instanceof Date && !Number.isNaN(range.end.getTime()) && range.end.getTime() > nextStart.getTime()
      ? new Date(range.end.getTime())
      : new Date(nextStart.getTime() + 60 * 60 * 1000);
    const nextFieldId = normalizeIdToken(range.fieldId ?? target.fieldId ?? null);
    const nextField = nextFieldId && Array.isArray(activeEvent?.fields)
      ? activeEvent.fields.find((field: Field) => field.$id === nextFieldId)
      : undefined;

    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      let changed = false;
      const nextMatches = base.map((match) => {
        if (match.$id !== targetId) {
          return match;
        }
        changed = true;
        return {
          ...match,
          start: nextStart.toISOString(),
          end: nextEnd.toISOString(),
          fieldId: nextFieldId ?? null,
          ...(nextField ? { field: nextField } : { field: undefined }),
        } as Match;
      });
      return changed ? normalizeDraftBracketGraph(nextMatches) : base;
    });
    onDraftMatchChanged();
    setHasUnsavedChanges(true);
  }, [activeEvent?.fields, canEditMatches, matches, onDraftMatchChanged, setChangesMatches, setHasUnsavedChanges]);

  const applyMatchUpdate = useCallback((updated: Match) => {
    const cloned = cloneValue(updated) as Match;
    const replaceInList = (list?: Match[]) => {
      if (!Array.isArray(list)) return list;
      let found = false;
      const next = list.map((item) => {
        if (item.$id === cloned.$id) {
          found = true;
          return cloneValue(cloned) as Match;
        }
        return item;
      });
      if (!found) {
        next.push(cloneValue(cloned) as Match);
      }
      return next;
    };

    setMatches((prev) => replaceInList(prev) as Match[]);
    setChangesMatches((prev) => replaceInList(prev) as Match[]);
    setEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
    setChangesEvent((prev) => {
      if (!prev) return prev;
      return { ...prev, matches: replaceInList(prev.matches as Match[] | undefined) as Match[] };
    });
    setMatchBeingEdited((current) => (
      current?.$id === cloned.$id ? (cloneValue(cloned) as Match) : current
    ));
    setScoreUpdateMatch((current) => (
      current?.$id === cloned.$id ? (cloneValue(cloned) as Match) : current
    ));
  }, [setChangesEvent, setChangesMatches, setEvent, setMatches]);

  const handleScoreChange = useCallback(
    async ({
      matchId,
      team1Points,
      team2Points,
      setResults,
      scoreSet,
      finalize,
      segmentOperations,
      incidentOperations,
      lifecycle,
      officialCheckIn,
      matchAction,
      time,
    }: MatchOperationPayload) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        const hasOperations =
          Boolean(scoreSet)
          || Boolean(segmentOperations?.length)
          || Boolean(incidentOperations?.length)
          || Boolean(lifecycle)
          || Boolean(officialCheckIn)
          || Boolean(matchAction);
        let updated: Match;
        if (scoreSet) {
          updated = await tournamentService.setMatchScore(targetEventId, matchId, scoreSet);
        } else if (
          incidentOperations?.length === 1
          && incidentOperations[0]?.action === 'CREATE'
          && !segmentOperations?.length
          && !officialCheckIn
        ) {
          updated = await tournamentService.addMatchIncident(targetEventId, matchId, incidentOperations[0]);
        } else if (hasOperations) {
          updated = await tournamentService.updateMatchOperations(targetEventId, matchId, {
            finalize,
            segmentOperations,
            incidentOperations,
            lifecycle,
            officialCheckIn,
            matchAction,
            time,
          });
        } else {
          updated = await tournamentService.updateMatchScores(targetEventId, matchId, { team1Points, team2Points, setResults });
        }
        applyMatchUpdate(updated as Match);
      } catch (err) {
        console.warn('Non-blocking match operation sync failed:', err);
        throw err;
      }
    },
    [activeEvent?.$id, applyMatchUpdate, eventId],
  );

  const handleSetComplete = useCallback(
    async ({
      matchId,
      team1Points,
      team2Points,
      setResults,
      finalize,
      segmentOperations,
      incidentOperations,
      time,
    }: MatchOperationPayload) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      const hasOperations = Boolean(segmentOperations?.length) || Boolean(incidentOperations?.length);
      const updated = hasOperations
        ? await tournamentService.updateMatchOperations(targetEventId, matchId, {
            finalize,
            segmentOperations,
            incidentOperations,
            time,
          })
        : await tournamentService.updateMatchScores(targetEventId, matchId, {
            team1Points,
            team2Points,
            setResults,
            finalize,
            time,
          });
      applyMatchUpdate(updated as Match);
    },
    [applyMatchUpdate, activeEvent?.$id, eventId],
  );

  const handleScoreSubmit = useCallback(
    async (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId) return;
      try {
        const updated = await tournamentService.updateMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
        applyMatchUpdate(updated as Match);
        setScoreUpdateMatch(null);
        setIsScoreModalOpen(false);
      } catch (err) {
        console.error('Failed to update score:', err);
        setError('Failed to update score. Please try again.');
      }
    },
    [applyMatchUpdate, activeEvent?.$id, eventId, setError],
  );

  useEffect(() => {
    if (!canEditMatches && isMatchEditorOpen) {
      setIsMatchEditorOpen(false);
      setMatchBeingEdited(null);
    }
  }, [canEditMatches, isMatchEditorOpen]);

  return {
    applyMatchUpdate,
    closeScoreModal,
    handleAddBracketMatch,
    handleAddScheduleMatch,
    handleMatchCalendarMove,
    handleMatchDelete,
    handleMatchEditClose,
    handleMatchEditRequest,
    handleMatchEditSave,
    handleScoreChange,
    handleScoreSubmit,
    handleSetComplete,
    handleToggleLockAllMatches,
    isMatchEditorOpen,
    isScoreModalOpen,
    matchBeingEdited,
    matchEditorContext,
    openScoreModalForMatch,
    resetMatchEditorState,
    resetStagedMatchDrafts,
    scoreUpdateMatch,
    setMatchBeingEdited,
    setScoreUpdateMatch,
    stagedMatchCreates,
    stagedMatchDeletes,
  };
}
