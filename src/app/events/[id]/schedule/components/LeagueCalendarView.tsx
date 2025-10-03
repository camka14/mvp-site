import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Calendar } from '@mantine/dates';
import { Badge, Box, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { format } from 'date-fns';

import type { Match } from '@/types';

interface LeagueCalendarViewProps {
  matches: Match[];
  eventStart?: string;
  eventEnd?: string;
  fieldLookup: Map<string, string>;
  getTeamLabel: (match: Match, key: 'team1' | 'team2') => string;
  formatDateTime: (value: string, timeZone?: string) => string;
}

const normalizeToDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (value && typeof value === 'object' && 'date' in (value as Record<string, unknown>)) {
    const candidate = (value as Record<string, unknown>).date as unknown;
    if (candidate instanceof Date) {
      return candidate;
    }
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return new Date(NaN);
};

const dateKey = (value: Date) => format(value, 'yyyy-MM-dd');

const parseKeyToDate = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

export function LeagueCalendarView({
  matches,
  eventStart,
  eventEnd,
  fieldLookup,
  getTeamLabel,
  formatDateTime,
}: LeagueCalendarViewProps) {
  const matchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    matches.forEach((match) => {
      const start = new Date(match.start);
      if (Number.isNaN(start.getTime())) return;
      const key = format(start, 'yyyy-MM-dd');
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(match);
    });

    map.forEach((dayMatches, key) => {
      map.set(
        key,
        dayMatches.slice().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      );
    });

    return map;
  }, [matches]);

  const firstMatchKey = useMemo(() => {
    const keys = Array.from(matchesByDate.keys()).sort();
    return keys[0] ?? null;
  }, [matchesByDate]);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(firstMatchKey);

  useEffect(() => {
    setSelectedDateKey(firstMatchKey);
  }, [firstMatchKey]);

  const selectedMatches = useMemo(() => {
    if (!selectedDateKey) return [];
    return matchesByDate.get(selectedDateKey) ?? [];
  }, [matchesByDate, selectedDateKey]);

  const matchRange = useMemo(() => {
    if (!matches.length) return null;
    const validStarts = matches
      .map((match) => new Date(match.start))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (!validStarts.length) return null;
    const min = new Date(Math.min(...validStarts.map((date) => date.getTime())));
    const max = new Date(Math.max(...validStarts.map((date) => date.getTime())));
    return { min, max };
  }, [matches]);

  const minDate = useMemo(() => {
    const eventStartDate = eventStart ? new Date(eventStart) : null;
    const matchMin = matchRange?.min ?? null;
    if (eventStartDate && !Number.isNaN(eventStartDate.getTime()) && matchMin) {
      return matchMin.getTime() < eventStartDate.getTime() ? matchMin : eventStartDate;
    }
    if (eventStartDate && !Number.isNaN(eventStartDate.getTime())) {
      return eventStartDate;
    }
    return matchMin ?? undefined;
  }, [eventStart, matchRange]);

  const maxDate = useMemo(() => {
    const eventEndDate = eventEnd ? new Date(eventEnd) : null;
    const matchMax = matchRange?.max ?? null;
    const candidates = [eventEndDate, matchMax].filter(
      (date): date is Date => !!date && !Number.isNaN(date.getTime()),
    );
    if (!candidates.length) return undefined;
    const latest = new Date(Math.max(...candidates.map((date) => date.getTime())));
    latest.setHours(23, 59, 59, 999);
    return latest;
  }, [eventEnd, matchRange]);

  const selectedDate = selectedDateKey ? parseKeyToDate(selectedDateKey) : null;

  const calendarContainerRef = useRef<HTMLDivElement | null>(null);
  const [calendarHeight, setCalendarHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = calendarContainerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextHeight = entry.contentRect.height;
      setCalendarHeight((prev) => (Math.abs((prev ?? 0) - nextHeight) > 1 ? nextHeight : prev));
    });

    observer.observe(element);
    setCalendarHeight(element.getBoundingClientRect().height);

    return () => {
      observer.disconnect();
    };
  }, []);

  const matchPanelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: calendarHeight ? `${calendarHeight}px` : '100%',
    maxHeight: calendarHeight ? `${calendarHeight}px` : undefined,
    overflow: 'hidden',
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start" style={{ width: '100%' }}>
      <Paper
        withBorder
        radius="md"
        p="lg"
        ref={calendarContainerRef}
        className="w-full lg:flex-1"
        style={{ flex: '1 1 0%', minWidth: 0, maxWidth: '100%' }}
      >
        <Calendar
          data-testid="league-calendar"
          date={selectedDate ?? undefined}
          onDateChange={(value) => {
            if (!value) {
              setSelectedDateKey(null);
              return;
            }
            const candidate = Array.isArray(value) ? value[0] : value;
            const nextDate = normalizeToDate(candidate);
            if (Number.isNaN(nextDate.getTime())) {
              setSelectedDateKey(null);
              return;
            }
            setSelectedDateKey(dateKey(nextDate));
          }}
          minDate={minDate}
          maxDate={maxDate}
          size="xl"
          hideOutsideDates
          renderDay={(dayValue) => {
            const day = normalizeToDate(dayValue);

            if (Number.isNaN(day.getTime())) {
              return (
                <Box style={{ padding: '0.3rem', minHeight: 60 }}>
                  <Text size="sm" c="dimmed">
                    •
                  </Text>
                </Box>
              );
            }

            const key = dateKey(day);
            const dayMatches = matchesByDate.get(key) ?? [];
            const isSelected = selectedDateKey === key;
            const hasMatches = dayMatches.length > 0;

            return (
              <Box
                onClick={() => setSelectedDateKey(key)}
                data-selected={isSelected || undefined}
                data-has-matches={hasMatches || undefined}
                style={{
                  cursor: 'pointer',
                  borderRadius: '0.5rem',
                  padding: '0.35rem 0.45rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  backgroundColor: isSelected
                    ? 'var(--mantine-color-blue-light)'
                    : hasMatches
                      ? 'var(--mantine-color-blue-0)'
                      : undefined,
                  border: isSelected ? '1px solid var(--mantine-color-blue-6)' : '1px solid transparent',
                  transition: 'background-color 120ms ease, border-color 120ms ease',
                }}
              >
                <Text fw={600} size="sm">
                  {day.getDate()}
                </Text>
                <Text size="xs" c="dimmed">
                  {hasMatches ? dayMatches.length : ' '}
                </Text>
              </Box>
            );
          }}
        />
      </Paper>

      <Paper
        withBorder
        radius="md"
        p="lg"
        className="w-full lg:flex-1"
        style={{ ...matchPanelStyle, flex: '1 1 0%', minWidth: 0, maxWidth: '100%' }}
      >
        {!selectedDateKey ? (
          <Text c="dimmed" ta="center" style={{ margin: 'auto 0' }}>
            Select a date to view matches.
          </Text>
        ) : (
          <Stack gap="sm" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Group justify="space-between" align="center">
              <Text fw={600} size="lg">
                {parseKeyToDate(selectedDateKey).toLocaleDateString()}
              </Text>
              <Badge variant="light" color="blue">
                {selectedMatches.length} match{selectedMatches.length === 1 ? '' : 'es'}
              </Badge>
            </Group>

            <ScrollArea style={{ flex: 1, height: '100%' }} type="auto">
              <Stack gap="sm" pb="xs" style={{ minHeight: 0 }}>
                {selectedMatches.length === 0 ? (
                  <Text c="dimmed" ta="center">
                    No matches scheduled for this date.
                  </Text>
                ) : (
                  selectedMatches.map((match) => (
                    <Paper key={match.$id} withBorder radius="md" p="md" shadow="xs">
                      <Stack gap={4}>
                        <Group justify="space-between" wrap="wrap">
                          <Group gap="sm">
                            <Text fw={600}>{formatDateTime(match.start, match.timezone)}</Text>
                            {match.matchType === 'playoff' && (
                              <Badge color="grape" variant="light" size="sm">
                                Playoff
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm" c="dimmed">
                            Ends {formatDateTime(match.end, match.timezone)}
                          </Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {match.field?.name}
                        </Text>
                        <Group gap="sm" align="center">
                          <Text fw={600}>{getTeamLabel(match, 'team1')}</Text>
                          <Text c="dimmed">vs</Text>
                          <Text fw={600}>{getTeamLabel(match, 'team2')}</Text>
                        </Group>
                      </Stack>
                    </Paper>
                  ))
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Paper>
    </div>
  );
}

export default LeagueCalendarView;
