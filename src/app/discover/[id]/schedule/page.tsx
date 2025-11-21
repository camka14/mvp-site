'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Badge, Tabs, Stack, Table, UnstyledButton } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { deepEqual } from '@/app/utils';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import type { Event, EventPayload, EventState, Field, Match, TimeSlot, Team, TournamentBracket } from '@/types';
import { toEventPayload } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';
import MatchEditModal from './components/MatchEditModal';

const cloneValue = <T,>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const structuredCloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (structuredCloneFn) {
    return structuredCloneFn(value);
  }

  // Fallback handles circular references by walking the graph manually
  const seen = new WeakMap<object, any>();
  const cloneRecursive = (input: any): any => {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    if (Array.isArray(input)) {
      const arr: any[] = [];
      seen.set(input, arr);
      for (const item of input) {
        arr.push(cloneRecursive(item));
      }
      return arr;
    }

    if (input instanceof Date) {
      return new Date(input.getTime());
    }

    const cloned: Record<string, unknown> = {};
    seen.set(input, cloned);
    for (const key of Object.keys(input)) {
      cloned[key] = cloneRecursive(input[key]);
    }
    return cloned;
  };

  return cloneRecursive(value);
};

const EVENT_CACHE_PREFIX = 'event-cache:';
const EVENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedEventEntry = {
  timestamp: number;
  event: Event;
};

const toId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '$id' in (value as any) && typeof (value as any).$id === 'string') {
    return (value as any).$id;
  }
  if (typeof value === 'object' && 'matchId' in (value as any)) {
    const matchIdValue = (value as any).matchId;
    if (typeof matchIdValue === 'string') return matchIdValue;
    if (typeof matchIdValue === 'number') return String(matchIdValue);
  }
  return undefined;
};

const sanitizeMatchForCache = (match: Match): Match => {
  const {
    field,
    team1,
    team2,
    division,
    referee,
    teamReferee,
    previousLeftMatch,
    previousRightMatch,
    winnerNextMatch,
    loserNextMatch,
    ...rest
  } = match;

  return {
    ...rest,
    fieldId: rest.fieldId ?? toId(field),
    team1Id: rest.team1Id ?? toId(team1),
    team2Id: rest.team2Id ?? toId(team2),
    refereeId: rest.refereeId ?? toId(referee),
    teamRefereeId: rest.teamRefereeId ?? toId(teamReferee),
    previousLeftId: rest.previousLeftId ?? toId(previousLeftMatch),
    previousRightId: rest.previousRightId ?? toId(previousRightMatch),
    winnerNextMatchId: rest.winnerNextMatchId ?? toId(winnerNextMatch),
    loserNextMatchId: rest.loserNextMatchId ?? toId(loserNextMatch),
  };
};

const sanitizeFieldForCache = (field: Field): Field => {
  const { matches, events, organization, rentalSlots, divisions, ...rest } = field;
  return {
    ...rest,
    divisions: Array.isArray(divisions)
      ? divisions
          .map((division) => (typeof division === 'string' ? division : toId(division) ?? division))
          .filter(Boolean) as string[]
      : undefined,
  };
};

const sanitizeTeamForCache = (team: Team): Team => {
  const { matches, players, pendingPlayers, captain, ...rest } = team;
  return {
    ...rest,
    players,
    pendingPlayers,
    captain,
  };
};

const sanitizeTimeSlotsForCache = (slots?: TimeSlot[]) =>
  Array.isArray(slots)
    ? slots.map((slot) => {
        const { event, ...rest } = slot;
        return rest;
      })
    : undefined;

const sanitizeEventForCache = (event: Event): Event => {
  const clone = cloneValue(event) as Event;

  if (Array.isArray(clone.matches)) {
    clone.matches = clone.matches.map(sanitizeMatchForCache);
  }

  if (Array.isArray(clone.fields)) {
    clone.fields = clone.fields.map(sanitizeFieldForCache);
  }

  if (Array.isArray(clone.teams)) {
    clone.teams = clone.teams.map(sanitizeTeamForCache);
  }

  clone.timeSlots = sanitizeTimeSlotsForCache(clone.timeSlots);

  return clone;
};

