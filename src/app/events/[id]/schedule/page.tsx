'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Badge, Tabs, Stack } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { eventService } from '@/lib/eventService';
import { leagueService, LeagueScheduleResponse } from '@/lib/leagueService';
import type { Event, Match, Team, TournamentBracket } from '@/types';
import LeagueCalendarView from './components/LeagueCalendarView';
import TournamentBracketView from './components/TournamentBracketView';

// Main schedule page component that protects access and renders league schedule/bracket content.
function LeagueScheduleContent() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params?.id as string | undefined;
  const isPreview = searchParams?.get('preview') === '1';

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('schedule');

  // Kick off schedule loading once auth state is resolved or redirect unauthenticated users.
  useEffect(() => {
    if (!eventId) return;
    if (!authLoading) {
      if (!isAuthenticated && !isGuest) {
        router.push('/login');
        return;
      }
      loadSchedule(isPreview);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, isGuest, eventId, isPreview]);

  // Convert cached match payloads into a typed array, ignoring any invalid formats.
  const normalizeMatches = (raw: unknown): Match[] => {
    return Array.isArray(raw) ? (raw as Match[]) : [];
  };

  // Hydrate event + match data from preview cache or Appwrite and sync local component state.
  const loadSchedule = async (previewMode: boolean) => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    try {
      let previewEvent: Event | null = null;

      if (previewMode && typeof window !== 'undefined') {
        const cachedEvent = sessionStorage.getItem(`league-preview-event:${eventId}`);
        if (cachedEvent) {
          try {
            previewEvent = JSON.parse(cachedEvent) as Event;
          } catch (parseError) {
            console.warn('Failed to parse cached preview event:', parseError);
          }
        }
      }

      let fetchedEvent: Event | null = null;
      if (!previewEvent) {
        try {
          fetchedEvent = (await eventService.getEventWithRelations(eventId)) ?? null;
        } catch (fetchError) {
          if (!previewMode) {
            throw fetchError;
          }
          console.warn('Preview event not found in database, using cached data.');
        }
      }

      const activeEvent: Event | null = previewEvent ?? fetchedEvent ?? null;
      if (!activeEvent) {
        setError('League not found.');
        setLoading(false);
        return;
      }

      setEvent(activeEvent);

      setMatches(activeEvent?.matches ? activeEvent.matches : []);
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError('Failed to load league schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Cache team id to team data mappings to avoid repeated array scans per match render.
  const teamLookup = useMemo(() => {
    const map = new Map<string, Team>();
    if (event?.teams) {
      event.teams.forEach(team => {
        if (team?.$id) {
          map.set(team.$id, team);
        }
      });
    }
    return map;
  }, [event?.teams]);

  // Resolve the viewer's timezone once so time formatting stays consistent across renders.
  const userTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      return 'UTC';
    }
  }, []);

  // Append a UTC offset to raw timestamps to guarantee Date parsing succeeds in all browsers.
  const ensureIsoWithOffset = (value: string) => {
    if (!value) return null;
    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  };

  // Format start/end timestamps for display, falling back to the viewer's timezone.
  const formatDateTime = (value: string) => {
    const iso = ensureIsoWithOffset(value);
    if (!iso) return value;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString([], { timeZone: userTimeZone })} · ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: userTimeZone,
    })}`;
  };

  const playoffMatches = useMemo(
    () => matches.filter((match) => {
      if (match.matchType === 'playoff') return true;
      if (typeof match.matchId === 'number' && match.matchId > 0) return true;
      return Boolean(
        match.losersBracket ||
        match.previousLeftId ||
        match.previousRightId ||
        match.winnerNextMatchId ||
        match.loserNextMatchId
      );
    }),
    [matches],
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
    if (!event || !bracketMatchesMap) {
      return null;
    }

    const isHost = event.hostId === user?.$id;

    return {
      tournament: event,
      matches: bracketMatchesMap,
      teams: Array.isArray(event.teams) ? event.teams : [],
      isHost,
      canManage: !isPreview && isHost,
    };
  }, [event, bracketMatchesMap, isPreview, user?.$id]);

  const shouldShowBracketTab = !!bracketData || isPreview;

  // Ensure the bracket tab is only active when playoff data exists or preview mode demands it.
  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab('schedule');
    }
  }, [shouldShowBracketTab, activeTab]);

  useEffect(() => {
    const request = searchParams?.get('tab');
    if (!request) return;
    if (request === 'bracket' && !shouldShowBracketTab) return;
    if (request === activeTab) return;
    if (request === 'schedule' || request === 'bracket' || request === 'standings') {
      setActiveTab(request);
    }
  }, [searchParams, shouldShowBracketTab, activeTab]);

  // Produce readable team labels, preferring related team objects and falling back to seeds.
  const getTeamLabel = (match: Match, key: 'team1' | 'team2') => {
    const relation = key === 'team1' ? match.team1 : match.team2;

    if (relation) {
      if (relation.name) {
        return relation.name;
      }
      if (relation.$id && teamLookup.has(relation.$id)) {
        return teamLookup.get(relation.$id)?.name || 'TBD';
      }
    }

    const seed = key === 'team1' ? match.team1Seed : match.team2Seed;
    if (seed) {
      return `Seed ${seed}`;
    }

    return 'TBD';
  };

  // Publish the league by persisting the latest event state back through the event service.
  const handlePublish = async () => {
    if (!event || publishing) return;
    setPublishing(true);
    setInfoMessage(null);
    try {
      const updated = await eventService.createEvent(event);
      setEvent(updated);
      setInfoMessage('League published.');
    } catch (err) {
      console.error('Failed to publish league:', err);
      setError('Failed to publish league.');
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = async () => {
    if (!event || cancelling) return;
    if (isPreview || event.$id?.startsWith('preview-')) {
      if (typeof window !== 'undefined' && event.$id) {
        try {
          window.sessionStorage.setItem('league-preview-resume-id', event.$id);
        } catch (storageError) {
          console.warn('Failed to persist preview resume id:', storageError);
        }
      }

      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/events');
      }
      return;
    }

    // Prompt for confirmation, then delete matches/schedules/event before navigating back to events.
    if (!window.confirm('Cancel this league? This will delete the schedule and the event.')) return;
    setCancelling(true);
    setError(null);
    try {
      await leagueService.deleteMatchesByEvent(event.$id);
      await leagueService.deleteWeeklySchedulesForEvent(event.$id);
      await eventService.deleteEvent(event.$id);
      router.push('/events');
    } catch (err) {
      console.error('Failed to cancel league:', err);
      setError('Failed to cancel league.');
      setCancelling(false);
    }
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
              <Button variant="default" onClick={() => loadSchedule(isPreview)}>Try Again</Button>
            </Stack>
          </Paper>
        </div>
      </>
    );
  }

  if (!event) {
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

  const leagueConfig = event.leagueConfig;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Title order={2} mb="xs">{event.name}</Title>
              <Group gap="sm">
                <Badge color={event.status === 'published' ? 'green' : 'blue'} radius="sm" variant="light">
                  {event.status ? event.status.toUpperCase() : 'DRAFT'}
                </Badge>
                <Badge radius="sm" variant="light">{new Date(event.start).toLocaleDateString()} – {new Date(event.end).toLocaleDateString()}</Badge>
              </Group>
              <Text c="dimmed" mt="sm">{event.location}</Text>
            </div>

            {event.hostId === user?.$id && (
              <Group gap="sm">
                <Button
                  color="green"
                  onClick={handlePublish}
                  loading={publishing}
                  disabled={event.status === 'published'}
                >
                  Publish League
                </Button>
                <Button
                  color="red"
                  variant="light"
                  onClick={handleCancel}
                  loading={cancelling}
                >
                  Cancel League
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
                    ? `${leagueConfig.playoffTeamCount || event.teams?.length || 'TBD'} teams`
                    : 'No'}
                </Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Match Duration</Text>
                <Text size="lg">{leagueConfig?.matchDurationMinutes ? `${leagueConfig.matchDurationMinutes} min` : 'TBD'}</Text>
              </div>
              <div>
                <Text fw={600} size="sm" c="dimmed">Total Matches</Text>
                <Text size="lg">{matches.length}</Text>
              </div>
            </Group>
          </Paper>

          {infoMessage && (
            <Alert color="green" radius="md" onClose={() => setInfoMessage(null)} withCloseButton>
              {infoMessage}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)}>
            <Tabs.List>
              <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
              {shouldShowBracketTab && <Tabs.Tab value="bracket">Bracket</Tabs.Tab>}
              <Tabs.Tab value="standings" disabled>Standings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="schedule" pt="md">
              {matches.length === 0 ? (
                <Paper withBorder radius="md" p="xl" ta="center">
                  <Text>No matches generated yet.</Text>
                </Paper>
              ) : (
                <LeagueCalendarView
                  matches={matches}
                  eventStart={event.start}
                  eventEnd={event.end}
                  getTeamLabel={getTeamLabel}
                  formatDateTime={formatDateTime}
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
    </div>
  );
}

export default function LeagueSchedulePage() {
  return (
    <Suspense fallback={<Loading text="Loading schedule..." />}> 
      <LeagueScheduleContent />
    </Suspense>
  );
}
