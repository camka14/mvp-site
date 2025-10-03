'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Badge, Tabs, Stack } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { eventService } from '@/lib/eventService';
import { leagueService, LeagueScheduleResponse } from '@/lib/leagueService';
import type { Event, Match, Team } from '@/types';
import LeagueCalendarView from './components/LeagueCalendarView';
import PlayoffBracket from './components/PlayoffBracket';

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

  const normalizeMatches = (raw: unknown): Match[] => {
    return Array.isArray(raw) ? (raw as Match[]) : [];
  };

  const loadSchedule = async (previewMode: boolean) => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    try {
      let previewEvent: Event | null = null;
      let previewMatches: Match[] = [];

      if (previewMode && typeof window !== 'undefined') {
        const cachedEvent = sessionStorage.getItem(`league-preview-event:${eventId}`);
        if (cachedEvent) {
          try {
            previewEvent = JSON.parse(cachedEvent) as Event;
          } catch (parseError) {
            console.warn('Failed to parse cached preview event:', parseError);
          }
        }

        const cachedMatches = sessionStorage.getItem(`league-preview:${eventId}`);
        if (cachedMatches) {
          try {
            const parsed = JSON.parse(cachedMatches) as LeagueScheduleResponse;
            previewMatches = normalizeMatches(parsed.matches || []);
          } catch (parseError) {
            console.warn('Failed to parse cached preview schedule:', parseError);
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

      if (activeEvent.eventType !== 'league') {
        setError('This event is not a league.');
        setEvent(activeEvent);
        setLoading(false);
        return;
      }

      setEvent(activeEvent);

      let scheduleMatches: Match[] = previewMatches;

      if (!scheduleMatches.length && (!previewMode || !previewEvent)) {
        scheduleMatches = await leagueService.listMatchesByEvent(eventId);
      }

      setMatches(scheduleMatches);
    } catch (err) {
      console.error('Failed to load league schedule:', err);
      setError('Failed to load league schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fieldLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (event?.fields) {
      event.fields.forEach(field => {
        if (field?.$id) {
          map.set(field.$id, field.name || `Field ${field.fieldNumber ?? ''}`);
        }
      });
    }

    if (event?.timeSlots) {
      event.timeSlots.forEach(schedule => {
        const scheduleFieldId = typeof schedule.field === 'string'
          ? schedule.field
          : schedule.field?.$id;
        if (scheduleFieldId && schedule.field && typeof schedule.field === 'object' && schedule.field.name && !map.has(scheduleFieldId)) {
          map.set(scheduleFieldId, schedule.field.name);
        }
      });
    }

    return map;
  }, [event?.fields, event?.timeSlots]);

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

  const userTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      return 'UTC';
    }
  }, []);

  const ensureIsoWithOffset = (value: string) => {
    if (!value) return null;
    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  };

  const formatDateTime = (value: string, overrideTimeZone?: string) => {
    const iso = ensureIsoWithOffset(value);
    if (!iso) return value;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return value;
    const timeZone = overrideTimeZone || userTimeZone;
    return `${date.toLocaleDateString([], { timeZone })} · ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    })}`;
  };

  const hasPlayoffMatches = useMemo(
    () => matches.some(match => match.matchType === 'playoff'),
    [matches],
  );

  const shouldShowBracketTab = hasPlayoffMatches || isPreview;

  useEffect(() => {
    if (!shouldShowBracketTab && activeTab === 'bracket') {
      setActiveTab('schedule');
    }
  }, [shouldShowBracketTab, activeTab]);

  const getTeamLabel = (match: Match, key: 'team1' | 'team2') => {
    const teamId = key === 'team1' ? match.team1Id : match.team2Id;
    if (teamId && teamLookup.has(teamId)) {
      return teamLookup.get(teamId)?.name || 'TBD';
    }

    const seed = key === 'team1' ? match.team1Seed : match.team2Seed;
    if (seed) {
      return `Seed ${seed}`;
    }

    return 'TBD';
  };

  const handlePublish = async () => {
    if (!event || publishing) return;
    setPublishing(true);
    setInfoMessage(null);
    try {
      const updated = await eventService.updateEvent(event.$id, { status: 'published' });
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
                  fieldLookup={fieldLookup}
                  getTeamLabel={getTeamLabel}
                  formatDateTime={formatDateTime}
                />
              )}
            </Tabs.Panel>

            {shouldShowBracketTab && (
              <Tabs.Panel value="bracket" pt="md">
                <PlayoffBracket
                  matches={matches}
                  fieldLookup={fieldLookup}
                  getTeamLabel={getTeamLabel}
                  formatDateTime={formatDateTime}
                />
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