const rehydrateCachedEvent = (cached: Event): Event => {
  const clone = cloneValue(cached) as Event;
  const fieldMap = new Map<string, Field>();
  if (Array.isArray(clone.fields)) {
    clone.fields.forEach((field) => {
      if (field?.$id) {
        fieldMap.set(field.$id, field);
      }
    });
  }

  const teamMap = new Map<string, Team>();
  if (Array.isArray(clone.teams)) {
    clone.teams.forEach((team) => {
      if (team?.$id) {
        teamMap.set(team.$id, team);
      }
    });
  }

  if (Array.isArray(clone.matches)) {
    clone.matches = clone.matches.map((match) => {
      const hydrated = { ...match };
      if (!hydrated.field && hydrated.fieldId && fieldMap.has(hydrated.fieldId)) {
        hydrated.field = fieldMap.get(hydrated.fieldId);
      }
      if (!hydrated.team1 && hydrated.team1Id && teamMap.has(hydrated.team1Id)) {
        hydrated.team1 = teamMap.get(hydrated.team1Id);
      }
      if (!hydrated.team2 && hydrated.team2Id && teamMap.has(hydrated.team2Id)) {
        hydrated.team2 = teamMap.get(hydrated.team2Id);
      }
      return hydrated;
    });
  }

  return clone;
};

type StandingsSortField = 'team' | 'wins' | 'losses' | 'draws' | 'points';

type StandingsRow = {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  matchesPlayed: number;
  points: number;
};

type RankedStandingsRow = StandingsRow & { rank: number };

const getEventCacheKey = (eventId: string): string => `${EVENT_CACHE_PREFIX}${eventId}`;

const readEventFromCache = (eventId: string): Event | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getEventCacheKey(eventId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedEventEntry;
    if (!parsed || typeof parsed.timestamp !== 'number' || !parsed.event) {
      window.localStorage.removeItem(getEventCacheKey(eventId));
      return null;
    }

    if (Date.now() - parsed.timestamp > EVENT_CACHE_TTL_MS) {
      window.localStorage.removeItem(getEventCacheKey(eventId));
      return null;
    }

    return rehydrateCachedEvent(parsed.event as Event);
  } catch (error) {
    console.warn('Failed to read event cache:', error);
    return null;
  }
};

const writeEventToCache = (event: Event) => {
  if (typeof window === 'undefined' || !event?.$id) {
    return;
  }

  try {
    const payload: CachedEventEntry = {
      timestamp: Date.now(),
      event: sanitizeEventForCache(event),
    };
    window.localStorage.setItem(getEventCacheKey(event.$id), JSON.stringify(payload));
  } catch (error) {
    console.warn(`Failed to cache event ${event.$id}:`, error);
  }
};

const clearEventCache = (eventId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getEventCacheKey(eventId));
  } catch (error) {
    console.warn(`Failed to clear cache for event ${eventId}:`, error);
  }
};

