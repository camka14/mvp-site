'use client';

import { Dispatch, SetStateAction, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

const normalizeSportValue = (value: string): string => value.trim().toLowerCase();

const organizationMatchesSports = (organization: Organization, selectedSports: string[]): boolean => {
  if (!selectedSports.length) {
    return true;
  }

  const organizationSports = new Set(
    (Array.isArray(organization.sports) ? organization.sports : [])
      .filter((sport): sport is string => typeof sport === 'string')
      .map((sport) => normalizeSportValue(sport))
      .filter((sport) => sport.length > 0),
  );

  if (!organizationSports.size) {
    return false;
  }

  return selectedSports.some((sport) => organizationSports.has(normalizeSportValue(sport)));
};

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
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
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const searchQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);

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
  const [rentalsMaxDistance, setRentalsMaxDistance] = useState<number | null>(null);

  /**
   * Organizations tab state
   */
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const [organizationsMaxDistance, setOrganizationsMaxDistance] = useState<number | null>(null);

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
    if (pathname !== '/discover') {
      return;
    }
    if (typeof window === 'undefined' || window.location.pathname !== '/discover') {
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    if (debouncedSearch) {
      params.set('q', debouncedSearch);
    } else {
      params.delete('q');
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `/discover?${nextQuery}` : '/discover';
    const currentUrl = searchParamsString ? `/discover?${searchParamsString}` : '/discover';
    if (nextUrl === currentUrl) {
      return;
    }
    // Keep discover query params in sync without triggering router navigations
    // that can race with user-initiated route changes (Profile/Organizations).
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [debouncedSearch, pathname, searchParamsString]);

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) =>
      current.filter((sport) => sportOptions.includes(sport))
    );
  }, [sportOptions, sportsLoading]);

  const buildEventFilters = useCallback(
    () => {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const normalizedQuery = debouncedSearch.trim();
      const normalizedStartDate =
        selectedStartDate instanceof Date && !Number.isNaN(selectedStartDate.getTime())
          ? selectedStartDate
          : null;
      const normalizedEndDate =
        selectedEndDate instanceof Date && !Number.isNaN(selectedEndDate.getTime())
          ? selectedEndDate
          : null;
      const effectiveDate = normalizedStartDate
        ? normalizedStartDate
        : normalizedEndDate && normalizedEndDate < startOfToday
          ? normalizedEndDate
          : startOfToday;
      const dateFrom = new Date(
        effectiveDate.getFullYear(),
        effectiveDate.getMonth(),
        effectiveDate.getDate(),
        0,
        0,
        0,
        0,
      ).toISOString();
      const dateTo = normalizedEndDate
        ? new Date(
            normalizedEndDate.getFullYear(),
            normalizedEndDate.getMonth(),
            normalizedEndDate.getDate(),
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
    [
      selectedEventTypes,
      selectedSports,
      location,
      maxDistance,
      debouncedSearch,
      selectedStartDate,
      selectedEndDate,
      EVENT_TYPE_OPTIONS,
    ],
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

  const locationRequestAttemptedRef = useRef(false);
  useEffect(() => {
    if (location) {
      return;
    }
    if (locationRequestAttemptedRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    locationRequestAttemptedRef.current = true;
    requestLocation().catch(() => {});
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

  const handleSelectEvent = useCallback(
    (event: Event) => {
      router.push(`/events/${event.$id}/schedule?tab=details`);
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
      const coordinates = getOrgCoordinates(organization);

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

          if (location && coordinates) {
            try {
              listing.distanceKm = kmBetween(location, coordinates);
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
  }, [rentalOrganizations, location, kmBetween, getOrgCoordinates]);

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
      if (!organizationMatchesSports(org, selectedSports)) {
        return;
      }

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

      if (location && typeof organizationsMaxDistance === 'number') {
        if (typeof distanceKm !== 'number' || distanceKm > organizationsMaxDistance) {
          return;
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
  }, [
    organizations,
    searchTerm,
    selectedSports,
    location,
    organizationsMaxDistance,
    kmBetween,
    getOrgCoordinates,
  ]);

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
              selectedStartDate={selectedStartDate}
              setSelectedStartDate={setSelectedStartDate}
              selectedEndDate={selectedEndDate}
              setSelectedEndDate={setSelectedEndDate}
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
              onEventClick={handleSelectEvent}
              onCreateEvent={handleCreateEventNavigation}
            />
          </Tabs.Panel>

          <Tabs.Panel value="organizations">
            <OrganizationsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              location={location}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              maxDistance={organizationsMaxDistance}
              setMaxDistance={setOrganizationsMaxDistance}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              results={organizationResults}
              loading={organizationsLoading}
              error={organizationsError}
              onSelectOrganization={handleSelectOrganization}
            />
          </Tabs.Panel>

          <Tabs.Panel value="rentals">
            <RentalsTabContent
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              location={location}
              rentalsLoading={rentalsLoading}
              rentalsError={rentalsError}
              rentalListings={rentalListings}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
              maxDistance={rentalsMaxDistance}
              setMaxDistance={setRentalsMaxDistance}
              defaultMaxDistance={DEFAULT_MAX_DISTANCE}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              defaultTimeRange={defaultTimeRange}
              onSelectOrganization={(org) => handleSelectRentalOrganization(org)}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>
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
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  results: OrganizationResult[];
  loading: boolean;
  error: string | null;
  onSelectOrganization: (organization: Organization) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    location,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    results,
    loading,
    error,
    onSelectOrganization,
  } = props;

  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const [filtersDrawerOpened, setFiltersDrawerOpened] = useState(false);
  const allSportsSelected = selectedSports.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);

  const hasResults = results.length > 0;
  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${maxDistance} km`,
      onRemove: () => setMaxDistance(null),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedSports([]);
    setMaxDistance(null);
  }, [setSearchTerm, setSelectedSports, setMaxDistance]);

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
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
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
          <TextInput
            aria-label="Search organizations"
            leftSection={<Search size={16} />}
            placeholder="Search by name or description"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <div style={{ minWidth: 170, flexShrink: 0 }}>
            <LocationSearch />
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
        <Text size="sm" c="dimmed">
          {results.length} organization{results.length === 1 ? '' : 's'}
          {location ? ' near you.' : '. Enable location for distance filtering.'}
        </Text>
      </Group>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper withBorder p={0} radius="lg" className="h-full overflow-hidden">
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
                {activeFilterCount
                  ? 'Try adjusting your current filters.'
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
      </div>

      <Drawer
        opened={filtersDrawerOpened}
        onClose={() => setFiltersDrawerOpened(false)}
        title="Filters"
        position="right"
        size="100%"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto pr-1">{filterPanel}</div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Group grow>
              <Button variant="default" onClick={resetFilters}>
                Reset
              </Button>
              <Button onClick={() => setFiltersDrawerOpened(false)}>Apply</Button>
            </Group>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function RentalsTabContent(props: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  location: { lat: number; lng: number } | null;
  rentalsLoading: boolean;
  rentalsError: string | null;
  rentalListings: RentalListing[];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
  maxDistance: number | null;
  setMaxDistance: (value: number | null) => void;
  defaultMaxDistance: number;
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  defaultTimeRange: [number, number];
  onSelectOrganization: (organization: Organization, listings: RentalListing[]) => void;
}) {
  const {
    searchTerm,
    setSearchTerm,
    location,
    rentalsLoading,
    rentalsError,
    rentalListings,
    selectedSports,
    setSelectedSports,
    sports,
    sportsLoading,
    sportsError,
    maxDistance,
    setMaxDistance,
    defaultMaxDistance,
    timeRange,
    setTimeRange,
    defaultTimeRange,
    onSelectOrganization,
  } = props;

  const [sportSearchTerm, setSportSearchTerm] = useState('');
  const [filtersDrawerOpened, setFiltersDrawerOpened] = useState(false);
  const allSportsSelected = selectedSports.length === 0;
  const sportsQuery = sportSearchTerm.trim().toLowerCase();
  const activeQuery = searchTerm.trim();
  const visibleSports = useMemo(() => {
    if (!sportsQuery) {
      return sports;
    }
    return sports.filter((sport) => sport.toLowerCase().includes(sportsQuery));
  }, [sports, sportsQuery]);

  const filteredListings = useMemo(() => {
    const [startHour, endHour] = timeRange;
    return rentalListings.filter((listing) => {
      if (!organizationMatchesSports(listing.organization, selectedSports)) {
        return false;
      }
      if (location && typeof maxDistance === 'number') {
        if (typeof listing.distanceKm !== 'number' || listing.distanceKm > maxDistance) {
          return false;
        }
      }
      if (activeQuery) {
        const searchBlob = `${listing.organization.name} ${listing.organization.description ?? ''} ${listing.organization.location ?? ''} ${listing.field.name}`.toLowerCase();
        if (!searchBlob.includes(activeQuery.toLowerCase())) {
          return false;
        }
      }
      const start = listing.nextOccurrence;
      const hour = start.getHours() + start.getMinutes() / 60;
      return hour >= startHour && hour < endHour;
    });
  }, [rentalListings, timeRange, selectedSports, location, maxDistance, activeQuery]);

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

  const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (activeQuery) {
    activeFilters.push({
      key: 'query',
      label: `Search: ${activeQuery}`,
      onRemove: () => setSearchTerm(''),
    });
  }

  selectedSports.forEach((sport) => {
    activeFilters.push({
      key: `sport-${sport}`,
      label: sport,
      onRemove: () => setSelectedSports((current) => current.filter((value) => value !== sport)),
    });
  });

  if (location && typeof maxDistance === 'number') {
    activeFilters.push({
      key: 'distance',
      label: `Within ${maxDistance} km`,
      onRemove: () => setMaxDistance(null),
    });
  }

  if (timeRange[0] !== defaultTimeRange[0] || timeRange[1] !== defaultTimeRange[1]) {
    activeFilters.push({
      key: 'time-range',
      label: `${formatHourLabel(timeRange[0])} - ${formatHourLabel(timeRange[1])}`,
      onRemove: () => setTimeRange(defaultTimeRange),
    });
  }

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedSports([]);
    setMaxDistance(null);
    setTimeRange(defaultTimeRange);
  }, [setSearchTerm, setSelectedSports, setMaxDistance, setTimeRange, defaultTimeRange]);

  const activeFilterCount = activeFilters.length;

  const filterPanel = (
    <div className="space-y-6">
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
          Time Range
        </Text>
        <RangeSlider
          className="discover-time-range-slider"
          min={0}
          max={24}
          step={1}
          minRange={1}
          value={timeRange}
          onChange={(value) => setTimeRange(value as [number, number])}
          marks={[
            { value: 0, label: formatHourTickLabel(0) },
            { value: 12, label: formatHourTickLabel(12) },
            { value: 24, label: formatHourTickLabel(24) },
          ]}
          label={(value) => formatHourLabel(value)}
          size="sm"
        />
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
    <div className="space-y-6 mb-8">
      <Group justify="space-between" align="center" gap="md" wrap="wrap">
        <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
          <TextInput
            aria-label="Search rentals"
            leftSection={<Search size={16} />}
            placeholder="Search organizations and fields..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <div style={{ minWidth: 170, flexShrink: 0 }}>
            <LocationSearch />
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
        <Text size="sm" c="dimmed">
          {organizationsWithListings.length} organization{organizationsWithListings.length === 1 ? '' : 's'} with rentals
          {location ? ' near you.' : '.'}
        </Text>
      </Group>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-6.5rem)]">
          <Paper withBorder p={0} radius="lg" className="h-full overflow-hidden">
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
                Try adjusting your current filters to explore more fields.
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
      </div>

      <Drawer
        opened={filtersDrawerOpened}
        onClose={() => setFiltersDrawerOpened(false)}
        title="Filters"
        position="right"
        size="100%"
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto pr-1">{filterPanel}</div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Group grow>
              <Button variant="default" onClick={resetFilters}>
                Reset
              </Button>
              <Button onClick={() => setFiltersDrawerOpened(false)}>Apply</Button>
            </Group>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return formatDisplayTime(date);
}

function formatHourTickLabel(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  if (normalizedHour === 0) {
    return '12am';
  }
  if (normalizedHour === 12) {
    return '12pm';
  }
  if (normalizedHour < 12) {
    return `${normalizedHour}am`;
  }
  return `${normalizedHour - 12}pm`;
}
