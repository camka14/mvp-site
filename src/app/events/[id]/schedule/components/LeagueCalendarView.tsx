import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paper, RangeSlider, Text } from '@mantine/core';
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

import type { Match } from '@/types';
import ScheduleMatchCard from './ScheduleMatchCard';

interface LeagueCalendarViewProps {
  matches: Match[];
  eventStart?: string;
  eventEnd?: string;
  onMatchClick?: (match: Match) => void;
  canManage?: boolean;
}

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

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
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
  return format(date, 'h a');
};

const MIN_CALENDAR_HEIGHT = 600;

export function LeagueCalendarView({
  matches,
  eventStart,
  eventEnd,
  onMatchClick,
  canManage = false,
}: LeagueCalendarViewProps) {
  const calendarEvents = useMemo(() => {
    return matches
      .map((match) => {
        const start = coerceDateTime(match.start);
        if (!start) return null;
        const end = coerceDateTime(match.end)
          ?? new Date(start.getTime() + 60 * 60 * 1000);

        return {
          id: match.$id,
          title: `${resolveTeamLabel(match, 'team1')} vs ${resolveTeamLabel(match, 'team2')}`,
          start,
          end,
          allDay: false,
          resource: match,
        } as CalendarEvent;
      })
      .filter((event): event is CalendarEvent => Boolean(event))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [matches]);

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
      return [8, 22];
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
    if (floor === ceil) {
      const adjusted = Math.min(24, floor + 1);
      return [Math.max(0, adjusted - 1), adjusted];
    }
    return [floor, ceil];
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

  const eventPropGetter = useCallback(() => ({
    style: {
      backgroundColor: 'transparent',
      border: 'none',
      padding: 0,
      cursor: onMatchClick ? 'pointer' : 'default',
      color: 'var(--mantine-color-text, #1f1f1f)',
    },
    className: 'p-0',
  }), [onMatchClick]);

  const MonthEventComponent = useCallback(({ event }: EventProps<CalendarEvent>) => {
    const match = event.resource;
    const field = match?.field && typeof match.field === 'object' ? match.field : null;
    const fieldLabel = field?.name
      || (field && 'fieldNumber' in field ? `Field ${(field as any).fieldNumber}` : null);

    return (
      <div className="leading-tight text-xs">
        <div className="font-medium truncate">{event.title}</div>
        {fieldLabel && <div className="opacity-70 truncate">{fieldLabel}</div>}
      </div>
    );
  }, []);

  const WeekDayEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => (
      <ScheduleMatchCard
        match={event.resource}
        canManage={canManage}
        onClick={onMatchClick ? () => onMatchClick(event.resource) : undefined}
        className="h-full"
      />
    ),
    [canManage, onMatchClick],
  );

  const AgendaEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => (
      <ScheduleMatchCard
        match={event.resource}
        canManage={canManage}
        onClick={onMatchClick ? () => onMatchClick(event.resource) : undefined}
        className="max-w-full"
      />
    ),
    [canManage, onMatchClick],
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

  const showRange = calendarView === 'week' || calendarView === 'day';

  const visibleHourSpan = useMemo(
    () => Math.max(1, timeRange[1] - timeRange[0]),
    [timeRange],
  );

  const slotGroupPropGetter = useCallback<SlotGroupPropGetter>(
    () => {
      const baseHeight = MIN_CALENDAR_HEIGHT / visibleHourSpan;
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
        {showRange && (
          <div className="mb-6">
            <Text size="sm" fw={600} mb={8}>
              Visible hours: {formatHourLabel(timeRange[0])} – {formatHourLabel(timeRange[1])}
            </Text>
            <RangeSlider
              min={0}
              max={24}
              step={1}
              minRange={1}
              value={timeRange}
              onChange={(value) => setTimeRange(value as [number, number])}
              marks={[
                { value: 0, label: '12 AM' },
                { value: 6, label: '6 AM' },
                { value: 12, label: '12 PM' },
                { value: 18, label: '6 PM' },
                { value: 24, label: '12 AM' },
              ]}
              label={(value) => formatHourLabel(value)}
              size="sm"
            />
          </div>
        )}
        <BigCalendar
          localizer={localizer}
          events={calendarEvents}
          date={calendarDate}
          view={calendarView}
          views={['month', 'week', 'day', 'agenda']}
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
          min={minTime}
          max={maxTime}
          style={{ height: '100%', minHeight: MIN_CALENDAR_HEIGHT }}
          slotGroupPropGetter={slotGroupPropGetter}
        />
      </Paper>
    </>
  );
}

export default LeagueCalendarView;
