'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Container, Title, Text, Group, Button, Paper, Alert, Badge, Tabs, Stack } from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { eventService } from '@/lib/eventService';
import { leagueService, LeagueScheduleResponse } from '@/lib/leagueService';
import type { Event, ScheduledMatchPayload, Team } from '@/types';

function LeagueScheduleContent() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id as string | undefined;

  const [event, setEvent] = useState<Event | null>(null);
  const [matches, setMatches] = useState<ScheduledMatchPayload[]>([]);
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
      loadSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, isGuest, eventId]);

  const loadSchedule = async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);

    try {
      const fetchedEvent = await eventService.getEventWithRelations(eventId);
      if (!fetchedEvent) {
        setError('League not found.');
        setLoading(false);
        return;
      }

      if (fetchedEvent.eventType !== 'league') {
        setError('This event is not a league.');
        setEvent(fetchedEvent);
        setLoading(false);
        return;
      }

      setEvent(fetchedEvent);

      let scheduleMatches: ScheduledMatchPayload[] = [];
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem(`league-preview:${eventId}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as LeagueScheduleResponse;
            scheduleMatches = parsed.matches || [];
          } catch (parseError) {
            console.warn('Failed to parse cached preview schedule:', parseError);
          } finally {
            sessionStorage.removeItem(`league-preview:${eventId}`);
          }
        }
      }

      if (!scheduleMatches.length) {
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

    if (event?.weeklySchedules) {
      event.weeklySchedules.forEach(schedule => {
        if (schedule.fieldId && schedule.field?.name && !map.has(schedule.fieldId)) {
          map.set(schedule.fieldId, schedule.field.name);
        }
      });
    }

    return map;
  }, [event?.fields, event?.weeklySchedules]);

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

  const computeWeekNumber = (start: string) => {
    if (!event?.start) return undefined;
    const eventStart = new Date(event.start);
    const matchStart = new Date(start);
    if (Number.isNaN(eventStart.getTime()) || Number.isNaN(matchStart.getTime())) return undefined;
    const diffMs = matchStart.getTime() - eventStart.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  };

  const matchesByWeek = useMemo(() => {
    const groups = new Map<number, ScheduledMatchPayload[]>();
    matches.forEach(match => {
      const week = match.weekNumber ?? computeWeekNumber(match.start) ?? 1;
      if (!groups.has(week)) {
        groups.set(week, []);
      }
      groups.get(week)!.push(match);
    });

    const sorted = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
    return sorted.map(([week, weekMatches]) => ({
      week,
      matches: weekMatches.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    }));
  }, [matches, event?.start]);

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getTeamLabel = (match: ScheduledMatchPayload, key: 'team1' | 'team2') => {
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
              <Button variant="default" onClick={loadSchedule}>Try Again</Button>
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
              <Tabs.Tab value="standings" disabled>Standings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="schedule" pt="md">
              {matches.length === 0 ? (
                <Paper withBorder radius="md" p="xl" ta="center">
                  <Text>No matches generated yet.</Text>
                </Paper>
              ) : (
                <Stack gap="lg">
                  {matchesByWeek.map(({ week, matches: weekMatches }) => (
                    <Paper key={`week-${week}`} withBorder radius="md" p="lg">
                      <Group justify="space-between" mb="md">
                        <Text fw={600}>Week {week}</Text>
                        <Text c="dimmed" size="sm">{weekMatches.length} match{weekMatches.length !== 1 ? 'es' : ''}</Text>
                      </Group>

                      <Stack gap="sm">
                        {weekMatches.map(match => (
                          <Paper key={match.id} withBorder radius="md" p="md" shadow="xs">
                            <Group justify="space-between" align="flex-start" wrap="wrap">
                              <div>
                                <Group gap="sm">
                                  <Text fw={600}>{formatDateTime(match.start)}</Text>
                                  {match.matchType === 'playoff' && (
                                    <Badge color="grape" variant="light">Playoff</Badge>
                                  )}
                                </Group>
                                <Text size="sm" c="dimmed">
                                  {fieldLookup.get(match.fieldId) || `Field ${match.fieldId || 'TBD'}`}
                                </Text>
                              </div>
                              <div className="text-right">
                                <Text size="sm" c="dimmed">Ends {formatDateTime(match.end)}</Text>
                              </div>
                            </Group>

                            <div className="mt-3">
                              <Group gap="sm" align="center">
                                <Text fw={600}>{getTeamLabel(match, 'team1')}</Text>
                                <Text c="dimmed">vs</Text>
                                <Text fw={600}>{getTeamLabel(match, 'team2')}</Text>
                              </Group>
                            </div>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Tabs.Panel>

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