// Main schedule page component that protects access and renders league schedule/bracket content.
function EventScheduleContent() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const eventId = params?.id as string | undefined;
  const isPreview = searchParams?.get('preview') === '1';
  const isEditParam = searchParams?.get('mode') === 'edit';

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [changesEvent, setChangesEvent] = useState<Event | null>(null);
  const [changesMatches, setChangesMatches] = useState<Match[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('schedule');
  const [isMatchEditorOpen, setIsMatchEditorOpen] = useState(false);
  const [standingsSort, setStandingsSort] = useState<{ field: StandingsSortField; direction: 'asc' | 'desc' }>({
    field: 'points',
    direction: 'desc',
  });
  const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);

  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const isUnpublished = (activeEvent?.state ?? 'PUBLISHED') === 'UNPUBLISHED';
  const isEditingEvent = isPreview || isEditParam || isUnpublished;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const isTournament = activeEvent?.eventType === 'TOURNAMENT';
  const isHost = activeEvent?.hostId === user?.$id;
  const entityLabel = isTournament ? 'Tournament' : 'League';
  const canEditMatches = Boolean(isHost && isEditingEvent);
  const showDateOnMatches = useMemo(() => {
    if (!activeEvent?.start || !activeEvent?.end) return false;
    const start = new Date(activeEvent.start);
    const end = new Date(activeEvent.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
  }, [activeEvent?.start, activeEvent?.end]);

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const hydrateEvent = useCallback((loadedEvent: Event) => {
    const eventClone = cloneValue(loadedEvent) as Event;
    setEvent(eventClone);

    const normalizedMatches = Array.isArray(eventClone.matches)
      ? (cloneValue(eventClone.matches) as Match[])
      : [];

    setMatches(normalizedMatches);

    setChangesEvent((prev) => {
      if (hasUnsavedChangesRef.current && prev) {
        return prev;
      }
      return cloneValue(eventClone) as Event;
    });

    setChangesMatches((prev) => {
      if (hasUnsavedChangesRef.current && prev.length) {
        return prev;
      }
      return cloneValue(normalizedMatches) as Match[];
    });
  }, []);

  const hasChangeDiffers = useMemo(() => {
    if (!event || !changesEvent) {
      return false;
    }

    if (!deepEqual(event, changesEvent)) {
      return true;
    }

    if (!matches.length && !changesMatches.length) {
      return false;
    }

    return !deepEqual(matches, changesMatches);
  }, [event, changesEvent, matches, changesMatches]);

  useEffect(() => {
    setHasUnsavedChanges((prev) => (prev === hasChangeDiffers ? prev : hasChangeDiffers));
  }, [hasChangeDiffers]);
  const publishButtonLabel = (() => {
    if (!activeEvent || isPreview || isUnpublished) return `Publish ${entityLabel}`;
    if (!isEditingEvent) return `Edit ${entityLabel}`;
    return `Save ${entityLabel} Changes`;
  })();
  const cancelButtonLabel = (() => {
    if (isPreview) return `Cancel ${entityLabel} Preview`;
    if (isEditingEvent) return `Discard ${entityLabel} Changes`;
    return `Cancel ${entityLabel}`;
  })();

  // Kick off schedule loading once auth state is resolved or redirect unauthenticated users.
  // Hydrate event + match data from preview cache or Appwrite and sync local component state.
  const loadSchedule = useCallback(async () => {
    if (!eventId) return;

    setLoading(true);
    setError(null);

    let cachedEvent: Event | null = null;

    if (typeof window !== 'undefined') {
      cachedEvent = readEventFromCache(eventId);
      if (cachedEvent) {
        hydrateEvent(cachedEvent);
        if (!hasUnsavedChangesRef.current) {
          setHasUnsavedChanges(false);
        }
      }
    }

    try {
      const fetchedEvent = (await eventService.getEventWithRelations(eventId)) ?? null;

      if (!fetchedEvent) {
        if (!cachedEvent) {
          setError('League not found.');
        }
        return;
      }

      hydrateEvent(fetchedEvent);
      writeEventToCache(fetchedEvent);
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      if (!cachedEvent) {
        setError('Failed to load league schedule. Please try again.');
      } else {
        setInfoMessage('Showing cached schedule data. Some information may be outdated.');
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, hydrateEvent]);

  useEffect(() => {
    if (!eventId || authLoading) {
      return;
    }

    if (!isAuthenticated && !isGuest) {
      router.push('/login');
      return;
    }

    loadSchedule();
  }, [authLoading, eventId, isAuthenticated, isGuest, isPreview, loadSchedule, router]);

  const playoffMatches = useMemo(
    () =>
      activeMatches.filter((match) =>
        Boolean(
          match.previousLeftId ||
            match.previousRightId ||
            match.winnerNextMatchId ||
            match.loserNextMatchId,
        ),
      ),
    [activeMatches],
  );

  const bracketMatchesMap = useMemo<Record<string, Match> | null>(() => {
    if (!playoffMatches.length) {
      return null;
    }

    const map = playoffMatches.reduce<Record<string, Match>>((acc, match) => {
      acc[match.$id] = { ...match };
      return acc;
    }, {});

    Object.values(map).forEach((match) => {
      if (match.winnerNextMatchId && map[match.winnerNextMatchId]) {
        match.winnerNextMatch = map[match.winnerNextMatchId];
      }
      if (match.loserNextMatchId && map[match.loserNextMatchId]) {
        match.loserNextMatch = map[match.loserNextMatchId];
      }
      if (match.previousLeftId && map[match.previousLeftId]) {
        match.previousLeftMatch = map[match.previousLeftId];
      }
      if (match.previousRightId && map[match.previousRightId]) {
        match.previousRightMatch = map[match.previousRightId];
      }
    });

    return map;
  }, [playoffMatches]);

  const playoffMatchIds = useMemo(() => new Set(playoffMatches.map((match) => match.$id)), [playoffMatches]);

  const leagueScoring = useMemo(
    () =>
      createLeagueScoringConfig(
        activeEvent && typeof activeEvent.leagueScoringConfig === 'object'
          ? activeEvent.leagueScoringConfig
          : null,
      ),
    [activeEvent?.leagueScoringConfig],
  );

  const baseStandings = useMemo<StandingsRow[]>(() => {
    if (!activeEvent) {
      return [];
    }

    const teamsArray = Array.isArray(activeEvent.teams) ? (activeEvent.teams as Team[]) : [];
    const teamsById = new Map<string, Team>();
    teamsArray.forEach((team) => {
      if (team?.$id) {
        teamsById.set(team.$id, team);
      }
    });

    const rows = new Map<string, StandingsRow>();
    const ensureRow = (teamId: string, team?: Team | null): StandingsRow | null => {
      if (!teamId) {
        return null;
      }
      if (team && !teamsById.has(teamId)) {
        teamsById.set(teamId, team);
      }
      if (!rows.has(teamId)) {
        const resolved = team ?? teamsById.get(teamId) ?? null;
        rows.set(teamId, {
          teamId,
          teamName: resolved?.name || `Team ${teamId.slice(0, 6)}`,
          wins: 0,
          losses: 0,
          draws: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          matchesPlayed: 0,
          points: 0,
        });
      }
      return rows.get(teamId) ?? null;
    };

    teamsArray.forEach((team) => {
      if (team?.$id) {
        ensureRow(team.$id, team);
      }
    });

    const sumPoints = (values: number[] | null | undefined): number =>
      Array.isArray(values)
        ? values.reduce((total, value) => (Number.isFinite(value) ? total + Number(value) : total), 0)
        : 0;

    activeMatches.forEach((match) => {
      if (playoffMatchIds.has(match.$id)) {
        return;
      }

      const team1Id =
        (match.team1 && typeof match.team1 === 'object' && '$id' in match.team1
          ? match.team1.$id
          : undefined) ?? (typeof match.team1Id === 'string' ? match.team1Id : null);
      const team2Id =
        (match.team2 && typeof match.team2 === 'object' && '$id' in match.team2
          ? match.team2.$id
          : undefined) ?? (typeof match.team2Id === 'string' ? match.team2Id : null);

      if (!team1Id || !team2Id) {
        return;
      }

      const team1 = (match.team1 as Team | undefined) ?? teamsById.get(team1Id) ?? null;
      const team2 = (match.team2 as Team | undefined) ?? teamsById.get(team2Id) ?? null;

      const row1 = ensureRow(team1Id, team1);
      const row2 = ensureRow(team2Id, team2);
      if (!row1 || !row2) {
        return;
      }

      const setResults = Array.isArray(match.setResults) ? match.setResults : [];
      const team1Wins = setResults.filter((result) => result === 1).length;
      const team2Wins = setResults.filter((result) => result === 2).length;
      const allSetsResolved = setResults.length > 0 && setResults.every((result) => result === 1 || result === 2);

      const team1Total = sumPoints(match.team1Points);
      const team2Total = sumPoints(match.team2Points);

      let outcome: 'team1' | 'team2' | 'draw' | null = null;
      if (team1Wins > team2Wins) {
        outcome = 'team1';
      } else if (team2Wins > team1Wins) {
        outcome = 'team2';
      } else if (allSetsResolved) {
        outcome = 'draw';
      } else if (team1Total > 0 || team2Total > 0) {
        if (team1Total > team2Total) {
          outcome = 'team1';
        } else if (team2Total > team1Total) {
          outcome = 'team2';
        } else {
          outcome = 'draw';
        }
      }

      if (!outcome) {
        return;
      }

      row1.goalsFor += team1Total;
      row1.goalsAgainst += team2Total;
      row2.goalsFor += team2Total;
      row2.goalsAgainst += team1Total;

      if (outcome === 'team1') {
        row1.wins += 1;
        row2.losses += 1;
      } else if (outcome === 'team2') {
        row2.wins += 1;
        row1.losses += 1;
      } else {
        row1.draws += 1;
        row2.draws += 1;
      }
    });

    const precision = Math.max(0, leagueScoring.pointPrecision ?? 0);
    const multiplier = precision > 0 ? 10 ** precision : 1;

    rows.forEach((row) => {
      row.matchesPlayed = row.wins + row.losses + row.draws;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      const basePoints =
        row.wins * leagueScoring.pointsForWin +
        row.draws * leagueScoring.pointsForDraw +
        row.losses * leagueScoring.pointsForLoss;
      const goalPoints =
        row.goalsFor * leagueScoring.pointsPerGoalScored +
        row.goalsAgainst * leagueScoring.pointsPerGoalConceded;
      const totalPoints = basePoints + goalPoints;
      row.points = precision > 0 ? Math.round(totalPoints * multiplier) / multiplier : totalPoints;
    });

    return Array.from(rows.values()).map((row) => ({ ...row }));
  }, [activeEvent, activeMatches, playoffMatchIds, leagueScoring]);

  const standings = useMemo<RankedStandingsRow[]>(() => {
    if (baseStandings.length === 0) {
      return [];
    }

    const sorted = [...baseStandings];
    const modifier = standingsSort.direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let comparison: number;
      switch (standingsSort.field) {
        case 'team':
          comparison = a.teamName.localeCompare(b.teamName);
          break;
        case 'wins':
          comparison = a.wins - b.wins;
          break;
        case 'losses':
          comparison = a.losses - b.losses;
          break;
        case 'draws':
          comparison = a.draws - b.draws;
          break;
        case 'points':
        default:
          comparison = a.points - b.points;
          break;
      }

      if (comparison !== 0) {
        return comparison * modifier;
      }

      const tieBreakers = [
        (x: StandingsRow, y: StandingsRow) => y.points - x.points,
        (x: StandingsRow, y: StandingsRow) => y.wins - x.wins,
        (x: StandingsRow, y: StandingsRow) => y.goalDifference - x.goalDifference,
        (x: StandingsRow, y: StandingsRow) => y.goalsFor - x.goalsFor,
        (x: StandingsRow, y: StandingsRow) => x.teamName.localeCompare(y.teamName),
      ];

      for (const tie of tieBreakers) {
        const result = tie(a, b);
        if (result !== 0) {
          return result;
        }
      }

      return 0;
    });

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [baseStandings, standingsSort]);

  const hasRecordedMatches = standings.some((row) => row.matchesPlayed > 0);
  const pointsDisplayPrecision = Math.max(0, leagueScoring.pointPrecision ?? 0);

  const bracketData = useMemo<TournamentBracket | null>(() => {
    if (!activeEvent || !bracketMatchesMap) {
      return null;
    }

    return {
      tournament: activeEvent,
      matches: bracketMatchesMap,
      teams: Array.isArray(activeEvent.teams) ? activeEvent.teams : [],
      isHost,
      canManage: !isPreview && isHost,
    };
  }, [activeEvent, bracketMatchesMap, isPreview, user?.$id]);

  const shouldShowBracketTab = !!bracketData || isPreview;

  // Ensure the bracket tab is only active when playoff data exists or preview mode demands it.
  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab('schedule');
    }
  }, [shouldShowBracketTab, activeTab]);

  useEffect(() => {
    const request = searchParams?.get('tab');
    if (!request) {
      setActiveTab('schedule');
      return;
    }

    if (request === 'bracket' && !shouldShowBracketTab) {
      setActiveTab('schedule');
      return;
    }

    if (request === 'schedule' || request === 'bracket' || request === 'standings') {
      setActiveTab(request);
    }
  }, [searchParams, shouldShowBracketTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    setActiveTab(value);

    if (!pathname) return;

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value === 'schedule') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  // Publish the league by persisting the latest event state back through the event service.
  const handlePublish = async () => {
    if (!activeEvent || publishing) return;

    if (!isPreview && !isEditingEvent && !isUnpublished) {
      if (!pathname) return;
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('mode', 'edit');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (isEditingEvent) {
      if (!event) {
        setError(`Unable to save ${entityLabel.toLowerCase()} changes without the original event context.`);
        return;
      }

      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      const shouldPublish = isUnpublished && !isPreview;

      try {
        const nextEvent = (changesEvent ? cloneValue(changesEvent) : cloneValue(activeEvent)) as Event;
        const nextMatches = cloneValue(activeMatches) as Match[];
        nextEvent.matches = nextMatches;
        if (Array.isArray(nextEvent.fields)) {
          nextEvent.fields = nextEvent.fields.map((field) => {
            const sanitized = { ...field };
            delete sanitized.rentalSlotIds;
            return sanitized;
          });
        }
        if ('attendees' in nextEvent) {
          delete (nextEvent as Partial<Event>).attendees;
        }
        if (shouldPublish) {
          nextEvent.state = 'PUBLISHED' as EventState;
        }

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        hydrateEvent(updatedEvent);
        writeEventToCache(updatedEvent);
        setHasUnsavedChanges(false);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('mode');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        setInfoMessage(shouldPublish ? `${entityLabel} published.` : `${entityLabel} changes saved.`);
      } catch (err) {
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        setError(shouldPublish ? `Failed to publish ${entityLabel.toLowerCase()}.` : `Failed to save ${entityLabel.toLowerCase()} changes.`);
      } finally {
        setPublishing(false);
      }
      return;
    }
  };

  const handleCancel = async () => {
    if (!event || cancelling) return;

    const isUnpublished = (event.state ?? 'PUBLISHED') === 'UNPUBLISHED';

    if (isUnpublished) {
      if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? This will delete the event, schedule, and any associated fields.`)) return;
      setCancelling(true);
      setError(null);
      try {
        await eventService.deleteUnpublishedEvent(event);
        clearEventCache(event.$id);
        router.push('/discover');
      } catch (err) {
        console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
        setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
        setCancelling(false);
      }
      return;
    }

    if (isPreview) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/discover');
      }
      return;
    }

    if (isEditingEvent) {
      if (!pathname) return;
      setInfoMessage(`${entityLabel} edit cancelled. Unsaved changes are preserved.`);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.delete('mode');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (!window.confirm(`Cancel this ${entityLabel.toLowerCase()}? This will delete the schedule and the event.`)) return;
    setCancelling(true);
    setError(null);
    try {
      await leagueService.deleteMatchesByEvent(event.$id);
      await leagueService.deleteWeeklySchedulesForEvent(event.$id);
      await eventService.deleteEvent(event);
      clearEventCache(event.$id);
      router.push('/discover');
    } catch (err) {
      console.error(`Failed to cancel ${entityLabel.toLowerCase()}:`, err);
      setError(`Failed to cancel ${entityLabel.toLowerCase()}.`);
      setCancelling(false);
    }
  };

  const handleClearChanges = useCallback(() => {
    if (!event) return;

    setChangesEvent(cloneValue(event) as Event);
    setChangesMatches(cloneValue(matches) as Match[]);
    setHasUnsavedChanges(false);
    setError(null);
    setInfoMessage(`${entityLabel} changes cleared.`);
  }, [entityLabel, event, matches]);

  useEffect(() => {
    if (!canEditMatches && isMatchEditorOpen) {
      setIsMatchEditorOpen(false);
      setMatchBeingEdited(null);
    }
  }, [canEditMatches, isMatchEditorOpen]);

  const handleMatchEditRequest = useCallback((match: Match) => {
    if (!canEditMatches) return;
    const sourceMatch = activeMatches.find((candidate) => candidate.$id === match.$id);
    if (!sourceMatch) return;
    setMatchBeingEdited(cloneValue(sourceMatch) as Match);
    setIsMatchEditorOpen(true);
  }, [activeMatches, canEditMatches]);

  const handleMatchEditClose = useCallback(() => {
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, []);

  const handleMatchEditSave = useCallback((updated: Match) => {
    setChangesMatches((prev) => {
      const base = (prev.length ? prev : (cloneValue(matches) as Match[])).map((item) => cloneValue(item) as Match);
      let replaced = false;
      const next = base.map((item) => {
        if (item.$id === updated.$id) {
          replaced = true;
          return cloneValue(updated) as Match;
        }
        return item;
      });
      if (!replaced) {
        next.push(cloneValue(updated) as Match);
      }
      return next;
    });
    setIsMatchEditorOpen(false);
    setMatchBeingEdited(null);
  }, [matches]);

  const canClearChanges = Boolean(event && changesEvent && hasChangeDiffers);

  const handleStandingsSortChange = useCallback((field: StandingsSortField) => {
    setStandingsSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        field,
        direction: field === 'team' ? 'asc' : 'desc',
      };
    });
  }, []);

  const renderSortIndicator = (field: StandingsSortField) => {
    if (standingsSort.field !== field) {
      return <span className="ml-1 text-xs text-gray-400">↕</span>;
    }
    return (
      <span className="ml-1 text-xs font-semibold text-gray-700">
        {standingsSort.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const formatPoints = (value: number): string => {
    if (pointsDisplayPrecision > 0) {
      return value.toFixed(pointsDisplayPrecision);
    }
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  };

  if (authLoading || !eventId) {
    return <Loading fullScreen text="Loading schedule..." />;
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <Loading fullScreen text="Loading schedule..." />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">{error}</Text>
              <Button variant="default" onClick={() => loadSchedule()}>Try Again</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  if (!activeEvent) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <Stack gap="md" align="center">
              <Text fw={600} size="lg">League not found.</Text>
              <Button variant="default" onClick={() => router.push('/discover')}>Back to Events</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  const leagueConfig = activeEvent.leagueConfig;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Title order={2} mb="xs">{activeEvent.name}</Title>
              <Group gap="sm">
                {activeEvent.status && <Badge color={activeEvent.status === 'published' ? 'green' : 'blue'} radius="sm" variant="light">
                  {activeEvent.status.toUpperCase()}
                </Badge>}
                <Badge radius="sm" variant="light">{new Date(activeEvent.start).toLocaleDateString()} – {new Date(activeEvent.end).toLocaleDateString()}</Badge>
              </Group>
              <Text c="dimmed" mt="sm">{activeEvent.location}</Text>
            </div>

            {isHost && (
              <Group gap="sm">
                <Button
                  color="green"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={publishing}
                >
                  {publishButtonLabel}
                </Button>
                <Button
                  color="red"
                  variant="light"
                  onClick={handleCancel}
                  loading={cancelling}
                >
                  {cancelButtonLabel}
                </Button>
                <Button
                  variant="default"
                  onClick={handleClearChanges}
                  disabled={!canClearChanges}
                >
                  Clear Changes
                </Button>
              </Group>
            )}
          </div>

          <Paper withBorder radius="md" p="lg">
            <Group gap="xl" wrap="wrap">
              <div>
                <Text fw={600} size="sm" c="dimmed">Games per Opponent</Text>
                <Text size="lg">{leagueConfig?.gamesPerOpponent ?? '—'}</Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Playoffs</Text>
                <Text size="lg">
                  {leagueConfig?.includePlayoffs
                    ? `${leagueConfig.playoffTeamCount || activeEvent.teams?.length || 'TBD'} teams`
                    : 'No'}
                </Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Match Duration</Text>
                <Text size="lg">{leagueConfig?.matchDurationMinutes ? `${leagueConfig.matchDurationMinutes} min` : 'TBD'}</Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Rest Time</Text>
                <Text size="lg">
                  {leagueConfig?.restTimeMinutes !== undefined
                    ? `${leagueConfig.restTimeMinutes} min`
                    : 'TBD'}
                </Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Total Matches</Text>
                <Text size="lg">{activeMatches.length}</Text>
              </div>
            </Group>
          </Paper>

          {infoMessage && (
            <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
              {infoMessage}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              <Tabs.Tab value="standings">Standings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="schedule" pt="md">
              {activeMatches.length === 0 ? (
                <Paper withBorder radius="md" p="xl" ta="center">
                  <Text>No matches generated yet.</Text>
                </Paper>
              ) : (
                <LeagueCalendarView
                  matches={activeMatches}
                  eventStart={activeEvent.start}
                  eventEnd={activeEvent.end}
                  onMatchClick={canEditMatches ? handleMatchEditRequest : undefined}
                  canManage={canEditMatches}
                />
              )}
            </Tabs.Panel>

            {shouldShowBracketTab && (
              <Tabs.Panel value="bracket" pt="md">
                {bracketData ? (
                  <TournamentBracketView
                    bracket={bracketData}
                    currentUser={user ?? undefined}
                    isPreview={isPreview}
                    onMatchClick={canEditMatches ? handleMatchEditRequest : undefined}
                    canEditMatches={canEditMatches}
                    showDateOnMatches={showDateOnMatches}
                  />
                ) : (
                  <Paper withBorder radius="md" p="xl" ta="center">
                    <Text>No playoff bracket generated yet.</Text>
                  </Paper>
                )}
              </Tabs.Panel>
            )}

            <Tabs.Panel value="standings" pt="md">
              {standings.length === 0 ? (
                <Paper withBorder radius="md" p="xl" ta="center">
                  <Text>No teams available yet.</Text>
                </Paper>
              ) : (
                <Paper withBorder radius="md" p={0}>
                  {!hasRecordedMatches && (
                    <div className="px-4 pt-4">
                      <Text size="sm" c="dimmed">
                        Standings will update automatically as match results are recorded.
                      </Text>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th className="w-12 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            #
                          </Table.Th>
                          <Table.Th className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <UnstyledButton
                              className="flex items-center gap-1 text-sm font-semibold text-gray-700"
                              onClick={() => handleStandingsSortChange('team')}
                            >
                              Team
                              {renderSortIndicator('team')}
                            </UnstyledButton>
                          </Table.Th>
                          <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <UnstyledButton
                              className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                              onClick={() => handleStandingsSortChange('wins')}
                            >
                              W
                              {renderSortIndicator('wins')}
                            </UnstyledButton>
                          </Table.Th>
                          <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <UnstyledButton
                              className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                              onClick={() => handleStandingsSortChange('losses')}
                            >
                              L
                              {renderSortIndicator('losses')}
                            </UnstyledButton>
                          </Table.Th>
                          <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <UnstyledButton
                              className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                              onClick={() => handleStandingsSortChange('draws')}
                            >
                              D
                              {renderSortIndicator('draws')}
                            </UnstyledButton>
                          </Table.Th>
                          <Table.Th className="w-16 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <UnstyledButton
                              className="flex w-full items-center justify-end gap-1 text-sm font-semibold text-gray-700"
                              onClick={() => handleStandingsSortChange('points')}
                            >
                              P
                              {renderSortIndicator('points')}
                            </UnstyledButton>
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {standings.map((row) => (
                          <Table.Tr key={row.teamId}>
                            <Table.Td className="text-sm font-semibold text-gray-600">{row.rank}</Table.Td>
                            <Table.Td className="text-sm font-medium text-gray-700">{row.teamName}</Table.Td>
                            <Table.Td className="text-right text-sm text-gray-700">{row.wins}</Table.Td>
                            <Table.Td className="text-right text-sm text-gray-700">{row.losses}</Table.Td>
                            <Table.Td className="text-right text-sm text-gray-700">{row.draws}</Table.Td>
                            <Table.Td className="text-right text-sm font-semibold text-gray-900">
                              {formatPoints(row.points)}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                </Paper>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
      <MatchEditModal
        opened={isMatchEditorOpen}
        match={matchBeingEdited}
        fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
        teams={Array.isArray(activeEvent.teams) ? activeEvent.teams : []}
        referees={Array.isArray(activeEvent.referees) ? activeEvent.referees : []}
        doTeamsRef={Boolean(activeEvent.doTeamsRef)}
        onClose={handleMatchEditClose}
        onSave={handleMatchEditSave}
      />
    </div>
  );
}

export default function EventSchedulePage() {
  return (
    <Suspense fallback={<Loading text="Loading schedule..." />}>
      <EventScheduleContent />
    </Suspense>
  );
}
