'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
} from 'react-big-calendar';
import type { EventProps, ToolbarProps, View } from 'react-big-calendar';
import { parse, format, getDay, startOfWeek } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import Loading from '@/components/ui/Loading';
import type { Event, Field, Match, Team } from '@/types';
import {
  normalizeApiEvent,
  normalizeApiField,
  normalizeApiMatch,
  normalizeApiTeam,
} from '@/lib/apiMappers';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import SharedCalendarEvent from '@/components/calendar/SharedCalendarEvent';
import {
  loadCompleteSchedulePayload,
  normalizeScheduleCalendarRange,
  withScheduleDateWindow,
  type ScheduleDateWindow,
  type SchedulePage,
} from '@/lib/schedulePagination';

type SchedulePayload = SchedulePage<Event, Match, Field, Team>;

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

type ScheduleCalendarPanelProps = {
  endpoint: string;
  title?: string;
  description?: string;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
  emptyAgendaText?: string;
  showHeader?: boolean;
  titleOrder?: 2 | 3 | 4 | 5;
  minHeight?: number;
  className?: string;
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

const SCHEDULE_CARD_MIN_HEIGHT = '2.7rem';
const SCHEDULE_CALENDAR_VIEW_ORDER: View[] = ['month', 'week', 'day', 'agenda'];

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

const isHeaderLikeCalendarEvent = (event: ScheduleCalendarEvent): boolean => {
  return Boolean(event.allDay) || event.start.toDateString() !== event.end.toDateString();
};

const getScheduleCardStyle = (
  view: View,
  event: ScheduleCalendarEvent,
): CSSProperties => {
  const needsReadableAutoHeight = view === 'month' || view === 'agenda' || isHeaderLikeCalendarEvent(event);

  return {
    minHeight: needsReadableAutoHeight ? SCHEDULE_CARD_MIN_HEIGHT : undefined,
    height: needsReadableAutoHeight ? 'auto' : '100%',
  };
};

const getToolbarViewNames = (
  views: ToolbarProps<ScheduleCalendarEvent>['views'],
): View[] => {
  const enabledViews = Array.isArray(views)
    ? views
    : Object.entries(views)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name as View);

  return SCHEDULE_CALENDAR_VIEW_ORDER.filter((view) => enabledViews.includes(view));
};

