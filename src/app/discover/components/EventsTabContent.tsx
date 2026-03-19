'use client';

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Group,
  Loader,
  Paper,
  Select,
  Slider,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { ArrowUpDown, CalendarDays, Search, X } from 'lucide-react';

import EventCard from '@/components/ui/EventCard';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import LocationSearch from '@/components/location/LocationSearch';
import Loading from '@/components/ui/Loading';
import { Event } from '@/types';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';

const EVENT_SORT_OPTIONS = [
  { value: 'soonest', label: 'Soonest' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'popular', label: 'Most popular' },
  { value: 'alpha', label: 'A to Z' },
] as const;

const KM_PER_MILE = 1.60934;
const DISTANCE_SLIDER_MIN_MILES = 10;
const DISTANCE_SLIDER_MAX_MILES = 100;
const DISTANCE_SLIDER_MARKS = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 75, label: '75' },
  { value: DISTANCE_SLIDER_MAX_MILES, label: String(DISTANCE_SLIDER_MAX_MILES) },
];

const kmToMiles = (value: number): number => value / KM_PER_MILE;
const milesToKm = (value: number): number => value * KM_PER_MILE;
const clampMiles = (value: number): number =>
  Math.min(DISTANCE_SLIDER_MAX_MILES, Math.max(DISTANCE_SLIDER_MIN_MILES, Math.round(value)));

