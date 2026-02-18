import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Paper, RangeSlider, SegmentedControl, Text } from '@mantine/core';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  EventProps,
  SlotInfo,
  SlotGroupPropGetter,
  View,
} from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import type { Field, Match, UserData } from '@/types';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import MatchCard from './MatchCard';

interface LeagueCalendarViewProps {
  matches: Match[];
  fields?: Field[];
  eventStart?: string;
  eventEnd?: string;
  onMatchClick?: (match: Match) => void;
  canManage?: boolean;
  matchCardPaddingY?: string;
  currentUser?: UserData | null;
}

type CalendarLayoutMode = 'calendar' | 'resource';

type CalendarResource = {
  resourceId: string;
  resourceTitle: string;
};

const UNASSIGNED_FIELD_RESOURCE_ID = '__unassigned_field__';
const MIN_VISIBLE_HOUR_SLOTS = 6;
const MIN_HOUR_SLOT_HEIGHT = 112;

const clampHour = (value: number): number => Math.max(0, Math.min(24, value));

const ensureMinimumHourSpan = (range: [number, number]): [number, number] => {
  let [start, end] = range;
  start = clampHour(start);
  end = clampHour(end);

  if (end <= start) {
    end = Math.min(24, start + 1);
  }

  const span = end - start;
  if (span >= MIN_VISIBLE_HOUR_SLOTS) {
    return [start, end];
  }

  const shortfall = MIN_VISIBLE_HOUR_SLOTS - span;
  const expandBefore = Math.floor(shortfall / 2);
  const expandAfter = shortfall - expandBefore;

  start = Math.max(0, start - expandBefore);
  end = Math.min(24, end + expandAfter);

  // If one side hit bounds, shift the opposite side to preserve the minimum span.
  if (end - start < MIN_VISIBLE_HOUR_SLOTS) {
    if (start === 0) {
      end = Math.min(24, start + MIN_VISIBLE_HOUR_SLOTS);
    } else if (end === 24) {
      start = Math.max(0, end - MIN_VISIBLE_HOUR_SLOTS);
    }
  }

  return [start, end];
};

const parseDateInput = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    if (![year, month, day].some(Number.isNaN)) {
      return new Date(year, (month ?? 1) - 1, day ?? 1);
    }
  }

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const withOffset = new Date(`${trimmed}Z`);
    if (!Number.isNaN(withOffset.getTime())) {
      return withOffset;
    }
  }

  return null;
};

const coerceDateTime = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value);
  const primary = new Date(raw);
  if (!Number.isNaN(primary.getTime())) {
    return primary;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const resolveTeamLabel = (match: Match, key: 'team1' | 'team2') => {
  const relation = key === 'team1' ? match.team1 : match.team2;
  if (relation && typeof relation === 'object' && 'name' in relation && relation?.name) {
    return relation.name as string;
  }

  const seed = key === 'team1' ? match.team1Seed : match.team2Seed;
  if (typeof seed === 'number') {
    return `Seed ${seed}`;
  }

  return 'TBD';
};

const resolveFieldLabel = (field?: Field | null): string | null => {
  if (!field) return null;

  const name = typeof field.name === 'string' ? field.name.trim() : '';
  if (name.length > 0) {
    return name;
  }

  if (typeof field.fieldNumber === 'number' && Number.isFinite(field.fieldNumber) && field.fieldNumber > 0) {
    return `Field ${field.fieldNumber}`;
  }

  return null;
};

const resolveMatchFieldId = (match: Match): string | null => {
  const relationFieldId =
    match.field && typeof match.field === 'object' && '$id' in match.field && typeof match.field.$id === 'string'
      ? match.field.$id.trim()
      : '';
  if (relationFieldId.length > 0) {
    return relationFieldId;
  }

  const fieldId = typeof match.fieldId === 'string' ? match.fieldId.trim() : '';
  return fieldId.length > 0 ? fieldId : null;
};

const resolveMatchFieldLabel = (match: Match, fieldLookup: Map<string, Field>): string => {
  const fieldId = resolveMatchFieldId(match);
  const relationField = match.field && typeof match.field === 'object' ? match.field : null;
  const mappedField = fieldId ? fieldLookup.get(fieldId) ?? null : null;
  return (
    resolveFieldLabel(relationField) ??
    resolveFieldLabel(mappedField) ??
    'Field TBD'
  );
};

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resourceId: string;
  fieldLabel: string;
  resource: Match;
};

