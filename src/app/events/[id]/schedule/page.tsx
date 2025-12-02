'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Tabs, Stack, Table, UnstyledButton } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { deepEqual } from '@/app/utils';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import { tournamentService } from '@/lib/tournamentService';
import { organizationService } from '@/lib/organizationService';
import type { Event, EventState, Match, Team, TournamentBracket, Organization } from '@/types';
import { createLeagueScoringConfig } from '@/types/defaults';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';
import MatchEditModal from './components/MatchEditModal';
import EventCreationSheet from './components/EventCreationSheet';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import ScoreUpdateModal from './components/ScoreUpdateModal';

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
  const isCreateMode = searchParams?.get('create') === '1';
  const organizationIdParam = searchParams?.get('orgId') || undefined;

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
  const [scoreUpdateMatch, setScoreUpdateMatch] = useState<Match | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [organizationForCreate, setOrganizationForCreate] = useState<Organization | null>(null);

  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const isUnpublished = (activeEvent?.state ?? 'PUBLISHED') === 'UNPUBLISHED' || activeEvent?.state === 'DRAFT';
  const isEditingEvent = isPreview || isEditParam || isUnpublished;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const isTournament = activeEvent?.eventType === 'TOURNAMENT';
  const isHost = activeEvent?.hostId === user?.$id;
  const entityLabel = isTournament ? 'Tournament' : 'League';
  const canEditMatches = Boolean(isHost && isEditingEvent);
  const shouldShowCreationSheet = Boolean(isCreateMode || (isEditingEvent && isHost && user));
  const showDateOnMatches = useMemo(() => {
    if (!activeEvent?.start || !activeEvent?.end) return false;
    const start = new Date(activeEvent.start);
    const end = new Date(activeEvent.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
  }, [activeEvent?.start, activeEvent?.end]);

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    if (Array.isArray(activeEvent?.teams)) {
      (activeEvent.teams as Team[]).forEach((team) => {
        if (team?.$id) {
          map.set(team.$id, team);
        }
      });
    }
    return map;
  }, [activeEvent?.teams]);

  const resolveTeam = useCallback(
    (value: Match['team1'] | string | null | undefined): Team | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        return teamsById.get(value) ?? null;
      }
      if (typeof value === 'object') {
        return (value as Team) ?? null;
      }
      return null;
    },
    [teamsById],
  );

  const userOnTeam = useCallback(
    (team: Team | null | undefined) => {
      if (!team || !user?.$id) return false;
      const memberIds = new Set<string>();
      if (Array.isArray(team.playerIds)) {
        team.playerIds.forEach((id) => {
          if (typeof id === 'string') {
            memberIds.add(id);
          }
        });
      }
      if (Array.isArray(team.players)) {
        team.players.forEach((player) => {
          if (player?.$id) {
            memberIds.add(player.$id);
          }
        });
      }
      if (team.captainId) {
        memberIds.add(team.captainId);
      }
      if (team.captain && typeof team.captain === 'object' && '$id' in team.captain && (team.captain as any).$id) {
        memberIds.add((team.captain as any).$id as string);
      }
      return memberIds.has(user.$id);
    },
    [user?.$id],
  );

  const findUserTeam = useCallback(
    (match?: Match | null) => {
      if (!user?.$id) return null;
      const candidates: (Match['team1'] | string | null | undefined)[] = [];
      if (match) {
        candidates.push(match.team1 ?? match.team1Id);
        candidates.push(match.team2 ?? match.team2Id);
        candidates.push(match.teamReferee ?? match.teamRefereeId);
      }
      for (const candidate of candidates) {
        const team = resolveTeam(candidate);
        if (team && userOnTeam(team)) {
          return team;
        }
      }
      for (const team of teamsById.values()) {
        if (userOnTeam(team)) {
          return team;
        }
      }
      return null;
    },
    [resolveTeam, teamsById, user?.$id, userOnTeam],
  );

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const loadOrgForCreate = async () => {
      if (!organizationIdParam || !isCreateMode) return;
      try {
        const org = await organizationService.getOrganizationById(organizationIdParam, true);
        if (org) {
          setOrganizationForCreate(org as Organization);
          setChangesEvent((prev) => {
            const base = prev ?? ({ $id: eventId, state: 'DRAFT' } as Event);
            return {
              ...base,
              organization: org,
              organizationId: org.$id,
              hostId: base.hostId ?? org.ownerId ?? base.hostId,
              fields: Array.isArray(org.fields) ? org.fields : base.fields,
              refereeIds: Array.isArray(org.refIds) ? org.refIds : base.refereeIds,
              referees: Array.isArray(org.referees) ? org.referees : base.referees,
              location: base.location ?? org.location,
              coordinates: base.coordinates ?? org.coordinates,
            } as Event;
          });
        }
      } catch (error) {
        console.warn('Failed to load organization for create:', error);
      }
    };
    loadOrgForCreate();
  }, [eventId, isCreateMode, organizationIdParam]);

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

  // Mark dirty whenever draft changes
  useEffect(() => {
    if (!event || !changesEvent) return;
    setHasUnsavedChanges(true);
  }, [changesEvent, changesMatches]);
  const publishButtonLabel = (() => {
    if (isCreateMode) {
      const createLabel = (() => {
        const type = changesEvent?.eventType || activeEvent?.eventType;
        if (type === 'TOURNAMENT') return 'Tournament';
        if (type === 'LEAGUE') return 'League';
        return 'Event';
      })();
      return `Create ${createLabel}`;
    }
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
  // Hydrate event + match data from Appwrite and sync local component state.
  const loadSchedule = useCallback(async () => {
    if (!eventId) return;
    if (isCreateMode) {
      setEvent(null);
      setMatches([]);
      setChangesEvent(null);
      setChangesMatches([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const fetchedEvent = (await eventService.getEventWithRelations(eventId)) ?? null;

      if (!fetchedEvent) {
        setError('League not found.');
        return;
      }

      hydrateEvent(fetchedEvent);
      if (!hasUnsavedChangesRef.current) {
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError('Failed to load league schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [eventId, hydrateEvent, isCreateMode]);

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

    if (request === 'schedule' || request === 'bracket' || request === 'standings' || request === 'details') {
      setActiveTab(request);
    }
  }, [searchParams, shouldShowBracketTab]);

  const handleTabChange = (value: string | null) => {
    if (!value) return;
    if (value === 'bracket' && !shouldShowBracketTab) {
      setActiveTab('schedule');
      return;
    }
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

  const handleDetailsClose = useCallback(() => {
    setActiveTab('schedule');
  }, []);

  const handleEventDraftChange = useCallback(
    (draft: Partial<Event>) => {
      const withId = draft.$id ? draft : { ...draft, $id: draft.$id ?? eventId };
      setChangesEvent((prev) => ({ ...(prev ?? (activeEvent ?? {} as Event)), ...(withId as Event) }));
      setHasUnsavedChanges(true);
    },
    [activeEvent, eventId],
  );

  // Seed a draft event when entering create mode
  useEffect(() => {
    if (isCreateMode && !changesEvent) {
      setChangesEvent({ $id: eventId, state: 'DRAFT' } as any);
      setHasUnsavedChanges(true);
    }
  }, [changesEvent, eventId, isCreateMode]);

  // Publish the league by persisting the latest event state back through the event service.
  const handlePublish = async () => {
    if (publishing) return;

    // Create mode: invoke createEvent with current draft and redirect to the new event.
    if (isCreateMode) {
      if (!changesEvent) {
        setError('No event draft available to create.');
        return;
      }
      setPublishing(true);
      setError(null);
      setInfoMessage(null);
      try {
        const created = await eventService.createEvent(changesEvent);
        hydrateEvent(created);
        setChangesEvent(created);
        setHasUnsavedChanges(false);
        const targetId = created.$id || eventId;
        if (targetId) {
          router.replace(`/events/${targetId}/schedule`);
        }
        setInfoMessage(`${entityLabel} created.`);
      } catch (err) {
        console.error('Failed to create event:', err);
        setError('Failed to create event.');
      } finally {
        setPublishing(false);
      }
      return;
    }

    if (!activeEvent) return;

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
        if (isUnpublished) {
          nextEvent.state = 'PUBLISHED' as EventState;
        }

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        if (!Array.isArray(updatedEvent.matches) || updatedEvent.matches.length === 0) {
          updatedEvent.matches = nextMatches;
        }

        hydrateEvent(updatedEvent);
        setHasUnsavedChanges(false);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('mode');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        setInfoMessage(isUnpublished ? `${entityLabel} published.` : `${entityLabel} changes saved.`);
      } catch (err) {
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        setError(isUnpublished ? `Failed to publish ${entityLabel.toLowerCase()}.` : `Failed to save ${entityLabel.toLowerCase()} changes.`);
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
        router.push('/events');
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
        router.push('/events');
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
      router.push('/events');
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
  }, []);

  const canUserManageScore = useCallback(
    (match: Match) => {
      if (!user?.$id) return false;
      if (match.refereeId === user.$id || match.referee?.$id === user.$id) {
        return true;
      }
      const teamRef = resolveTeam(match.teamReferee ?? match.teamRefereeId);
      return userOnTeam(teamRef);
    },
    [resolveTeam, user?.$id, userOnTeam],
  );

  const handleScoreChange = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      try {
        await tournamentService.updateMatchScores(matchId, { team1Points, team2Points, setResults });
      } catch (err) {
        console.warn('Non-blocking score sync failed:', err);
      }
    },
    [],
  );

  const handleSetComplete = useCallback(
    async ({ matchId, team1Points, team2Points, setResults }: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => {
      const updated = await tournamentService.updateMatch(matchId, { team1Points, team2Points, setResults });
      applyMatchUpdate(updated as Match);
    },
    [applyMatchUpdate],
  );

  const handleMatchComplete = useCallback(
    async ({
      matchId,
      team1Points,
      team2Points,
      setResults,
      eventId,
    }: {
      matchId: string;
      team1Points: number[];
      team2Points: number[];
      setResults: number[];
      eventId?: string;
    }) => {
      const targetEventId = eventId ?? activeEvent?.$id;
      if (!targetEventId || activeEvent?.eventType === 'EVENT') {
        return;
      }
      await tournamentService.completeMatch(targetEventId, matchId, { team1Points, team2Points, setResults });
    },
    [activeEvent?.$id, activeEvent?.eventType],
  );

  const handleScoreSubmit = useCallback(
    async (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => {
      try {
        const updated = await tournamentService.updateMatch(matchId, { team1Points, team2Points, setResults });
        applyMatchUpdate(updated as Match);
        setScoreUpdateMatch(null);
        setIsScoreModalOpen(false);
      } catch (err) {
        console.error('Failed to update score:', err);
        setError('Failed to update score. Please try again.');
      }
    },
    [applyMatchUpdate],
  );

  const handleMakeUserTeamReferee = useCallback(
    async (match: Match) => {
      const userTeam = findUserTeam(match);
      if (!userTeam) {
        window.alert('You need to be on a team in this event to referee this match.');
        return null;
      }

      const confirm = window.confirm('No referee is assigned. Make your team the referee for this match?');
      if (!confirm) return null;

      try {
        const updated = await tournamentService.updateMatch(match.$id, { teamRefereeId: userTeam.$id });
        const withTeam = {
          ...(updated as Match),
          teamReferee: (updated as Match).teamReferee ?? userTeam,
        };
        applyMatchUpdate(withTeam as Match);
        return withTeam as Match;
      } catch (err) {
        console.error('Failed to assign team referee:', err);
        setError('Failed to assign a referee to this match. Please try again.');
        return null;
      }
    },
    [applyMatchUpdate, findUserTeam],
  );

  const handleMatchClick = useCallback(
    async (match: Match) => {
      if (canEditMatches) {
        handleMatchEditRequest(match);
        return;
      }

      if (!user) {
        return;
      }

      const isUserReferee = match.refereeId === user.$id || match.referee?.$id === user.$id;
      const teamRef = resolveTeam(match.teamReferee ?? match.teamRefereeId);
      const userIsTeamRef = userOnTeam(teamRef);

      if (isUserReferee || userIsTeamRef) {
        setScoreUpdateMatch(match);
        setIsScoreModalOpen(true);
        return;
      }

      if (!match.referee && !match.refereeId && teamRef) {
        const updated = await handleMakeUserTeamReferee(match);
        if (updated) {
          setScoreUpdateMatch(updated);
          setIsScoreModalOpen(true);
        }
      }
    },
    [canEditMatches, handleMakeUserTeamReferee, handleMatchEditRequest, resolveTeam, user, userOnTeam],
  );

  const canClearChanges = Boolean(event && changesEvent && hasUnsavedChanges);

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

  if (isCreateMode && !activeEvent) {
    return (
      <>
        <Navigation />
        <Container size="lg" py="xl">
          <Stack gap="md">
            <Title order={2}>Create Event</Title>
            {user ? (
              <EventCreationSheet
                renderInline
                isOpen
                onClose={() => router.push('/events')}
                currentUser={user}
                organization={null}
                event={changesEvent ?? undefined}
                onDraftChange={handleEventDraftChange}
              />
            ) : (
              <Loading text="Loading user..." />
            )}
          </Stack>
        </Container>
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
              <Button variant="default" onClick={() => router.push('/events')}>Back to Events</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  const leagueConfig = activeEvent.leagueConfig;
  const activeOrganization: Organization | null =
    activeEvent && typeof activeEvent.organization === 'object'
      ? (activeEvent.organization as Organization)
      : organizationForCreate;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Title order={2} mb="xs">{activeEvent.name}</Title>

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
          </Group>

          {infoMessage && (
            <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
              {infoMessage}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="details">Details</Tabs.Tab>
              <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              <Tabs.Tab value="standings">Standings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="details" pt="md">
              {shouldShowCreationSheet && user ? (
                <EventCreationSheet
                  renderInline
                  isOpen={activeTab === 'details'}
                  onClose={handleDetailsClose}
                  currentUser={user}
                  event={activeEvent ?? undefined}
                  organization={activeOrganization}
                  onDraftChange={handleEventDraftChange}
                />
              ) : (
                <EventDetailSheet
                  event={activeEvent}
                  isOpen={activeTab === 'details'}
                  renderInline
                  onClose={handleDetailsClose}
                />
              )}
            </Tabs.Panel>

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
                  onMatchClick={handleMatchClick}
                  canManage={canEditMatches}
                  currentUser={user}
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
      {scoreUpdateMatch && activeEvent && (
        <ScoreUpdateModal
          match={scoreUpdateMatch}
          tournament={activeEvent}
          canManage={canUserManageScore(scoreUpdateMatch)}
          onScoreChange={handleScoreChange}
          onSetComplete={handleSetComplete}
          onMatchComplete={handleMatchComplete}
          onSubmit={handleScoreSubmit}
          onClose={() => {
            setIsScoreModalOpen(false);
            setScoreUpdateMatch(null);
          }}
          isOpen={isScoreModalOpen}
        />
      )}
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
