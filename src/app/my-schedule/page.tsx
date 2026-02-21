'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  EventProps,
  View,
} from 'react-big-calendar';
import { parse, format, getDay, startOfWeek } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import type { Event, Field, Match, Team } from '@/types';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';

type SchedulePayload = {
  events?: Event[];
  matches?: Match[];
  fields?: Field[];
  teams?: Team[];
};

type ScheduleCalendarResource = {
  kind: 'match' | 'event';
  eventId: string;
  eventName: string;
  subtitle?: string;
};

type ScheduleCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: ScheduleCalendarResource;
};

const localizer = dateFnsLocalizer({
  format,
  parse: parse as any,
  startOfWeek,
  getDay,
  locales: {} as any,
});

const calendarFormats = {
  dayFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayHeaderFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayDate(start, { year: '2-digit' })} - ${formatDisplayDate(end, { year: '2-digit' })}`,
  monthHeaderFormat: (value: Date) => formatDisplayDate(value),
  agendaDateFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  agendaTimeFormat: (value: Date) => formatDisplayTime(value),
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`,
  timeGutterFormat: (value: Date) => formatDisplayTime(value),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`,
};

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getEntityName = (value: unknown, fallback: string): string => {
  if (value && typeof value === 'object' && 'name' in value && typeof (value as any).name === 'string') {
    const name = (value as any).name.trim();
    if (name.length > 0) return name;
  }
  return fallback;
};

const getTeamName = (
  match: Match,
  side: 'team1' | 'team2',
  teamsById: Map<string, Team>,
): string => {
  const relationTeam = side === 'team1' ? match.team1 : match.team2;
  const relationName = getEntityName(relationTeam, '');
  if (relationName) return relationName;

  const id = side === 'team1' ? match.team1Id : match.team2Id;
  if (typeof id === 'string' && id.trim().length > 0) {
    const mapped = teamsById.get(id);
    if (mapped) {
      return getEntityName(mapped, '');
    }
  }

  const seed = side === 'team1' ? match.team1Seed : match.team2Seed;
  if (typeof seed === 'number') {
    return `Seed ${seed}`;
  }
  return 'TBD';
};

export default function MySchedulePage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading your schedule..." />}>
      <MySchedulePageContent />
    </Suspense>
  );
}

function MySchedulePageContent() {
  const { user, isAuthenticated, loading: authLoading } = useApp();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  const loadSchedule = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/profile/schedule?limit=300', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to load schedule (${response.status})`);
      }

      const payload = (await response.json()) as SchedulePayload;
      const normalizedEvents = Array.isArray(payload.events)
        ? payload.events.map((event) => normalizeApiEvent(event)).filter((event): event is Event => Boolean(event))
        : [];
      const normalizedMatches = Array.isArray(payload.matches)
        ? payload.matches.map((match) => normalizeApiMatch(match))
        : [];
      const normalizedFields = Array.isArray(payload.fields)
        ? payload.fields
        : [];
      const normalizedTeams = Array.isArray(payload.teams)
        ? payload.teams
        : [];

      setEvents(normalizedEvents);
      setMatches(normalizedMatches);
      setFields(normalizedFields);
      setTeams(normalizedTeams);
    } catch (err) {
      console.error('Failed to load my schedule', err);
      setError('Failed to load your schedule. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }
    void loadSchedule('initial');
  }, [authLoading, isAuthenticated, router, user]);

  const scheduleEntries = useMemo<ScheduleCalendarEvent[]>(() => {
    const eventsById = new Map(events.map((event) => [event.$id, event]));
    const teamsById = new Map(teams.map((team) => [team.$id, team]));
    const fieldsById = new Map(fields.map((field) => [field.$id, field]));
    const eventIdsWithMatches = new Set(matches.map((match) => match.eventId).filter(Boolean) as string[]);

    const matchEntries: ScheduleCalendarEvent[] = matches.flatMap((match) => {
      const start = parseDate(match.start);
      if (!start) return [];
      const end = parseDate(match.end) ?? new Date(start.getTime() + 60 * 60 * 1000);
      const eventId = (match.eventId ?? '').trim();
      if (!eventId) return [];
      const eventName = eventsById.get(eventId)?.name?.trim() || 'Event';

      const team1Name = getTeamName(match, 'team1', teamsById);
      const team2Name = getTeamName(match, 'team2', teamsById);
      const fieldId = typeof match.fieldId === 'string' ? match.fieldId.trim() : '';
      const fieldName = fieldId
        ? getEntityName(fieldsById.get(fieldId), 'Field')
        : getEntityName(match.field, 'Field');

      return [{
        id: `match-${match.$id}`,
        title: `${team1Name} vs ${team2Name}`,
        start,
        end,
        allDay: false,
        resource: {
          kind: 'match',
          eventId,
          eventName,
          subtitle: fieldName ? `${eventName} • ${fieldName}` : eventName,
        },
      } satisfies ScheduleCalendarEvent];
    });

    const eventEntries: ScheduleCalendarEvent[] = events
      .filter((event) => !eventIdsWithMatches.has(event.$id))
      .flatMap((event) => {
        const start = parseDate(event.start);
        if (!start) return [];
        const end = parseDate(event.end) ?? new Date(start.getTime() + 60 * 60 * 1000);
        return [{
          id: `event-${event.$id}`,
          title: event.name || 'Event',
          start,
          end,
          allDay: event.eventType === 'EVENT',
          resource: {
            kind: 'event',
            eventId: event.$id,
            eventName: event.name || 'Event',
            subtitle: event.location?.trim() || undefined,
          },
        } satisfies ScheduleCalendarEvent];
      });

    return [...eventEntries, ...matchEntries].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, fields, matches, teams]);

  const upcomingEntries = useMemo<ScheduleCalendarEvent[]>(() => {
    const now = Date.now();
    return scheduleEntries.filter((entry) => entry.end.getTime() >= now);
  }, [scheduleEntries]);

  const EventTile = ({ event }: EventProps<ScheduleCalendarEvent>) => (
    <div className="leading-tight text-xs">
      <div className="font-medium truncate">{event.title}</div>
      {event.resource.subtitle ? (
        <div className="opacity-70 truncate">{event.resource.subtitle}</div>
      ) : null}
    </div>
  );

  if (authLoading || loading) {
    return <Loading fullScreen text="Loading your schedule..." />;
  }
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
      <Navigation />
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Title order={2}>My Schedule</Title>
              <Text c="dimmed">Events and matches you or your teams are part of.</Text>
            </div>
            <Group>
              <Badge color="blue" variant="light">
                {scheduleEntries.length} entries
              </Badge>
              <Button
                variant="light"
                loading={refreshing}
                onClick={() => {
                  void loadSchedule('refresh');
                }}
              >
                Refresh
              </Button>
            </Group>
          </Group>

          {error ? (
            <Paper withBorder radius="md" p="md">
              <Text c="red">{error}</Text>
            </Paper>
          ) : null}

          <Paper withBorder radius="md" p="lg">
            <Group justify="space-between" mb="md">
              <SegmentedControl
                value={calendarView}
                onChange={(value) => {
                  const nextView = value as View;
                  setCalendarView(nextView);
                  if (nextView === 'agenda') {
                    setCalendarDate(new Date());
                  }
                }}
                data={[
                  { value: 'month', label: 'Month' },
                  { value: 'week', label: 'Week' },
                  { value: 'day', label: 'Day' },
                  { value: 'agenda', label: 'Agenda' },
                ]}
              />
              {(calendarView === 'agenda' ? upcomingEntries.length : scheduleEntries.length) === 0 ? (
                <Text c="dimmed" size="sm">
                  {calendarView === 'agenda' ? 'No upcoming schedule entries found.' : 'No schedule entries found.'}
                </Text>
              ) : null}
            </Group>

            <BigCalendar
              localizer={localizer}
              events={calendarView === 'agenda' ? upcomingEntries : scheduleEntries}
              date={calendarDate}
              view={calendarView}
              views={['month', 'week', 'day', 'agenda']}
              onView={(view) => setCalendarView(view)}
              onNavigate={(date) => setCalendarDate(date instanceof Date ? date : new Date(date))}
              startAccessor="start"
              endAccessor="end"
              length={120}
              onSelectEvent={(selectedEvent) => {
                router.push(`/events/${selectedEvent.resource.eventId}/schedule?tab=details`);
              }}
              popup
              selectable
              components={{
                event: EventTile,
                month: { event: EventTile },
                week: { event: EventTile },
                day: { event: EventTile },
              }}
              style={{ minHeight: 700 }}
              formats={calendarFormats}
            />
          </Paper>
        </Stack>
      </Container>
    </>
  );
}
