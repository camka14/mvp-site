'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Badge, Tabs, Stack } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { eventService } from '@/lib/eventService';
import { leagueService } from '@/lib/leagueService';
import type { Event, EventState, Match, TournamentBracket } from '@/types';
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

  return JSON.parse(JSON.stringify(value));
};

const EVENT_CACHE_PREFIX = 'event-cache:';
const EVENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedEventEntry = {
  timestamp: number;
  event: Event;
};

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

    return parsed.event as Event;
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
      event,
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
  const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);

  const isEditingEvent = isPreview || isEditParam;
  const usingChangeCopies = Boolean(changesEvent);
  const activeEvent = usingChangeCopies ? changesEvent : event;
  const activeMatches = usingChangeCopies ? changesMatches : matches;
  const isTournament = activeEvent?.eventType === 'tournament';
  const isHost = activeEvent?.hostId === user?.$id;
  const entityLabel = isTournament ? 'Tournament' : 'League';
  const canEditMatches = Boolean(isHost && isEditingEvent && !isPreview);

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

    const eventDiffers = JSON.stringify(event) !== JSON.stringify(changesEvent);
    if (eventDiffers) {
      return true;
    }

    if (!matches.length && !changesMatches.length) {
      return false;
    }

    return JSON.stringify(matches) !== JSON.stringify(changesMatches);
  }, [event, changesEvent, matches, changesMatches]);

  useEffect(() => {
    setHasUnsavedChanges((prev) => (prev === hasChangeDiffers ? prev : hasChangeDiffers));
  }, [hasChangeDiffers]);
  const publishButtonLabel = (() => {
    if (!activeEvent || isPreview) return `Publish ${entityLabel}`;
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
    () => activeMatches.filter((match) => {
      if (typeof match.matchId === 'number' && match.matchId > 0) return true;
      return Boolean(
        match.losersBracket ||
        match.previousLeftId ||
        match.previousRightId ||
        match.winnerNextMatchId ||
        match.loserNextMatchId
      );
    }),
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

    if (!isPreview && !isEditingEvent) {
      if (!pathname) return;
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('mode', 'edit');
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
      return;
    }

    if (isEditingEvent && !isPreview) {
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

        let updatedEvent = nextEvent;
        if (nextEvent.$id) {
          updatedEvent = await eventService.updateEvent(nextEvent.$id, nextEvent);
        }

        const hydratedEvent = { ...updatedEvent, matches: nextMatches } as Event;

        hydrateEvent(hydratedEvent);
        writeEventToCache(hydratedEvent);
        setHasUnsavedChanges(false);

        if (pathname) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('mode');
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        }

        setInfoMessage(`${entityLabel} changes saved.`);
      } catch (err) {
        console.error(`Failed to save ${entityLabel.toLowerCase()} changes:`, err);
        setError(`Failed to save ${entityLabel.toLowerCase()} changes.`);
      } finally {
        setPublishing(false);
      }
      return;
    }

    setPublishing(true);
    setInfoMessage(null);
    try {
      const sourceEvent = cloneValue(changesEvent ?? activeEvent) as Event;
      const nextMatches = cloneValue(activeMatches) as Match[];
      sourceEvent.matches = nextMatches;
      sourceEvent.state = 'PUBLISHED' as EventState;
      const previousEventId = activeEvent?.$id;
      const published = await eventService.createEvent(sourceEvent);
      const publishedEvent = {
        ...published,
        matches: nextMatches,
        state: (published.state ?? 'PUBLISHED') as EventState,
      } as Event;

      if (previousEventId && previousEventId !== publishedEvent.$id) {
        clearEventCache(previousEventId);
      }

      hydrateEvent(publishedEvent);
      writeEventToCache(publishedEvent);
      setHasUnsavedChanges(false);

      if (pathname || publishedEvent.$id) {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.delete('mode');
        params.delete('preview');
        const query = params.toString();
        const targetPath = publishedEvent.$id
          ? `/events/${publishedEvent.$id}/schedule${query ? `?${query}` : ''}`
          : `${pathname}${query ? `?${query}` : ''}`;
        router.replace(targetPath, { scroll: false });
      }

      setInfoMessage(`${entityLabel} published.`);
    } catch (err) {
      console.error(`Failed to publish ${entityLabel.toLowerCase()}:`, err);
      setError(`Failed to publish ${entityLabel.toLowerCase()}.`);
    } finally {
      setPublishing(false);
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
      await eventService.deleteEvent(event.$id);
      clearEventCache(event.$id);
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

  const canClearChanges = Boolean(event && changesEvent && hasChangeDiffers);

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
              <Button variant="default" onClick={() => router.push('/events')}>Back to Events</Button>
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
              <Tabs.Tab value="standings" disabled>Standings</Tabs.Tab>
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
                  />
                ) : (
                  <Paper withBorder radius="md" p="xl" ta="center">
                    <Text>No playoff bracket generated yet.</Text>
                  </Paper>
                )}
              </Tabs.Panel>
            )}

            <Tabs.Panel value="standings" pt="md">
              <Paper withBorder radius="md" p="xl" ta="center">
                <Text c="dimmed">Standings coming soon.</Text>
              </Paper>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
      <MatchEditModal
        opened={isMatchEditorOpen}
        match={matchBeingEdited}
        fields={Array.isArray(activeEvent.fields) ? activeEvent.fields : []}
        teams={Array.isArray(activeEvent.teams) ? activeEvent.teams : []}
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