type EventsTabContentProps = {
  location: { lat: number; lng: number } | null;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedEventTypes: Event['eventType'][];
  setSelectedEventTypes: (value: Event['eventType'][]) => void;
  eventTypeOptions: readonly Event['eventType'][];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  selectedStartDate: Date | null;
  setSelectedStartDate: (value: Date | null) => void;
  selectedEndDate: Date | null;
  setSelectedEndDate: (value: Date | null) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  defaultMaxDistance: number;
  kmBetween: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  events: Event[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  eventsError: string | null;
  onEventClick: (event: Event) => void;
  onCreateEvent: () => void;
  showCreateEventButton?: boolean;
  hideWeeklyChildren?: boolean;
  setHideWeeklyChildren?: (value: boolean) => void;
};

export default function EventsTabContent(props: EventsTabContentProps) {
  const {
    location,
    searchTerm,
    setSearchTerm,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    selectedSports,
    setSelectedSports,
    maxDistance,
    setMaxDistance,
    selectedStartDate,
    setSelectedStartDate,
    selectedEndDate,
    setSelectedEndDate,
    sports,
    sportsLoading,
    sportsError,
    defaultMaxDistance,
    kmBetween,
    events,
    isLoadingInitial,
    isLoadingMore,
    hasMoreEvents,
    sentinelRef,
    eventsError,
    onEventClick,
    onCreateEvent,
    showCreateEventButton = true,
    hideWeeklyChildren = false,
    setHideWeeklyChildren,
  } = props;

  const [eventSort, setEventSort] = useState<(typeof EVENT_SORT_OPTIONS)[number]['value']>('soonest');
  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const allEventTypesSelected = selectedEventTypes.length === eventTypeOptions.length;
  const allSportsSelected = selectedSports.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();

  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);

  const resetFilters = useCallback(() => {
    setSelectedEventTypes([...eventTypeOptions]);
    setSelectedSports([]);
    setMaxDistance(null);
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setSearchTerm('');
  }, [
    eventTypeOptions,
    setMaxDistance,
    setSearchTerm,
    setSelectedStartDate,
    setSelectedEndDate,
    setSelectedEventTypes,
    setSelectedSports,
  ]);

  const parsePickerDate = useCallback((value: unknown): Date | null => {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }, []);

  const getEventDistanceKm = useCallback((event: Event) => {
    if (!location || !Array.isArray(event.coordinates) || event.coordinates.length < 2) {
      return undefined;
    }
    const [lng, lat] = event.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    try {
      return kmBetween(location, { lat, lng });
    } catch {
      return undefined;
    }
  }, [kmBetween, location]);

  const sortedEvents = useMemo(() => {
    const sourceEvents = hideWeeklyChildren
      ? events.filter((event) => !(event.eventType === 'WEEKLY_EVENT' && typeof event.parentEvent === 'string' && event.parentEvent.trim().length > 0))
      : events;
    const sorted = [...sourceEvents];

    const compareByStart = (a: Event, b: Event) => {
      const aTime = new Date(a.start).getTime();
      const bTime = new Date(b.start).getTime();
      return aTime - bTime;
    };

    switch (eventSort) {
      case 'nearest':
        sorted.sort((a, b) => {
          const aDistance = getEventDistanceKm(a);
          const bDistance = getEventDistanceKm(b);
          if (typeof aDistance === 'number' && typeof bDistance === 'number') {
            return aDistance - bDistance;
          }
          if (typeof aDistance === 'number') return -1;
          if (typeof bDistance === 'number') return 1;
          return compareByStart(a, b);
        });
        break;
      case 'price-low':
        sorted.sort((a, b) => a.price - b.price || compareByStart(a, b));
        break;
      case 'popular':
        sorted.sort((a, b) => b.attendees - a.attendees || compareByStart(a, b));
        break;
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'soonest':
      default:
        sorted.sort(compareByStart);
        break;
    }

    return sorted;
  }, [eventSort, events, getEventDistanceKm, hideWeeklyChildren]);

  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  if (!allEventTypesSelected) {
    selectedEventTypes.forEach((type) => {
      activeFilters.push({
        key: `event-type-${type}`,
        label: formatEnumDisplayLabel(type, 'Event'),
        onRemove: () => setSelectedEventTypes(selectedEventTypes.filter((value) => value !== type)),
      });
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  if (selectedStartDate) {
    activeFilters.push({
      key: 'date-from',
      label: `From ${selectedStartDate.toLocaleDateString()}`,
      onRemove: () => setSelectedStartDate(null),
    });
  }

  if (selectedEndDate) {
    activeFilters.push({
      key: 'date-to',
      label: `Until ${selectedEndDate.toLocaleDateString()}`,
      onRemove: () => setSelectedEndDate(null),
    });
  }

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${Math.round(kmToMiles(maxDistance))} mi`,
      onRemove: () => setMaxDistance(null),
    });
  }

  if (hideWeeklyChildren && setHideWeeklyChildren) {
    activeFilters.push({
      key: 'hide-weekly-children',
      label: 'Hide weekly sessions',
      onRemove: () => setHideWeeklyChildren(false),
    });
  }

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
          Event Type
        </Text>
        <Group gap="xs">
          <Chip
            radius="xl"
            checked={allEventTypesSelected}
            onChange={(checked) => setSelectedEventTypes(checked ? [...eventTypeOptions] : [])}
          >
            All
          </Chip>
          {eventTypeOptions.map((type) => (
            <Chip
              key={type}
              radius="xl"
              checked={selectedEventTypes.includes(type)}
              onChange={(checked) => {
                if (checked) {
                  const next = new Set(selectedEventTypes);
                  next.add(type);
                  setSelectedEventTypes(eventTypeOptions.filter((option) => next.has(option)));
                } else {
                  setSelectedEventTypes(selectedEventTypes.filter((value) => value !== type));
                }
              }}
            >
              {formatEnumDisplayLabel(type, 'Event')}
            </Chip>
          ))}
        </Group>
      </div>

      <div>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
          Sports
        </Text>
        <TextInput
          value={sportSearchTerm}
          onChange={(event) => setSportSearchTerm(event.currentTarget.value)}
          placeholder="Search sport..."
          mb="sm"
        />
        <Group gap="xs" align="center">
          <Chip
            radius="xl"
            checked={allSportsSelected}
            disabled={sportsLoading || !sports.length}
            onChange={(checked) => {
              if (checked) {
                setSelectedSports([]);
              }
            }}
          >
            All
          </Chip>
          {sportsLoading ? (
            <Loader size="sm" aria-label="Loading sports" />
          ) : visibleSports.length ? (
            visibleSports.map((sport) => (
              <Chip
                key={sport}
                radius="xl"
                checked={selectedSports.includes(sport)}
                onChange={(checked) => {
                  setSelectedSports((current) => {
                    if (checked) {
                      const next = new Set(current);
                      next.add(sport);
                      return Array.from(next);
                    }
                    return current.filter((value) => value !== sport);
                  });
                }}
              >
                {sport}
              </Chip>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              {sportsQuery ? 'No sports match this search.' : 'No sports available.'}
            </Text>
          )}
        </Group>
        {sportsError && (
          <Alert color="red" radius="md" mt="sm">
            {sportsError}
          </Alert>
        )}
      </div>

      <div>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
          Date Range
        </Text>
        <div className="grid gap-2">
          <DatePickerInput
            value={selectedStartDate}
            onChange={(value) => setSelectedStartDate(parsePickerDate(value))}
            clearable
            leftSection={<CalendarDays size={16} />}
            placeholder="From today (default)"
            aria-label="Filter by start date"
            valueFormat="MMM D, YYYY"
            highlightToday
          />
          <DatePickerInput
            value={selectedEndDate}
            onChange={(value) => setSelectedEndDate(parsePickerDate(value))}
            clearable
            leftSection={<CalendarDays size={16} />}
            minDate={
              selectedStartDate
                ? new Date(
                    selectedStartDate.getFullYear(),
                    selectedStartDate.getMonth(),
                    selectedStartDate.getDate(),
                    0,
                    0,
                    0,
                    0,
                  )
                : undefined
            }
            placeholder="No max date"
            aria-label="Filter by end date"
            valueFormat="MMM D, YYYY"
            highlightToday
          />
        </div>
      </div>

      {setHideWeeklyChildren && (
        <div>
          <Checkbox
            checked={hideWeeklyChildren}
            onChange={(event) => setHideWeeklyChildren(event.currentTarget.checked)}
            label="Hide weekly child sessions"
          />
        </div>
      )}

      {location && (
        <div>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
            Distance
          </Text>
          <Text size="sm" fw={600} mb={6}>
            {typeof maxDistance === 'number' ? `Within ${Math.round(kmToMiles(maxDistance))} mi` : 'Any distance'}
          </Text>
          <Slider
            min={DISTANCE_SLIDER_MIN_MILES}
            max={DISTANCE_SLIDER_MAX_MILES}
            step={1}
            value={clampMiles(typeof maxDistance === 'number' ? kmToMiles(maxDistance) : kmToMiles(defaultMaxDistance))}
            onChange={(value) => setMaxDistance(milesToKm(value))}
            marks={DISTANCE_SLIDER_MARKS}
            mb="sm"
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-6 mb-8">
        <Group justify="space-between" align="center" gap="md" wrap="wrap">
          <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
            <TextInput
              aria-label="Search events"
              leftSection={<Search size={16} />}
              placeholder="Search events, venues, teams..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <div style={{ minWidth: 190, flexShrink: 0 }}>
              <LocationSearch />
            </div>
          </Group>
          {showCreateEventButton && (
            <Button size="md" onClick={onCreateEvent}>
              Create event
            </Button>
          )}
        </Group>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper
            withBorder
            p={0}
            radius="lg"
            className="h-full overflow-hidden"
          >
            <div className="discover-filter-panel h-full overflow-y-auto p-4">
              <Group justify="space-between" align="center" mb="md">
                <Text fw={700} size="sm">
                  Filters
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                  Reset
                </Button>
              </Group>
              {filterPanel}
            </div>
          </Paper>
        </aside>

        <div className="space-y-4">
          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
            <Text size="sm" c="dimmed">
              {sortedEvents.length} event{sortedEvents.length === 1 ? '' : 's'}
              {location ? ' near you' : ''}.
            </Text>
            <Select
              aria-label="Sort events"
              data={EVENT_SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={eventSort}
              onChange={(value) => setEventSort((value as (typeof EVENT_SORT_OPTIONS)[number]['value']) ?? 'soonest')}
              leftSection={<ArrowUpDown size={14} />}
              style={{ minWidth: 220 }}
            />
          </Group>

          {activeFilters.length > 0 && (
            <Paper withBorder p="sm" radius="lg" className="discover-active-filters">
              <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
                <Group gap="xs" align="center">
                  <Text fw={600} size="sm" c="dimmed">
                    Active filters
                  </Text>
                  {activeFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className="discover-active-filter-chip"
                      onClick={filter.onRemove}
                    >
                      <span>{filter.label}</span>
                      <X size={12} />
                    </button>
                  ))}
                </Group>
                <Button variant="subtle" size="compact-sm" onClick={resetFilters}>
                  Clear all
                </Button>
              </Group>
            </Paper>
          )}

          {eventsError && (
            <Alert color="red">
              {eventsError}
            </Alert>
          )}

          {isLoadingInitial ? (
            <Loading text="Loading events..." />
          ) : sortedEvents.length === 0 ? (
            <Paper withBorder p="xl" radius="lg">
              <Text fw={700} mb={6}>
                No events match your filters
              </Text>
              <Text size="sm" c="dimmed" mb={12}>
                Try increasing distance, removing a sport filter, or clearing all filters.
              </Text>
              <Button variant="default" onClick={resetFilters}>
                Clear filters
              </Button>
            </Paper>
          ) : (
            <>
              <ResponsiveCardGrid>
                {sortedEvents.map((event) => (
                  <EventCard
                    key={event.$id}
                    event={event}
                    showDistance={Boolean(location)}
                    userLocation={location}
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </ResponsiveCardGrid>
              <div ref={sentinelRef} style={{ height: 1 }} />
              {isLoadingMore && (
                <Group justify="center" mt="lg">
                  <Loader />
                </Group>
              )}
              {!hasMoreEvents && (
                <Text size="sm" c="dimmed" ta="center" mt="lg">
                  You’ve reached the end of the results.
                </Text>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