const localizer = dateFnsLocalizer({
  format,
  parse: parse as any,
  startOfWeek,
  getDay,
  locales: {} as any,
});

const formatHourLabel = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return formatDisplayTime(date);
};

const MIN_CALENDAR_HEIGHT = 600;

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

export function LeagueCalendarView({
  matches,
  fields = [],
  eventStart,
  eventEnd,
  onMatchClick,
  canManage = false,
  matchCardPaddingY = 'my-2',
  currentUser,
}: LeagueCalendarViewProps) {
  const userTeamIds = useMemo(() => new Set(currentUser?.teamIds ?? []), [currentUser?.teamIds]);
  const [layoutMode, setLayoutMode] = useState<CalendarLayoutMode>('calendar');

  const fieldLookup = useMemo(() => {
    const lookup = new Map<string, Field>();
    fields.forEach((field) => {
      if (typeof field.$id === 'string' && field.$id.trim().length > 0) {
        lookup.set(field.$id.trim(), field);
      }
    });
    return lookup;
  }, [fields]);

  const teamHasUser = useCallback(
    (team: Match['team1'], fallbackId?: string | null) => {
      if (!currentUser?.$id) return false;
      const teamId =
        (team && typeof team === 'object' && '$id' in team && typeof (team as any).$id === 'string'
          ? (team as any).$id
          : undefined) ?? (typeof fallbackId === 'string' ? fallbackId : undefined);

      if (teamId && userTeamIds.has(teamId)) {
        return true;
      }

      const players = (team as any)?.players;
      if (Array.isArray(players) && players.some((player) => player?.$id === currentUser.$id)) {
        return true;
      }

      const playerIds = (team as any)?.playerIds;
      if (Array.isArray(playerIds) && playerIds.includes(currentUser.$id)) {
        return true;
      }

      const captainId = (team as any)?.captainId ?? (team as any)?.captain?.$id;
      if (typeof captainId === 'string' && captainId === currentUser.$id) {
        return true;
      }

      return false;
    },
    [currentUser?.$id, userTeamIds],
  );

  const matchInvolvesCurrentUser = useCallback(
    (match: Match) => {
      if (!currentUser?.$id) return false;

      if (match.refereeId === currentUser.$id || match.referee?.$id === currentUser.$id) {
        return true;
      }

      return teamHasUser(match.team1, match.team1Id) || teamHasUser(match.team2, match.team2Id);
    },
    [currentUser?.$id, teamHasUser],
  );

  const [showMyMatchesOnly, setShowMyMatchesOnly] = useState(false);

  const matchesToDisplay = useMemo(
    () =>
      showMyMatchesOnly && currentUser
        ? matches.filter((match) => matchInvolvesCurrentUser(match))
        : matches,
    [currentUser, matchInvolvesCurrentUser, matches, showMyMatchesOnly],
  );

  const userInvolvedMatchIds = useMemo(
    () =>
      currentUser
        ? new Set(
            matches
              .filter((match) => matchInvolvesCurrentUser(match))
              .map((match) => match.$id),
          )
        : new Set<string>(),
    [currentUser, matchInvolvesCurrentUser, matches],
  );

  const calendarEvents = useMemo(() => {
    return matchesToDisplay
      .map((match) => {
        const start = coerceDateTime(match.start);
        if (!start) return null;
        const end = coerceDateTime(match.end)
          ?? new Date(start.getTime() + 60 * 60 * 1000);
        const fieldId = resolveMatchFieldId(match);
        const fieldLabel = resolveMatchFieldLabel(match, fieldLookup);

        return {
          id: match.$id,
          title: `${resolveTeamLabel(match, 'team1')} vs ${resolveTeamLabel(match, 'team2')}`,
          start,
          end,
          allDay: false,
          resourceId: fieldId ?? UNASSIGNED_FIELD_RESOURCE_ID,
          fieldLabel,
          resource: match,
        } as CalendarEvent;
      })
      .filter((event): event is CalendarEvent => Boolean(event))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [fieldLookup, matchesToDisplay]);

  const calendarResources = useMemo<CalendarResource[]>(() => {
    const resources = new Map<string, CalendarResource>();

    fields.forEach((field) => {
      const fieldId = typeof field.$id === 'string' ? field.$id.trim() : '';
      if (!fieldId) return;
      resources.set(fieldId, {
        resourceId: fieldId,
        resourceTitle: resolveFieldLabel(field) ?? 'Field TBD',
      });
    });

    calendarEvents.forEach((event) => {
      if (resources.has(event.resourceId)) return;
      resources.set(event.resourceId, {
        resourceId: event.resourceId,
        resourceTitle: event.resourceId === UNASSIGNED_FIELD_RESOURCE_ID ? 'Unassigned' : event.fieldLabel,
      });
    });

    return Array.from(resources.values());
  }, [calendarEvents, fields]);

  const initialDate = useMemo(() => {
    if (calendarEvents.length > 0) {
      return calendarEvents[0].start;
    }

    const startDate = parseDateInput(eventStart);
    if (startDate) return startDate;

    const endDate = parseDateInput(eventEnd);
    if (endDate) return endDate;

    return new Date();
  }, [calendarEvents, eventEnd, eventStart]);

  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(initialDate);

  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!calendarEvents.length) {
      return ensureMinimumHourSpan([8, 22]);
    }

    let earliest = 24;
    let latest = 0;
    calendarEvents.forEach((event) => {
      const startHour = event.start.getHours() + event.start.getMinutes() / 60;
      const endHour = event.end.getHours() + event.end.getMinutes() / 60;
      earliest = Math.min(earliest, startHour);
      latest = Math.max(latest, endHour);
    });

    const floor = Math.max(0, Math.floor(earliest));
    const ceil = Math.min(24, Math.ceil(latest));
    return ensureMinimumHourSpan([floor, ceil]);
  }, [calendarEvents]);

  const [timeRange, setTimeRange] = useState<[number, number]>(defaultTimeRange);

  useEffect(() => {
    setTimeRange(defaultTimeRange);
  }, [defaultTimeRange]);

  useEffect(() => {
    setCalendarDate(initialDate);
  }, [initialDate]);

  const handleNavigate = (date: Date) => {
    setCalendarDate(date instanceof Date ? date : new Date(date));
  };

  const handleViewChange = (view: View) => {
    setCalendarView(view);
  };

  const handleSelectSlot = ({ start }: SlotInfo) => {
    if (!start) return;
    setCalendarDate(start instanceof Date ? start : new Date(start));
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    if (onMatchClick) {
      onMatchClick(event.resource);
    }
  };

  const eventPropGetter = useCallback(
    (event: CalendarEvent) => {
      const isUsersMatch = userInvolvedMatchIds.has(event.resource.$id);
      return {
        style: {
          backgroundColor: isUsersMatch ? 'var(--mantine-color-green-0, #ecfdf3)' : 'transparent',
          border: isUsersMatch ? '2px solid #bbf7d0' : 'none',
          padding: 0,
          cursor: onMatchClick ? 'pointer' : 'default',
          color: 'var(--mantine-color-text, #1f1f1f)',
        },
        className: 'p-0',
      };
    },
    [onMatchClick, userInvolvedMatchIds],
  );

  const MonthEventComponent = useCallback(({ event }: EventProps<CalendarEvent>) => {
    return (
      <div className="leading-tight text-xs">
        <div className="font-medium truncate">{event.title}</div>
        <div className="opacity-70 truncate">{event.fieldLabel}</div>
      </div>
    );
  }, []);

  const WeekDayEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => (
      <MatchCard
        match={event.resource}
        canManage={canManage}
        onClick={onMatchClick ? () => onMatchClick(event.resource) : undefined}
        className={`h-full ${
          userInvolvedMatchIds.has(event.resource.$id) ? 'border-green-200 hover:border-green-300' : ''
        }`}
        layout="horizontal"
        hideTimeBadge
        showRefereeInHeader
        fieldLabel={event.fieldLabel}
      />
    ),
    [canManage, onMatchClick, userInvolvedMatchIds],
  );

  const AgendaEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => (
      <MatchCard
        match={event.resource}
        canManage={canManage}
        onClick={onMatchClick ? () => onMatchClick(event.resource) : undefined}
        className={`max-w-full ${matchCardPaddingY} ${
          userInvolvedMatchIds.has(event.resource.$id) ? 'border-green-200 hover:border-green-300' : ''
        }`}
        layout="horizontal"
        hideTimeBadge
        showRefereeInHeader
        fieldLabel={event.fieldLabel}
      />
    ),
    [canManage, onMatchClick, matchCardPaddingY, userInvolvedMatchIds],
  );

  const components = useMemo(
    () => ({
      event: WeekDayEventComponent,
      month: { event: MonthEventComponent },
      week: { event: WeekDayEventComponent },
      day: { event: WeekDayEventComponent },
      agenda: { event: AgendaEventComponent },
    }),
    [AgendaEventComponent, MonthEventComponent, WeekDayEventComponent],
  );

  const calendarViews = useMemo<View[]>(
    () => (layoutMode === 'resource' ? ['day', 'week'] : ['month', 'week', 'day', 'agenda']),
    [layoutMode],
  );
  const effectiveCalendarView = useMemo<View>(
    () => (calendarViews.includes(calendarView) ? calendarView : calendarViews[0]),
    [calendarView, calendarViews],
  );
  const showRange = effectiveCalendarView === 'week' || effectiveCalendarView === 'day';

  useEffect(() => {
    if (calendarView !== effectiveCalendarView) {
      setCalendarView(effectiveCalendarView);
    }
  }, [calendarView, effectiveCalendarView]);

  const visibleHourSpan = useMemo(
    () => Math.max(MIN_VISIBLE_HOUR_SLOTS, timeRange[1] - timeRange[0]),
    [timeRange],
  );

  const slotGroupPropGetter = useCallback<SlotGroupPropGetter>(
    () => {
      const baseHeight = Math.max(MIN_CALENDAR_HEIGHT / visibleHourSpan, MIN_HOUR_SLOT_HEIGHT);
      return {
        style: {
          height: `${baseHeight}px`,
          minHeight: `${baseHeight}px`,
          flex: '0 0 auto',
        },
      };
    },
    [visibleHourSpan],
  );

  const minTime = useMemo(() => new Date(1970, 0, 1, timeRange[0], 0, 0), [timeRange]);
  const maxTime = useMemo(() => {
    const hour = Math.min(24, Math.max(timeRange[1], timeRange[0] + 1));
    if (hour >= 24) {
      return new Date(1970, 0, 1, 23, 59, 59, 999);
    }
    return new Date(1970, 0, 1, hour, 0, 0);
  }, [timeRange]);

  return (
    <>
        <style jsx global>{`
        .rbc-event-label {
          display: none;
        }

        .rbc-event,
        .rbc-background-event {
          z-index: 2;
          padding: 0;
          border: none;
        }
      `}</style>
      <Paper
        withBorder
        radius="md"
        p="lg"
        style={{ width: '100%', minHeight: MIN_CALENDAR_HEIGHT + (showRange ? 120 : 0) }}
        data-testid="league-calendar"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={layoutMode}
            onChange={(value) => setLayoutMode(value as CalendarLayoutMode)}
            data={[
              { value: 'calendar', label: 'Calendar' },
              { value: 'resource', label: 'By Field' },
            ]}
          />
          {currentUser && (
            <Button
              size="sm"
              variant={showMyMatchesOnly ? 'filled' : 'light'}
              color="green"
              onClick={() => setShowMyMatchesOnly((prev) => !prev)}
            >
              {showMyMatchesOnly ? 'Showing My Matches' : 'Show Only My Matches'}
            </Button>
          )}
        </div>
        {showRange && (
          <div className="mb-6">
            <Text size="sm" fw={600} mb={8}>
              Visible hours: {formatHourLabel(timeRange[0])} – {formatHourLabel(timeRange[1])}
            </Text>
            <RangeSlider
              min={0}
              max={24}
              step={1}
              minRange={MIN_VISIBLE_HOUR_SLOTS}
              value={timeRange}
              onChange={(value) => setTimeRange(ensureMinimumHourSpan(value as [number, number]))}
              marks={[
                { value: 0, label: formatHourLabel(0) },
                { value: 6, label: formatHourLabel(6) },
                { value: 12, label: formatHourLabel(12) },
                { value: 18, label: formatHourLabel(18) },
                { value: 24, label: formatHourLabel(24) },
              ]}
              label={(value) => formatHourLabel(value)}
              size="sm"
            />
          </div>
        )}
        <BigCalendar
          localizer={localizer}
          events={calendarEvents}
          resources={layoutMode === 'resource' ? calendarResources : undefined}
          date={calendarDate}
          view={effectiveCalendarView}
          views={calendarViews}
          onView={handleViewChange}
          onNavigate={handleNavigate}
          selectable
          popup
          longPressThreshold={20}
          components={components}
          eventPropGetter={eventPropGetter}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          startAccessor="start"
          endAccessor="end"
          resourceAccessor="resourceId"
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          min={minTime}
          max={maxTime}
          style={{ height: '100%', minHeight: MIN_CALENDAR_HEIGHT }}
          slotGroupPropGetter={slotGroupPropGetter}
          formats={calendarFormats}
        />
      </Paper>
    </>
  );
}

export default LeagueCalendarView;
