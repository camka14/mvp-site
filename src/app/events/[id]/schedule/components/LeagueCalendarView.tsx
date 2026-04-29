import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Paper, RangeSlider, SegmentedControl, Text } from '@mantine/core';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  EventProps,
  SlotInfo,
  SlotGroupPropGetter,
  View,
} from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import type { Field, Match, Team, UserData } from '@/types';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import SharedCalendarEvent from '@/components/calendar/SharedCalendarEvent';

interface LeagueCalendarViewProps {
  matches: Match[];
  teams?: Team[];
  fields?: Field[];
  officials?: UserData[];
  eventStart?: string;
  eventEnd?: string;
  date?: Date;
  view?: View;
  onDateChange?: (date: Date) => void;
  onViewChange?: (view: View) => void;
  onMatchClick?: (match: Match) => void;
  onMatchTimeChange?: (match: Match, range: { start: Date; end: Date; fieldId?: string | null }) => void;
  canManage?: boolean;
  matchCardPaddingY?: string;
  currentUser?: UserData | null;
  childUserIds?: string[];
  onToggleLockAllMatches?: (locked: boolean, matchIds: string[]) => void | Promise<void>;
  lockingAllMatches?: boolean;
  conflictMatchIdsById?: Record<string, string[]>;
  showEventOfficialNames?: boolean;
}

type CalendarLayoutMode = 'calendar' | 'resource';

type CalendarResource = {
  resourceId: string;
  resourceTitle: string;
};

const UNASSIGNED_FIELD_RESOURCE_ID = '__unassigned_field__';
const MIN_VISIBLE_HOUR_SLOTS = 6;
const MIN_HOUR_SLOT_HEIGHT = 112;
const CALENDAR_BOTTOM_GUTTER = 24;
const AGENDA_MATCH_CARD_WIDTH = 420;

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

  return 'TBD Team';
};

const resolveFieldLabel = (field?: Field | null): string | null => {
  if (!field) return null;
  return getFieldDisplayName(field, '') || null;
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
  relatedMatchIds: string[];
  hasTrackedUserMatch: boolean;
  hasConflictMatch: boolean;
  agendaMatches?: Match[];
  isAgendaGroup?: boolean;
};

type WeeklyOccurrenceCalendarMeta = {
  slotId: string;
  occurrenceDate: string;
  label: string;
  divisionLabel?: string | null;
  isSelected?: boolean;
};