function ScheduleCalendarToolbar({
  label,
  localizer,
  onNavigate,
  onView,
  view,
  views,
}: ToolbarProps<ScheduleCalendarEvent>) {
  const viewNames = getToolbarViewNames(views);
  const messages = localizer.messages;

  return (
    <div className="rbc-toolbar shared-calendar-toolbar">
      <span className="rbc-btn-group">
        <button type="button" onClick={() => onNavigate('TODAY')}>
          {messages.today}
        </button>
        <button type="button" onClick={() => onNavigate('PREV')}>
          {messages.previous}
        </button>
        <button type="button" onClick={() => onNavigate('NEXT')}>
          {messages.next}
        </button>
      </span>
      <span className="rbc-toolbar-label">{label}</span>
      {viewNames.length > 1 ? (
        <span className="rbc-btn-group shared-calendar-toolbar__views">
          {viewNames.map((viewName) => (
            <button
              key={viewName}
              type="button"
              className={view === viewName ? 'rbc-active' : undefined}
              onClick={() => onView(viewName)}
            >
              {messages[viewName]}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

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

  return 'TBD Team';
};

export default function ScheduleCalendarPanel({
  endpoint,
  title,
  description,
  loadingText = 'Loading schedule...',
  errorText = 'Failed to load schedule. Please try again.',
  emptyText = 'No schedule entries found.',
  emptyAgendaText = 'No upcoming schedule entries found.',
  showHeader = true,
  titleOrder = 2,
  minHeight = 700,
  className,
}: ScheduleCalendarPanelProps) {
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
  const [visibleWindow, setVisibleWindow] = useState<ScheduleDateWindow | null>(null);
  const requestGenerationRef = useRef(0);

  const loadSchedule = useCallback(async (
    mode: 'initial' | 'refresh' = 'initial',
    dateWindow: ScheduleDateWindow | null = null,
  ) => {
    const requestGeneration = ++requestGenerationRef.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const requestEndpoint = dateWindow ? withScheduleDateWindow(endpoint, dateWindow) : endpoint;
      const payload = await loadCompleteSchedulePayload(requestEndpoint, async (pageEndpoint) => {
        const response = await fetch(pageEndpoint, {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Failed to load schedule (${response.status})`);
        }
        return (await response.json()) as SchedulePayload;
      });
      const normalizedEvents = Array.isArray(payload.events)
        ? payload.events.map((event) => normalizeApiEvent(event)).filter((event): event is Event => Boolean(event))
        : [];
      const normalizedMatches = Array.isArray(payload.matches)
        ? payload.matches.map((match) => normalizeApiMatch(match))
        : [];
      const normalizedFields = Array.isArray(payload.fields)
        ? payload.fields.map((field) => normalizeApiField(field))
        : [];
      const normalizedTeams = Array.isArray(payload.teams)
        ? payload.teams.map((team) => normalizeApiTeam(team))
        : [];

      if (requestGeneration !== requestGenerationRef.current) return;
      setEvents(normalizedEvents);
      setMatches(normalizedMatches);
      setFields(normalizedFields);
      setTeams(normalizedTeams);
    } catch (err) {
      if (requestGeneration !== requestGenerationRef.current) return;
      console.error('Failed to load schedule', err);
      setError(errorText);
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [endpoint, errorText]);

  useEffect(() => {
    void loadSchedule('initial');
  }, [loadSchedule]);

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

  const eventColorReferenceList = useMemo(() => {
    return buildUniqueColorReferenceList(scheduleEntries.map((entry) => entry.resource.eventName));
  }, [scheduleEntries]);
  const visibleEntryCount = calendarView === 'agenda' ? upcomingEntries.length : scheduleEntries.length;
  const emptyScheduleText = calendarView === 'agenda' ? emptyAgendaText : emptyText;

  const EventTile = useCallback(({ event }: EventProps<ScheduleCalendarEvent>) => (
    <SharedCalendarEvent
      title={event.title}
      subtitle={event.resource.subtitle}
      meta={event.resource.kind === 'match' ? event.resource.eventName : undefined}
      colorSeed={event.resource.eventId || event.title}
      colorReferenceList={eventColorReferenceList}
      colorMatchKey={event.resource.eventName}
      className="my-schedule-calendar-event"
      style={getScheduleCardStyle(calendarView, event)}
      compact
    />
  ), [calendarView, eventColorReferenceList]);

  const shellClassName = [
    'shared-calendar-shell',
    'my-schedule-calendar-shell',
    className,
  ].filter(Boolean).join(' ');

  const Header = showHeader ? (
    <Group justify="space-between" align="center">
      <div>
        {title ? <Title order={titleOrder}>{title}</Title> : null}
        {description ? <Text c="dimmed">{description}</Text> : null}
      </div>
      <Group>
        <Badge color="blue" variant="light">
          {scheduleEntries.length} entries
        </Badge>
        <Button
          variant="light"
          loading={refreshing}
          onClick={() => {
            void loadSchedule('refresh', visibleWindow);
          }}
        >
          Refresh
        </Button>
      </Group>
    </Group>
  ) : null;

  if (loading) {
    return (
      <Stack gap="lg">
        {Header}
        <Paper withBorder radius="md" p="lg">
          <Loading text={loadingText} />
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {Header}

      {error ? (
        <Paper withBorder radius="md" p="md">
          <Text c="red">{error}</Text>
        </Paper>
      ) : null}

      <Paper withBorder radius="md" p="lg" className={shellClassName}>
        {visibleEntryCount === 0 ? (
          <Group justify="flex-end" mb="md">
            <Text c="dimmed" size="sm">
              {emptyScheduleText}
            </Text>
          </Group>
        ) : null}

        <BigCalendar
          localizer={localizer}
          events={calendarView === 'agenda' ? upcomingEntries : scheduleEntries}
          date={calendarDate}
          view={calendarView}
          views={['month', 'week', 'day', 'agenda']}
          onView={(view) => {
            setCalendarView(view);
            if (view === 'agenda') {
              setCalendarDate(new Date());
            }
          }}
          onNavigate={(date) => setCalendarDate(date instanceof Date ? date : new Date(date))}
          onRangeChange={(range) => {
            const nextWindow = normalizeScheduleCalendarRange(range);
            if (!nextWindow) return;
            if (
              visibleWindow
              && visibleWindow.from.getTime() === nextWindow.from.getTime()
              && visibleWindow.to.getTime() === nextWindow.to.getTime()
            ) return;
            setVisibleWindow(nextWindow);
            void loadSchedule('refresh', nextWindow);
          }}
          startAccessor="start"
          endAccessor="end"
          length={120}
          onSelectEvent={(selectedEvent) => {
            router.push(`/events/${selectedEvent.resource.eventId}?tab=details`);
          }}
          popup
          selectable
          components={{
            toolbar: ScheduleCalendarToolbar,
            event: EventTile,
            month: { event: EventTile },
            week: { event: EventTile },
            day: { event: EventTile },
          }}
          eventPropGetter={(entry) => {
            const needsReadableAutoHeight =
              calendarView === 'month' || calendarView === 'agenda' || isHeaderLikeCalendarEvent(entry);

            return {
              className: needsReadableAutoHeight ? 'my-schedule-calendar-event-wrapper' : undefined,
              style: {
                backgroundColor: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--mvp-text)',
                ...(needsReadableAutoHeight ? { minHeight: SCHEDULE_CARD_MIN_HEIGHT } : {}),
              },
            };
          }}
          style={{ minHeight }}
          formats={calendarFormats}
        />
      </Paper>
    </Stack>
  );
}
