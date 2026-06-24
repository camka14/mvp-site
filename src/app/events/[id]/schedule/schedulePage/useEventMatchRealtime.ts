import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { normalizeApiMatch } from '@/lib/apiMappers';
import { connectEventMatchSocket } from '@/lib/matchRealtimeClient';
import type { Event, Match } from '@/types';

import { cloneValue, normalizeIdToken } from './helpers';

type UseEventMatchRealtimeParams = {
  hasUnsavedChangesRef: MutableRefObject<boolean>;
  isBlockedForLocalEdits: boolean;
  isCreateMode: boolean;
  setChangesEvent: Dispatch<SetStateAction<Event | null>>;
  setChangesMatches: Dispatch<SetStateAction<Match[]>>;
  setEvent: Dispatch<SetStateAction<Event | null>>;
  setMatchBeingEdited: Dispatch<SetStateAction<Match | null>>;
  setMatches: Dispatch<SetStateAction<Match[]>>;
  setScoreUpdateMatch: Dispatch<SetStateAction<Match | null>>;
  targetEventId: string | null | undefined;
};

export default function useEventMatchRealtime({
  hasUnsavedChangesRef,
  isBlockedForLocalEdits,
  isCreateMode,
  setChangesEvent,
  setChangesMatches,
  setEvent,
  setMatchBeingEdited,
  setMatches,
  setScoreUpdateMatch,
  targetEventId,
}: UseEventMatchRealtimeParams) {
  const realtimeWasBlockedForLocalEditsRef = useRef(false);

  const normalizeRealtimeMatches = useCallback((incomingMatches: Match[] | undefined): Match[] => (
    (Array.isArray(incomingMatches) ? incomingMatches : [])
      .map((match) => cloneValue(normalizeApiMatch(match)) as Match)
      .filter((match) => Boolean(normalizeIdToken(match.$id)))
  ), []);

  const applyRealtimeMatchSnapshot = useCallback((incomingMatches: Match[]) => {
    const normalizedMatches = normalizeRealtimeMatches(incomingMatches);
    const matchesForState = () => cloneValue(normalizedMatches) as Match[];
    const byId = new Map(normalizedMatches.map((match) => [match.$id, match]));

    setMatches(matchesForState());
    setEvent((prev) => (prev ? { ...prev, matches: matchesForState() } : prev));
    if (!hasUnsavedChangesRef.current) {
      setChangesMatches(matchesForState());
      setChangesEvent((prev) => (prev ? { ...prev, matches: matchesForState() } : prev));
    }
    setScoreUpdateMatch((current) => {
      if (!current?.$id) return current;
      const replacement = byId.get(current.$id);
      return replacement ? (cloneValue(replacement) as Match) : current;
    });
    setMatchBeingEdited((current) => {
      if (!current?.$id) return current;
      const replacement = byId.get(current.$id);
      return replacement ? (cloneValue(replacement) as Match) : current;
    });
  }, [
    hasUnsavedChangesRef,
    normalizeRealtimeMatches,
    setChangesEvent,
    setChangesMatches,
    setEvent,
    setMatchBeingEdited,
    setMatches,
    setScoreUpdateMatch,
  ]);

  const applyRealtimeMatchChanges = useCallback((incomingMatches: Match[] | undefined, deletedIds: string[] | undefined) => {
    const normalizedMatches = normalizeRealtimeMatches(incomingMatches);
    const deletedSet = new Set(
      (deletedIds ?? [])
        .map((id) => normalizeIdToken(id))
        .filter((id): id is string => Boolean(id)),
    );
    const upsertsById = new Map(normalizedMatches.map((match) => [match.$id, match]));
    if (deletedSet.size === 0 && upsertsById.size === 0) {
      return;
    }

    const mergeList = (list: Match[] | undefined): Match[] => {
      const base = Array.isArray(list) ? list : [];
      const remaining = new Map(upsertsById);
      const next: Match[] = [];
      base.forEach((match) => {
        const matchId = normalizeIdToken(match.$id);
        if (matchId && deletedSet.has(matchId)) {
          return;
        }
        const replacement = matchId ? remaining.get(matchId) : undefined;
        if (replacement) {
          next.push(cloneValue(replacement) as Match);
          remaining.delete(matchId as string);
          return;
        }
        next.push(match);
      });
      remaining.forEach((match) => next.push(cloneValue(match) as Match));
      return next;
    };

    const updateFocusedMatch = (current: Match | null): Match | null => {
      if (!current?.$id) return current;
      if (deletedSet.has(current.$id)) return null;
      const replacement = upsertsById.get(current.$id);
      return replacement ? (cloneValue(replacement) as Match) : current;
    };

    setMatches((prev) => mergeList(prev));
    setEvent((prev) => (prev ? { ...prev, matches: mergeList(prev.matches as Match[] | undefined) } : prev));
    if (!hasUnsavedChangesRef.current) {
      setChangesMatches((prev) => mergeList(prev));
      setChangesEvent((prev) => (prev ? { ...prev, matches: mergeList(prev.matches as Match[] | undefined) } : prev));
    }
    setScoreUpdateMatch(updateFocusedMatch);
    setMatchBeingEdited(updateFocusedMatch);
  }, [
    hasUnsavedChangesRef,
    normalizeRealtimeMatches,
    setChangesEvent,
    setChangesMatches,
    setEvent,
    setMatchBeingEdited,
    setMatches,
    setScoreUpdateMatch,
  ]);

  useEffect(() => {
    const normalizedEventId = normalizeIdToken(targetEventId);
    const shouldRefreshOnConnect = realtimeWasBlockedForLocalEditsRef.current;
    realtimeWasBlockedForLocalEditsRef.current = isBlockedForLocalEdits;
    if (!normalizedEventId || isCreateMode || isBlockedForLocalEdits) {
      return undefined;
    }

    const realtimeEventId = normalizedEventId;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const realtimeAbortController = new AbortController();

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const refreshAfterDisconnect = async () => {
      try {
        const response = await apiRequest<{ matches?: Match[] }>(
          `/api/events/${realtimeEventId}/matches`,
          { timeoutMs: 15_000 },
        );
        if (!cancelled) {
          applyRealtimeMatchSnapshot(response.matches ?? []);
        }
      } catch (refreshError) {
        if (!cancelled) {
          console.warn('Failed to refresh matches after realtime disconnect:', refreshError);
        }
      }
    };

    const scheduleReconnect = () => {
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        void connect();
      }, 2500);
    };

    async function connect() {
      try {
        const nextSocket = await connectEventMatchSocket({
          eventId: realtimeEventId,
          signal: realtimeAbortController.signal,
          onMessage: (message) => {
            if (message.type !== 'match.changed' || message.eventId !== realtimeEventId) {
              return;
            }
            applyRealtimeMatchChanges(message.matches, message.deleted);
          },
          onClose: () => {
            if (cancelled) {
              return;
            }
            void refreshAfterDisconnect().finally(scheduleReconnect);
          },
          onError: (event) => {
            console.warn('Match realtime socket error:', event);
          },
        });
        if (cancelled) {
          nextSocket.close(1000, 'Event changed');
          return;
        }
        socket = nextSocket;
      } catch (socketError) {
        if (cancelled) {
          return;
        }
        if (isApiRequestError(socketError) && [401, 403, 404].includes(socketError.status)) {
          return;
        }
        console.warn('Failed to connect match realtime socket:', socketError);
        scheduleReconnect();
      }
    }

    if (shouldRefreshOnConnect) {
      void refreshAfterDisconnect().finally(connect);
    } else {
      void connect();
    }

    return () => {
      cancelled = true;
      realtimeAbortController.abort();
      clearReconnectTimer();
      socket?.close(1000, 'Event changed');
    };
  }, [
    applyRealtimeMatchChanges,
    applyRealtimeMatchSnapshot,
    isBlockedForLocalEdits,
    isCreateMode,
    targetEventId,
  ]);
}
