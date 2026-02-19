'use client';

import { Dispatch, SetStateAction, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Chip,
  Container,
  Drawer,
  Group,
  Loader,
  Paper,
  RangeSlider,
  Select,
  SimpleGrid,
  Slider,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';

import { ArrowUpDown, CalendarDays, Filter, Search, X } from 'lucide-react';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import EventCard from '@/components/ui/EventCard';
import OrganizationCard from '@/components/ui/OrganizationCard';
import EventDetailSheet from './components/EventDetailSheet';
import LocationSearch from '@/components/location/LocationSearch';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import { Event, Field, Organization, TimeSlot } from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { getNextRentalOccurrence, weekdayLabel } from './utils/rentals';
import { useSports } from '@/app/hooks/useSports';
import { createId } from '@/lib/id';
import { formatDisplayTime } from '@/lib/dateUtils';

type RentalListing = {
  organization: Organization;
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

type OrganizationResult = {
  organization: Organization;
  distanceKm?: number;
  relevance: number;
};

const EVENTS_LIMIT = 18;
const DEFAULT_MAX_DISTANCE = 50;

const EVENT_SORT_OPTIONS = [
  { value: 'soonest', label: 'Soonest' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'price-low', label: 'Price (Low to High)' },
  { value: 'popular', label: 'Most popular' },
  { value: 'alpha', label: 'A to Z' },
] as const;

export default function DiscoverPage() {
  return (
    <Suspense fallback={<Loading text="Loading discover feed..." />}>
      <DiscoverPageContent />
    </Suspense>
  );
}

function DiscoverPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const { location, requestLocation } = useLocation();

  const [activeTab, setActiveTab] = useState<'events' | 'rentals' | 'organizations'>('events');

  /**
   * Events tab state
   */
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const EVENT_TYPE_OPTIONS = useMemo(() => ['EVENT', 'TOURNAMENT', 'LEAGUE'] as const, []);
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<(typeof EVENT_TYPE_OPTIONS)[number][]>(['EVENT', 'TOURNAMENT', 'LEAGUE']);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const searchQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventSheet, setShowEventSheet] = useState(false);

  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const sportOptions = useMemo(() => sports.map((sport) => sport.name), [sports]);

  /**
   * Rentals tab state
   */
  const [rentalOrganizations, setRentalOrganizations] = useState<Organization[]>([]);
  const [rentalsLoaded, setRentalsLoaded] = useState(false);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number]>([8, 22]);

  /**
   * Organizations tab state
   */
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);

  /**
   * Helpers
   */
  const kmBetween = useCallback((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const c = 2 * Math.asin(
      Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
    );
    return R * c;
  }, []);

  const getOrgCoordinates = useCallback((org: Organization) => {
    if (Array.isArray(org.coordinates) && org.coordinates.length >= 2) {
      const [lng, lat] = org.coordinates;
      const latNum = typeof lat === 'number' ? lat : Number(lat);
      const lngNum = typeof lng === 'number' ? lng : Number(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        return { lat: latNum, lng: lngNum };
      }
    }
    const latRaw = (org as any).lat ?? (org as any).latitude;
    const lngRaw = (org as any).long ?? (org as any).longitude ?? (org as any).lng;
    const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }, []);

  /**
   * Keep URL in sync with search
   */
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) {
      params.set('q', debouncedSearch);
    } else {
      params.delete('q');
    }
    router.push(`/discover?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) =>
      current.filter((sport) => sportOptions.includes(sport))
    );
  }, [sportOptions, sportsLoading]);

  const buildEventFilters = useCallback(
    () => {
      const normalizedQuery = debouncedSearch.trim();
      const hasDate = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime());
      const dateFrom = hasDate
        ? new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            0,
            0,
            0,
            0,
          ).toISOString()
        : undefined;
      const dateTo = hasDate
        ? new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            23,
            59,
            59,
            999,
          ).toISOString()
        : undefined;

      return {
        eventTypes: selectedEventTypes.length === EVENT_TYPE_OPTIONS.length ? undefined : selectedEventTypes,
        sports: selectedSports.length > 0 ? selectedSports : undefined,
        userLocation: location || undefined,
        maxDistance: location && typeof maxDistance === 'number' ? maxDistance : undefined,
        dateFrom,
        dateTo,
        query: normalizedQuery || undefined,
      };
    },
    [selectedEventTypes, selectedSports, location, maxDistance, debouncedSearch, selectedDate, EVENT_TYPE_OPTIONS],
  );

  const loadFirstPage = useCallback(async () => {
    setIsLoadingInitial(true);
    setIsLoadingMore(false);
    setEventsError(null);
    setEventOffset(0);
    setHasMoreEvents(true);
    try {
      const filters = buildEventFilters();
      const page = await eventService.getEventsPaginated(filters, EVENTS_LIMIT, 0);

      setEvents(page);
      setEventOffset(page.length);
      setHasMoreEvents(page.length === EVENTS_LIMIT);
    } catch (error) {
      console.error('Failed to load events:', error);
      setEventsError('Failed to load events. Please try again.');
    } finally {
      setIsLoadingInitial(false);
    }
  }, [buildEventFilters]);

  const loadMoreEvents = useCallback(async () => {
    if (isLoadingInitial || isLoadingMore || !hasMoreEvents) return;
    setIsLoadingMore(true);
    setEventsError(null);
    try {
      const filters = buildEventFilters();
      const page = await eventService.getEventsPaginated(filters, EVENTS_LIMIT, eventOffset);
      setEvents((prev) => {
        const merged = [...prev, ...page];
        const seen = new Set<string>();
        return merged.filter((event) => {
          if (seen.has(event.$id)) return false;
          seen.add(event.$id);
          return true;
        });
      });
      setEventOffset((prev) => prev + page.length);
      setHasMoreEvents(page.length === EVENTS_LIMIT);
    } catch (error) {
      console.error('Failed to load more events:', error);
      setEventsError('Failed to load more events. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildEventFilters, eventOffset, isLoadingInitial, isLoadingMore, hasMoreEvents]);

  /**
   * Rentals fetching
   */
  const loadRentals = useCallback(async () => {
    if (rentalsLoaded || rentalsLoading) return;
    setRentalsLoading(true);
    setRentalsError(null);
    try {
      const organizations = await organizationService.listOrganizationsWithFields();
      setRentalOrganizations(organizations);
      setRentalsLoaded(true);
    } catch (error) {
      console.error('Failed to load rentals:', error);
      setRentalsError('Failed to load rentals. Please try again.');
    } finally {
      setRentalsLoading(false);
    }
  }, [rentalsLoaded, rentalsLoading]);

  /**
   * Organizations fetching
   */
  const loadOrganizations = useCallback(async () => {
    if (organizationsLoaded || organizationsLoading) return;
    setOrganizationsLoading(true);
    setOrganizationsError(null);
    try {
      const orgs = await organizationService.listOrganizationsWithFields();
      setOrganizations(orgs);
      setOrganizationsLoaded(true);
    } catch (error) {
      console.error('Failed to load organizations:', error);
      setOrganizationsError('Failed to load organizations. Please try again.');
    } finally {
      setOrganizationsLoading(false);
    }
  }, [organizationsLoaded, organizationsLoading]);

  /**
   * Effects
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
      router.push('/login');
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
      return;
    }
    if (activeTab !== 'events') {
      return;
    }
    loadFirstPage();
  }, [isAuthenticated, authLoading, activeTab, loadFirstPage]);

  useEffect(() => {
    let requested = false;
    if (!location && typeof window !== 'undefined' && !requested) {
      requested = true;
      requestLocation().catch(() => {});
    }
  }, [location, requestLocation]);

  useEffect(() => {
    if (activeTab === 'rentals') {
      loadRentals();
    }
    if (activeTab === 'organizations') {
      loadOrganizations();
    }
  }, [activeTab, loadOrganizations, loadRentals]);

  const handleCreateEventNavigation = useCallback(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    const newId = createId();
    const params = new URLSearchParams({
      create: '1',
      mode: 'edit',
      tab: 'details',
    });
    router.push(`/events/${newId}/schedule?${params.toString()}`);
  }, [router, user]);

  const handleSelectRentalOrganization = useCallback(
    (organization: Organization) => {
      router.push(`/organizations/${organization.$id}?tab=fields`);
    },
    [router],
  );

  const handleSelectOrganization = useCallback(
    (organization: Organization) => {
      router.push(`/organizations/${organization.$id}`);
    },
    [router],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMoreEvents();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreEvents]);

  /**
   * Rentals derived data
   */
  const rentalListings = useMemo(() => {
    const referenceDate = new Date();
    const listings: RentalListing[] = [];

    rentalOrganizations.forEach((organization) => {
      const orgLat =
        typeof (organization as any).lat === 'number'
          ? (organization as any).lat
          : Number((organization as any).lat ?? 0);
      const orgLong =
        typeof (organization as any).long === 'number'
          ? (organization as any).long
          : Number((organization as any).long ?? 0);

      (organization.fields || []).forEach((field) => {
        (field.rentalSlots || []).forEach((slot) => {
          const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
          if (!nextOccurrence) {
            return;
          }
          const listing: RentalListing = {
            organization,
            field,
            slot,
            nextOccurrence,
          };

          if (location && Number.isFinite(orgLat) && Number.isFinite(orgLong)) {
            try {
              listing.distanceKm = kmBetween(location, { lat: orgLat, lng: orgLong });
            } catch {
              // ignore distance issues
            }
          }

          listings.push(listing);
        });
      });
    });

    listings.sort((a, b) => {
      if (typeof a.distanceKm === 'number' && typeof b.distanceKm === 'number') {
        return a.distanceKm - b.distanceKm;
      }
      if (typeof a.distanceKm === 'number') return -1;
      if (typeof b.distanceKm === 'number') return 1;
      return a.nextOccurrence.getTime() - b.nextOccurrence.getTime();
    });

    return listings;
  }, [rentalOrganizations, location, kmBetween]);

  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!rentalListings.length) {
      return [8, 22];
    }
    let earliest = 24;
    let latest = 0;
    rentalListings.forEach((listing) => {
      const startHour =
        listing.nextOccurrence.getHours() + listing.nextOccurrence.getMinutes() / 60;
      const endMinutes =
        typeof listing.slot.endTimeMinutes === 'number'
          ? listing.slot.endTimeMinutes
          : listing.slot.startTimeMinutes ?? listing.nextOccurrence.getHours() * 60;
      const endHour = Math.floor(endMinutes / 60);
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
  }, [rentalListings]);

  useEffect(() => {
    setTimeRange(defaultTimeRange);
  }, [defaultTimeRange]);

  /**
   * Organizations derived data
   */
  const organizationResults = useMemo<OrganizationResult[]>(() => {
    const q = (searchTerm || '').trim().toLowerCase();
    const results: OrganizationResult[] = [];

    organizations.forEach((org) => {
      const coords = getOrgCoordinates(org);
      const hasCoords = Boolean(coords);
      const text = `${org.name} ${org.description ?? ''} ${org.location ?? ''} ${org.website ?? ''}`.toLowerCase();
      const matchesQuery = q ? text.includes(q) : true;

      if (!q && !hasCoords) {
        return;
      }
      if (q && !matchesQuery) {
        return;
      }

      let distanceKm: number | undefined;
      if (coords && location) {
        try {
          distanceKm = kmBetween(location, coords);
        } catch {
          distanceKm = undefined;
        }
      }
      const relevance = q && matchesQuery ? Math.max(0, text.indexOf(q)) : Number.MAX_SAFE_INTEGER;

      results.push({ organization: org, distanceKm, relevance });
    });

    results.sort((a, b) => {
      const aDist = a.distanceKm;
      const bDist = b.distanceKm;
      if (typeof aDist === 'number' && typeof bDist === 'number') {
        return aDist - bDist;
      }
      if (typeof aDist === 'number') return -1;
      if (typeof bDist === 'number') return 1;
      if (a.relevance !== b.relevance) return a.relevance - b.relevance;
      return a.organization.name.localeCompare(b.organization.name);
    });

    return results;
  }, [organizations, searchTerm, location, kmBetween, getOrgCoordinates]);

  /**
   * Auth guard
   */
  if (authLoading) {
    return <Loading fullScreen text="Loading discover feed..." />;
  }

  if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
    return <Loading fullScreen text="Redirecting to login..." />;
  }

  /**
   * Render
   */
  return (
    <>
      <Navigation />
      <Container size="xl" py="xl" className="discover-shell">
        <div className="discover-page-header mb-8">
          <Title order={2} mb={6} className="discover-title">
            Discover
          </Title>
          <Text c="dimmed" className="discover-subtitle">
            Explore upcoming events and available rentals {location ? 'near you' : 'in your area'}.
          </Text>
        </div>

        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value as 'events' | 'rentals' | 'organizations')}
          variant="pills"
          radius="xl"
          classNames={{
            list: 'discover-segment-list',
            tab: 'discover-segment-tab',
          }}
        >
          <Tabs.List mb="lg" grow>
            <Tabs.Tab value="events">Events</Tabs.Tab>
            <Tabs.Tab value="organizations">Organizations</Tabs.Tab>
            <Tabs.Tab value="rentals">Rentals</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="events">
            <EventsTabContent
              location={location}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedEventTypes={selectedEventTypes}
              setSelectedEventTypes={setSelectedEventTypes}
              eventTypeOptions={EVENT_TYPE_OPTIONS}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              maxDistance={maxDistance}
              setMaxDistance={setMaxDistance}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              kmBetween={kmBetween}
              events={events}
              isLoadingInitial={isLoadingInitial}
              isLoadingMore={isLoadingMore}
              hasMoreEvents={hasMoreEvents}
              sentinelRef={sentinelRef}
              eventsError={eventsError}
              onEventClick={(event) => {
                setSelectedEvent(event);
                setShowEventSheet(true);
              }}
              onCreateEvent={handleCreateEventNavigation}
            />
          </Tabs.Panel>

          <Tabs.Panel value="organizations">
            <OrganizationsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              location={location}
              results={organizationResults}
              loading={organizationsLoading}
              error={organizationsError}
              onSelectOrganization={handleSelectOrganization}
            />
          </Tabs.Panel>

          <Tabs.Panel value="rentals">
            <RentalsTabContent
              rentalsLoading={rentalsLoading}
              rentalsError={rentalsError}
              rentalListings={rentalListings}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              onSelectOrganization={(org) => handleSelectRentalOrganization(org)}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>

      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          isOpen={showEventSheet}
          onClose={() => {
            setShowEventSheet(false);
          }}
        />
      )}
    </>
  );
}

function EventsTabContent(props: {
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
  selectedDate: Date | null;
  setSelectedDate: (value: Date | null) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  defaultMaxDistance: number;
  kmBetween: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  events: Event[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  eventsError: string | null;
  onEventClick: (event: Event) => void;
  onCreateEvent: () => void;
}) {
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
    selectedDate,
    setSelectedDate,
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
  } = props;

  const [eventSort, setEventSort] = useState<(typeof EVENT_SORT_OPTIONS)[number]['value']>('soonest');
  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const [filtersDrawerOpened, setFiltersDrawerOpened] = useState(false);
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
    setSelectedDate(null);
    setSearchTerm('');
  }, [eventTypeOptions, setMaxDistance, setSearchTerm, setSelectedDate, setSelectedEventTypes, setSelectedSports]);

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
    const sorted = [...events];

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
  }, [eventSort, events, getEventDistanceKm]);

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
        label: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
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

  if (selectedDate) {
    activeFilters.push({
      key: 'date',
      label: selectedDate.toLocaleDateString(),
      onRemove: () => setSelectedDate(null),
    });
  }

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${maxDistance} km`,
      onRemove: () => setMaxDistance(null),
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
              {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
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

      {location && (
        <div>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8}>
            Distance
          </Text>
          <Text size="sm" fw={600} mb={6}>
            {typeof maxDistance === 'number' ? `Within ${maxDistance} km` : 'Any distance'}
          </Text>
          <Slider
            min={0}
            max={100}
            step={5}
            value={maxDistance ?? defaultMaxDistance}
            onChange={(value) => setMaxDistance(value)}
            marks={[
              { value: 0, label: '0' },
              { value: 25, label: '25' },
              { value: 50, label: '50' },
              { value: 75, label: '75' },
              { value: 100, label: '100' },
            ]}
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
            <div style={{ minWidth: 210, flexShrink: 0 }}>
              <DatePickerInput
                value={selectedDate}
                onChange={(value) => setSelectedDate(value)}
                clearable
                leftSection={<CalendarDays size={16} />}
                placeholder="Any date"
                aria-label="Filter by date"
                valueFormat="MMM D, YYYY"
              />
            </div>
            <Button
              variant="default"
              leftSection={<Filter size={16} />}
              className="lg:hidden"
              onClick={() => setFiltersDrawerOpened(true)}
            >
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </Button>
          </Group>
          <Button size="md" onClick={onCreateEvent}>
            Create event
          </Button>
        </Group>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <Paper withBorder p="md" radius="lg" className="discover-filter-panel lg:sticky lg:top-24">
            <Group justify="space-between" align="center" mb="md">
              <Text fw={700} size="sm">
                Filters
              </Text>
              <Button variant="subtle" size="compact-sm" onClick={resetFilters} disabled={!activeFilterCount}>
                Reset
              </Button>
            </Group>
            {filterPanel}
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
              <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="lg">
                {sortedEvents.map((event) => (
                  <EventCard
                    key={event.$id}
                    event={event}
                    showDistance={Boolean(location)}
                    userLocation={location}
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </SimpleGrid>
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

      <Drawer
        opened={filtersDrawerOpened}
        onClose={() => setFiltersDrawerOpened(false)}
        title="Filters"
        position="right"
        size="100%"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto pr-1">
            {filterPanel}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Group grow>
              <Button variant="default" onClick={resetFilters}>
                Reset
              </Button>
              <Button onClick={() => setFiltersDrawerOpened(false)}>
                Apply
              </Button>
            </Group>
          </div>
        </div>
      </Drawer>
    </>
  );
}

function OrganizationsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  location: { lat: number; lng: number } | null;
  results: OrganizationResult[];
  loading: boolean;
  error: string | null;
  onSelectOrganization: (organization: Organization) => void;
}) {
  const { searchTerm, setSearchTerm, location, results, loading, error, onSelectOrganization } = props;
  const hasResults = results.length > 0;

  return (
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
          <Text fw={600} size="sm">
            Search organizations
          </Text>
          <TextInput
            aria-label="Search organizations"
            placeholder="Search by name or description"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <div style={{ minWidth: 170, flexShrink: 0 }}>
            <LocationSearch />
          </div>
        </Group>
        <Text size="sm" c="dimmed">
          Showing nearby organizations{location ? ' by distance.' : '. Enable location for better results.'}
        </Text>
      </Group>

      {error && (
        <Alert color="red" radius="md">
          {error}
        </Alert>
      )}

      {loading ? (
        <Loading text="Loading organizations..." />
      ) : !hasResults ? (
        <Paper withBorder p="xl" radius="md">
          <Text fw={600} mb={4}>
            No organizations found
          </Text>
          <Text size="sm" c="dimmed">
            {searchTerm
              ? 'Try a different search or remove filters.'
              : 'Enable location or search to find organizations near you.'}
          </Text>
          <Text size="xs" c="dimmed" mt="xs">
            Organizations without a location are hidden until you search for them.
          </Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {results.map(({ organization, distanceKm }) => (
            <OrganizationCard
              key={organization.$id}
              organization={organization}
              onClick={() => onSelectOrganization(organization)}
              actions={
                typeof distanceKm === 'number' ? (
                  <Text size="xs" c="dimmed">
                    {distanceKm.toFixed(1)} km away
                  </Text>
                ) : undefined
              }
            />
          ))}
        </SimpleGrid>
      )}
    </div>
  );
}

function RentalsTabContent(props: {
  rentalsLoading: boolean;
  rentalsError: string | null;
  rentalListings: RentalListing[];
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  onSelectOrganization: (organization: Organization, listings: RentalListing[]) => void;
}) {
  const {
    rentalsLoading,
    rentalsError,
    rentalListings,
    timeRange,
    setTimeRange,
    onSelectOrganization,
  } = props;

  const filteredListings = useMemo(() => {
    const [startHour, endHour] = timeRange;
    return rentalListings.filter((listing) => {
      const start = listing.nextOccurrence;
      const hour = start.getHours() + start.getMinutes() / 60;
      return hour >= startHour && hour < endHour;
    });
  }, [rentalListings, timeRange]);

  const organizationsWithListings = useMemo(() => {
    const map = new Map<string, { organization: Organization; listings: RentalListing[] }>();
    filteredListings.forEach((listing) => {
      const orgId = listing.organization.$id;
      const existing = map.get(orgId);
      if (existing) {
        existing.listings.push(listing);
      } else {
        map.set(orgId, { organization: listing.organization, listings: [listing] });
      }
    });
    return Array.from(map.values());
  }, [filteredListings]);

  return (
    <div className="space-y-6">
      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          Filters
        </Title>
        <Group gap="md" align="flex-start" wrap="wrap">
          <div className="flex-1 min-w-[240px]">
            <Text size="sm" fw={600} mb={6}>
              Time Range
            </Text>
            <RangeSlider
              min={0}
              max={24}
              step={1}
              minRange={1}
              value={timeRange}
              onChange={(value) => setTimeRange(value as [number, number])}
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
        </Group>
      </Paper>

      {rentalsError && (
        <Alert color="red">
          {rentalsError}
        </Alert>
      )}

      {rentalsLoading ? (
        <Loading text="Loading rentals..." />
      ) : organizationsWithListings.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Text fw={600} mb={4}>
            No rentals available
          </Text>
          <Text size="sm" c="dimmed">
            Try adjusting the filters to explore more fields.
          </Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {organizationsWithListings.map(({ organization, listings }) => (
            <OrganizationCard
              key={organization.$id}
              organization={organization}
              onClick={() => onSelectOrganization(organization, listings)}
              actions={
                <Text size="xs" c="dimmed">
                  {listings.length} rental{listings.length === 1 ? '' : 's'} available
                </Text>
              }
            />
          ))}
        </SimpleGrid>
      )}
    </div>
  );
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return formatDisplayTime(date);
}