const getWeeklyOccurrenceMeta = (match: Match): WeeklyOccurrenceCalendarMeta | null => {
  const raw = (match as Match & { weeklyOccurrenceMeta?: unknown }).weeklyOccurrenceMeta;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<WeeklyOccurrenceCalendarMeta>;
  const slotId = typeof candidate.slotId === 'string' ? candidate.slotId.trim() : '';
  const occurrenceDate = typeof candidate.occurrenceDate === 'string' ? candidate.occurrenceDate.trim() : '';
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  if (!slotId || !occurrenceDate || !label) {
    return null;
  }

  const divisionLabel = typeof candidate.divisionLabel === 'string' && candidate.divisionLabel.trim().length > 0
    ? candidate.divisionLabel.trim()
    : null;

  return {
    slotId,
    occurrenceDate,
    label,
    divisionLabel,
    isSelected: Boolean(candidate.isSelected),
  };
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
  teams = [],
  fields = [],
  officials = [],
  eventStart,
  eventEnd,
  date,
  view,
  onDateChange,
  onViewChange,
  onMatchClick,
  onMatchTimeChange,
  canManage = false,
  matchCardPaddingY = 'my-2',
  currentUser,
  childUserIds = [],
  onToggleLockAllMatches,
  lockingAllMatches = false,
  conflictMatchIdsById = {},
  showEventOfficialNames = true,
}: LeagueCalendarViewProps) {
  const DnDCalendar: any = useMemo(() => withDragAndDrop(BigCalendar), []);
  const userTeamIds = useMemo(() => new Set(currentUser?.teamIds ?? []), [currentUser?.teamIds]);
  const trackedUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (typeof currentUser?.$id === 'string' && currentUser.$id.trim().length > 0) {
      ids.add(currentUser.$id);
    }
    for (const childId of childUserIds) {
      if (typeof childId === 'string' && childId.trim().length > 0) {
        ids.add(childId.trim());
      }
    }
    return ids;
  }, [childUserIds, currentUser?.$id]);
  const hasTrackedUsers = trackedUserIds.size > 0;
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

  const fieldColorReferenceList = useMemo(
    () => buildUniqueColorReferenceList(fields.map((field) => field.$id)),
    [fields],
  );

  const teamLookup = useMemo(() => {
    const lookup = new Map<string, Team>();
    teams.forEach((team) => {
      if (typeof team?.$id === 'string' && team.$id.trim().length > 0) {
        lookup.set(team.$id.trim(), team);
      }
    });
    return lookup;
  }, [teams]);
  const officialLookupById = useMemo(() => {
    const lookup: Record<string, UserData> = {};
    officials.forEach((official) => {
      if (typeof official?.$id === 'string' && official.$id.trim().length > 0) {
        lookup[official.$id.trim()] = official;
      }
    });
    matches.forEach((match) => {
      if (match.official && typeof match.official === 'object' && typeof match.official.$id === 'string') {
        const officialId = match.official.$id.trim();
        if (officialId.length > 0) {
          lookup[officialId] = match.official;
        }
      }
    });
    return lookup;
  }, [matches, officials]);

  const teamHasUser = useCallback(
    (team: Match['team1'], fallbackId?: string | null) => {
      if (!hasTrackedUsers) return false;
      const teamId =
        (team && typeof team === 'object' && '$id' in team && typeof (team as any).$id === 'string'
          ? (team as any).$id
          : undefined) ?? (typeof fallbackId === 'string' ? fallbackId : undefined);

      if (teamId && userTeamIds.has(teamId)) {
        return true;
      }

      const players = (team as any)?.players;
      if (Array.isArray(players) && players.some((player) => typeof player?.$id === 'string' && trackedUserIds.has(player.$id))) {
        return true;
      }

      const playerIds = (team as any)?.playerIds;
      if (Array.isArray(playerIds) && playerIds.some((playerId) => typeof playerId === 'string' && trackedUserIds.has(playerId))) {
        return true;
      }

      const captainId = (team as any)?.captainId ?? (team as any)?.captain?.$id;
      if (typeof captainId === 'string' && trackedUserIds.has(captainId)) {
        return true;
      }

      return false;
    },
    [hasTrackedUsers, trackedUserIds, userTeamIds],
  );

  const matchInvolvesCurrentUser = useCallback(
    (match: Match) => {
      if (!hasTrackedUsers) return false;
      const assignedOfficialUserIds = Array.isArray(match.officialIds)
        ? match.officialIds
            .map((assignment) => (typeof assignment?.userId === 'string' ? assignment.userId.trim() : ''))
            .filter((userId) => userId.length > 0)
        : [];

      if (
        (typeof match.officialId === 'string' && trackedUserIds.has(match.officialId))
        || (typeof match.official?.$id === 'string' && trackedUserIds.has(match.official.$id))
        || assignedOfficialUserIds.some((officialUserId) => trackedUserIds.has(officialUserId))
      ) {
        return true;
      }

      return teamHasUser(match.team1, match.team1Id) || teamHasUser(match.team2, match.team2Id);
    },
    [hasTrackedUsers, teamHasUser, trackedUserIds],
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
      hasTrackedUsers
        ? new Set(
            matches
              .filter((match) => matchInvolvesCurrentUser(match))
              .map((match) => match.$id),
          )
        : new Set<string>(),
    [hasTrackedUsers, matchInvolvesCurrentUser, matches],
  );
  const canShowMyMatchesControl = userInvolvedMatchIds.size > 0;
  const conflictMatchIdSet = useMemo(
    () => new Set(Object.keys(conflictMatchIdsById).filter((matchId) => conflictMatchIdsById[matchId]?.length)),
    [conflictMatchIdsById],
  );
  const allDisplayedLocked = matchesToDisplay.length > 0 && matchesToDisplay.every((match) => Boolean(match.locked));
  const displayedMatchIds = useMemo(
    () => matchesToDisplay.map((match) => match.$id).filter((id) => typeof id === 'string' && id.length > 0),
    [matchesToDisplay],
  );

  useEffect(() => {
    if (!canShowMyMatchesControl && showMyMatchesOnly) {
      setShowMyMatchesOnly(false);
    }
  }, [canShowMyMatchesControl, showMyMatchesOnly]);

  const calendarEvents = useMemo(() => {
    return matchesToDisplay
      .map((match) => {
        const hydratedMatch: Match = {
          ...match,
          team1:
            match.team1 && typeof match.team1 === 'object'
              ? match.team1
              : (typeof match.team1Id === 'string' ? teamLookup.get(match.team1Id) : undefined),
          team2:
            match.team2 && typeof match.team2 === 'object'
              ? match.team2
              : (typeof match.team2Id === 'string' ? teamLookup.get(match.team2Id) : undefined),
          teamOfficial:
            match.teamOfficial && typeof match.teamOfficial === 'object'
              ? match.teamOfficial
              : (typeof match.teamOfficialId === 'string' ? teamLookup.get(match.teamOfficialId) : undefined),
        };
        const start = coerceDateTime(match.start);
        if (!start) return null;
        const end = coerceDateTime(match.end)
          ?? new Date(start.getTime() + 60 * 60 * 1000);
        const fieldId = resolveMatchFieldId(hydratedMatch);
        const fieldLabel = resolveMatchFieldLabel(hydratedMatch, fieldLookup);
        const weeklyOccurrenceMeta = getWeeklyOccurrenceMeta(hydratedMatch);
        const matchId = typeof match.$id === 'string' && match.$id.trim().length > 0
          ? match.$id.trim()
          : `match-${match.matchId}-${start.getTime()}`;
        const hasTrackedUserMatch = userInvolvedMatchIds.has(matchId);
        const hasConflictMatch = conflictMatchIdSet.has(matchId);

        return {
          id: matchId,
          title: weeklyOccurrenceMeta?.label
            ?? `${resolveTeamLabel(hydratedMatch, 'team1')} vs ${resolveTeamLabel(hydratedMatch, 'team2')}`,
          start,
          end,
          allDay: false,
          resourceId: fieldId ?? UNASSIGNED_FIELD_RESOURCE_ID,
          fieldLabel,
          resource: hydratedMatch,
          relatedMatchIds: [matchId],
          hasTrackedUserMatch,
          hasConflictMatch,
        } as CalendarEvent;
      })
      .filter((event): event is CalendarEvent => Boolean(event))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [conflictMatchIdSet, fieldLookup, matchesToDisplay, teamLookup, userInvolvedMatchIds]);

  const agendaCalendarEvents = useMemo<CalendarEvent[]>(() => {
    const grouped = new Map<string, CalendarEvent>();

    calendarEvents.forEach((event) => {
      const key = `${event.start.getTime()}-${event.end.getTime()}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          ...event,
          id: `agenda-${key}`,
          isAgendaGroup: true,
          agendaMatches: [event.resource],
          relatedMatchIds: [...event.relatedMatchIds],
        });
        return;
      }

      grouped.set(key, {
        ...existing,
        agendaMatches: [...(existing.agendaMatches ?? []), event.resource],
        relatedMatchIds: [...existing.relatedMatchIds, ...event.relatedMatchIds],
        hasTrackedUserMatch: existing.hasTrackedUserMatch || event.hasTrackedUserMatch,
        hasConflictMatch: existing.hasConflictMatch || event.hasConflictMatch,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [calendarEvents]);

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
    if (!date) {
      setCalendarDate(initialDate);
    }
  }, [date, initialDate]);

  const handleNavigate = (nextDate: Date) => {
    const resolvedDate = nextDate instanceof Date ? nextDate : new Date(nextDate);
    if (!date) {
      setCalendarDate(resolvedDate);
    }
    onDateChange?.(resolvedDate);
  };

  const handleViewChange = (nextView: View) => {
    if (!view) {
      setCalendarView(nextView);
    }
    onViewChange?.(nextView);
  };

  const handleSelectSlot = ({ start }: SlotInfo) => {
    if (!start) return;
    const resolvedDate = start instanceof Date ? start : new Date(start);
    if (!date) {
      setCalendarDate(resolvedDate);
    }
    onDateChange?.(resolvedDate);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    if (!onMatchClick || event.isAgendaGroup) return;
    onMatchClick(event.resource);
  };

  const handleEventDrop = useCallback(
    ({ event, start, end, resourceId }: any) => {
      if (!canManage || !onMatchTimeChange || !event || event.isAgendaGroup) {
        return;
      }
      if (getWeeklyOccurrenceMeta(event.resource)) {
        return;
      }

      const nextStart = start instanceof Date ? start : new Date(start);
      if (Number.isNaN(nextStart.getTime())) {
        return;
      }
      const rawEnd = end instanceof Date ? end : new Date(end);
      const nextEnd = !Number.isNaN(rawEnd.getTime()) && rawEnd.getTime() > nextStart.getTime()
        ? rawEnd
        : new Date(nextStart.getTime() + 60 * 60 * 1000);
      const dropResourceId =
        typeof resourceId === 'string'
          ? resourceId
          : typeof event.resourceId === 'string'
            ? event.resourceId
            : resolveMatchFieldId(event.resource);
      const fieldId = dropResourceId && dropResourceId !== UNASSIGNED_FIELD_RESOURCE_ID
        ? dropResourceId
        : null;

      onMatchTimeChange(event.resource, {
        start: nextStart,
        end: nextEnd,
        fieldId,
      });
    },
    [canManage, onMatchTimeChange],
  );

  const eventPropGetter = useCallback(
    (event: CalendarEvent) => {
      if (event.isAgendaGroup) {
        return {
          style: {
            backgroundColor: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'default',
            color: 'var(--mantine-color-text, var(--mvp-text))',
          },
          className: 'p-0',
        };
      }
      const weeklyOccurrenceMeta = getWeeklyOccurrenceMeta(event.resource);
      if (weeklyOccurrenceMeta) {
        return {
          style: {
            backgroundColor: 'transparent',
            border: 'none',
            padding: 0,
            cursor: canManage ? 'grab' : onMatchClick ? 'pointer' : 'default',
            color: 'var(--mantine-color-text, var(--mvp-text))',
          },
          className: 'p-0',
        };
      }
      const hasConflict = event.hasConflictMatch;
      return {
        style: {
          backgroundColor: hasConflict
            ? 'var(--mantine-color-red-0, var(--mvp-danger-soft))'
            : 'transparent',
          border: hasConflict
            ? '2px solid var(--mvp-danger)'
            : 'none',
          padding: 0,
          cursor: canManage ? 'grab' : onMatchClick ? 'pointer' : 'default',
          color: 'var(--mantine-color-text, var(--mvp-text))',
        },
        className: 'p-0',
      };
    },
    [canManage, onMatchClick],
  );

  const MonthEventComponent = useCallback(({ event }: EventProps<CalendarEvent>) => {
    const weeklyOccurrenceMeta = getWeeklyOccurrenceMeta(event.resource);
    return (
      <SharedCalendarEvent
        title={event.title}
        subtitle={weeklyOccurrenceMeta?.divisionLabel ?? event.fieldLabel}
        colorSeed={event.id}
        colorReferenceList={fieldColorReferenceList}
        colorMatchKey={event.resourceId}
        compact
        selected={event.hasTrackedUserMatch || Boolean(weeklyOccurrenceMeta?.isSelected)}
        conflict={event.hasConflictMatch}
        draggable={canManage && !weeklyOccurrenceMeta}
      />
    );
  }, [canManage, fieldColorReferenceList]);

  const WeeklyOccurrenceEventCard = useCallback(
    ({
      occurrence,
      fieldLabel,
      fieldColorMatchKey,
      onClick,
      compact = false,
    }: {
      occurrence: WeeklyOccurrenceCalendarMeta;
      fieldLabel: string;
      fieldColorMatchKey: string;
      onClick?: () => void;
      compact?: boolean;
    }) => (
      <SharedCalendarEvent
        title={occurrence.label}
        subtitle={occurrence.divisionLabel ?? fieldLabel}
        meta={occurrence.isSelected ? 'Selected' : fieldLabel}
        colorSeed={`${occurrence.slotId}-${occurrence.label}`}
        colorReferenceList={fieldColorReferenceList}
        colorMatchKey={fieldColorMatchKey}
        compact={compact}
        selected={occurrence.isSelected}
        onClick={onClick}
      />
    ),
    [fieldColorReferenceList],
  );

  const WeekDayEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => {
      const hasConflict = event.hasConflictMatch;
      const shouldHighlightUser = event.hasTrackedUserMatch && !hasConflict;
      const weeklyOccurrenceMeta = getWeeklyOccurrenceMeta(event.resource);
      if (weeklyOccurrenceMeta) {
        return (
          <WeeklyOccurrenceEventCard
            occurrence={weeklyOccurrenceMeta}
            fieldLabel={event.fieldLabel}
            fieldColorMatchKey={event.resourceId}
            onClick={onMatchClick ? () => onMatchClick(event.resource) : undefined}
          />
        );
      }
      return (
        <SharedCalendarEvent
          title={event.title}
          subtitle={event.fieldLabel}
          meta={typeof event.resource.matchId === 'number' ? `Match #${event.resource.matchId}` : undefined}
          colorSeed={event.id}
          colorReferenceList={fieldColorReferenceList}
          colorMatchKey={event.resourceId}
          selected={shouldHighlightUser}
          conflict={hasConflict}
          draggable={canManage}
        />
      );
    },
    [WeeklyOccurrenceEventCard, canManage, fieldColorReferenceList, onMatchClick],
  );

  const AgendaEventComponent = useCallback(
    ({ event }: EventProps<CalendarEvent>) => {
      const agendaMatches = event.agendaMatches?.length ? event.agendaMatches : [event.resource];

      return (
        <div className={`w-full ${matchCardPaddingY}`}>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3 pr-1">
              {agendaMatches.map((match, index) => {
                const matchId = typeof match.$id === 'string' ? match.$id.trim() : '';
                const hasConflict = matchId.length > 0 && conflictMatchIdSet.has(matchId);
                const shouldHighlightUser = matchId.length > 0 && userInvolvedMatchIds.has(matchId) && !hasConflict;
                const weeklyOccurrenceMeta = getWeeklyOccurrenceMeta(match);
                const fieldLabel = resolveMatchFieldLabel(match, fieldLookup);
                const fieldColorMatchKey = resolveMatchFieldId(match) ?? UNASSIGNED_FIELD_RESOURCE_ID;

                return (
                  <div
                    key={matchId || `${event.id}-${index}`}
                    className="shrink-0"
                    style={{ width: `${AGENDA_MATCH_CARD_WIDTH}px`, minWidth: `${AGENDA_MATCH_CARD_WIDTH}px` }}
                  >
                    {weeklyOccurrenceMeta ? (
                      <WeeklyOccurrenceEventCard
                        occurrence={weeklyOccurrenceMeta}
                        fieldLabel={fieldLabel}
                        fieldColorMatchKey={fieldColorMatchKey}
                        onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                        compact
                      />
                    ) : (
                      <SharedCalendarEvent
                        title={`${resolveTeamLabel(match, 'team1')} vs ${resolveTeamLabel(match, 'team2')}`}
                        subtitle={fieldLabel}
                        meta={typeof match.matchId === 'number' ? `Match #${match.matchId}` : undefined}
                        colorSeed={matchId || `${event.id}-${index}`}
                        colorReferenceList={fieldColorReferenceList}
                        colorMatchKey={fieldColorMatchKey}
                        selected={shouldHighlightUser}
                        conflict={hasConflict}
                        onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                        draggable={canManage}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    },
    [WeeklyOccurrenceEventCard, canManage, conflictMatchIdSet, fieldColorReferenceList, fieldLookup, onMatchClick, matchCardPaddingY, userInvolvedMatchIds],
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
  const effectiveCalendarDate = date ?? calendarDate;
  const effectiveCalendarView = useMemo<View>(
    () => (calendarViews.includes(view ?? calendarView) ? (view ?? calendarView) : calendarViews[0]),
    [calendarView, calendarViews, view],
  );
  const displayedCalendarEvents = useMemo<CalendarEvent[]>(
    () => (effectiveCalendarView === 'agenda' ? agendaCalendarEvents : calendarEvents),
    [agendaCalendarEvents, calendarEvents, effectiveCalendarView],
  );
  const showRange = effectiveCalendarView === 'week' || effectiveCalendarView === 'day';
  const calendarRootRef = useRef<HTMLDivElement | null>(null);
  const [calendarHeight, setCalendarHeight] = useState<number>(MIN_CALENDAR_HEIGHT);

  useEffect(() => {
    if (!view && calendarView !== effectiveCalendarView) {
      setCalendarView(effectiveCalendarView);
    }
  }, [calendarView, effectiveCalendarView, view]);

  useEffect(() => {
    if (view && view !== effectiveCalendarView) {
      onViewChange?.(effectiveCalendarView);
    }
  }, [effectiveCalendarView, onViewChange, view]);

  const measureCalendarHeight = useCallback(() => {
    if (typeof window === 'undefined') return;
    const root = calendarRootRef.current;
    if (!root) return;

    const top = root.getBoundingClientRect().top;
    const availableHeight = Math.floor(window.innerHeight - top - CALENDAR_BOTTOM_GUTTER);
    const nextHeight = Math.max(MIN_CALENDAR_HEIGHT, availableHeight);
    setCalendarHeight((previous) => (previous === nextHeight ? previous : nextHeight));
  }, []);

  useEffect(() => {
    measureCalendarHeight();
  }, [measureCalendarHeight, showRange, layoutMode, effectiveCalendarView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', measureCalendarHeight);
    window.addEventListener('orientationchange', measureCalendarHeight);

    return () => {
      window.removeEventListener('resize', measureCalendarHeight);
      window.removeEventListener('orientationchange', measureCalendarHeight);
    };
  }, [measureCalendarHeight]);

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
      <Paper
        withBorder
        radius="md"
        p="lg"
        className="shared-calendar-shell"
        style={{ width: '100%' }}
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
          <div className="flex flex-wrap items-center gap-2">
            {canShowMyMatchesControl && (
              <Button
                size="sm"
                variant={showMyMatchesOnly ? 'filled' : 'light'}
                color="green"
                onClick={() => setShowMyMatchesOnly((prev) => !prev)}
              >
                {showMyMatchesOnly ? 'Showing My Matches' : 'Show Only My Matches'}
              </Button>
            )}
            {canManage && onToggleLockAllMatches && displayedMatchIds.length > 0 && (
              <Button
                size="sm"
                variant={allDisplayedLocked ? 'filled' : 'light'}
                color={allDisplayedLocked ? 'red' : 'yellow'}
                loading={lockingAllMatches}
                onClick={() => {
                  void onToggleLockAllMatches(!allDisplayedLocked, displayedMatchIds);
                }}
              >
                {allDisplayedLocked ? 'Unlock All Matches' : 'Lock All Matches'}
              </Button>
            )}
          </div>
        </div>
        {showRange && (
          <div className="mb-6">
            <Text size="sm" fw={600} mb={8}>
              Visible hours: {formatHourLabel(timeRange[0])} - {formatHourLabel(timeRange[1])}
            </Text>
            <div className="px-2 sm:px-3">
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
          </div>
        )}
        <div ref={calendarRootRef} style={{ width: '100%' }}>
          <DnDCalendar
            localizer={localizer}
            events={displayedCalendarEvents}
            resources={layoutMode === 'resource' ? calendarResources : undefined}
            date={effectiveCalendarDate}
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
            style={{ height: calendarHeight, minHeight: MIN_CALENDAR_HEIGHT }}
            slotGroupPropGetter={slotGroupPropGetter}
            formats={calendarFormats}
            draggableAccessor={(event: CalendarEvent) => (
              canManage
              && !event.isAgendaGroup
              && !getWeeklyOccurrenceMeta(event.resource)
            )}
            onEventDrop={handleEventDrop}
          />
        </div>
      </Paper>
    </>
  );
}

export default LeagueCalendarView;

