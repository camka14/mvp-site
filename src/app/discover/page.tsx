'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Chip,
  Container,
  Group,
  Loader,
  Paper,
  RangeSlider,
  SimpleGrid,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import EventCard from '@/components/ui/EventCard';
import OrganizationCard from '@/components/ui/OrganizationCard';
import RentalSelectionModal from '@/app/discover/components/RentalSelectionModal';
import EventDetailModal from './components/EventDetailModal';
import EventCreationModal from './components/EventCreationModal';
import LocationSearch from '@/components/location/LocationSearch';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import {
  Event,
  EventCategory,
  Field,
  Organization,
  TimeSlot,
  formatPrice,
  SPORTS_LIST,
} from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { getNextRentalOccurrence, weekdayLabel } from './utils/rentals';

type RentalListing = {
  organization: Organization;
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

const EVENTS_LIMIT = 18;
const DEFAULT_EVENT_ID = '68b89ab116e106a731c3';
const DISTANCE_OPTIONS = [10, 25, 50, 100];

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

  const [activeTab, setActiveTab] = useState<'events' | 'rentals'>('events');

  /**
   * Events tab state
   */
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<'All' | EventCategory>('All');
  const EVENT_TYPE_OPTIONS = useMemo(() => ['pickup', 'tournament', 'league'] as const, []);
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<(typeof EVENT_TYPE_OPTIONS)[number][]>(['pickup', 'tournament', 'league']);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const searchQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resumePreviewEvent, setResumePreviewEvent] = useState<Event | null>(null);
  const resumePreviewHandled = useRef(false);

  /**
   * Rentals tab state
   */
  const [rentalOrganizations, setRentalOrganizations] = useState<Organization[]>([]);
  const [rentalsLoaded, setRentalsLoaded] = useState(false);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [selectedFieldTypes, setSelectedFieldTypes] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<[number, number]>([8, 22]);
  const [rentalModalData, setRentalModalData] = useState<{ organization: Organization; listings: RentalListing[] } | null>(null);

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

  /**
   * Derived events list with filters applied on the client to avoid flicker.
   */
  const filteredEvents = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    return events.filter((event) => {
      if (selectedCategory !== 'All' && event.category !== selectedCategory) return false;
      if (selectedEventTypes.length && !selectedEventTypes.includes(event.eventType)) return false;
      if (
        selectedSports.length > 0 &&
        !selectedSports.map((sport) => sport.toLowerCase()).includes(event.sport.toLowerCase())
      ) {
        return false;
      }
      if (q) {
        const text = `${event.name} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (location) {
        try {
          const dist = kmBetween(
            { lat: location.lat, lng: location.lng },
            { lat: event.coordinates[1], lng: event.coordinates[0] },
          );
          if (dist > maxDistance) return false;
        } catch {
          // ignore distance errors
        }
      }
      return true;
    });
  }, [
    events,
    selectedCategory,
    selectedEventTypes,
    selectedSports,
    searchQuery,
    location,
    maxDistance,
    kmBetween,
  ]);

  const buildEventFilters = useCallback(
    () => ({
      category: selectedCategory === 'All' ? undefined : selectedCategory,
      eventTypes: selectedEventTypes.length === 3 ? undefined : selectedEventTypes,
      sports: selectedSports.length > 0 ? selectedSports : undefined,
      userLocation: location || undefined,
      maxDistance: location ? maxDistance : undefined,
      query: searchQuery || undefined,
    }),
    [selectedCategory, selectedEventTypes, selectedSports, location, maxDistance, searchQuery],
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

      let result = page;
      try {
        const sample = await eventService.getEvent(DEFAULT_EVENT_ID);
        if (sample && !page.some((event) => event.$id === sample.$id)) {
          result = [sample, ...page];
        }
      } catch {
        // ignore sample fetch problems
      }

      setEvents(result);
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
   * Effects
   */
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
        router.push('/login');
        return;
      }
      loadFirstPage();
    }
  }, [isAuthenticated, authLoading, router, loadFirstPage]);

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
  }, [activeTab, loadRentals]);

  useEffect(() => {
    if (authLoading || resumePreviewHandled.current) {
      return;
    }
    if (!user || typeof window === 'undefined') {
      return;
    }

    const resumeId = window.sessionStorage.getItem('league-preview-resume-id');
    if (!resumeId) {
      resumePreviewHandled.current = true;
      return;
    }

    resumePreviewHandled.current = true;
    window.sessionStorage.removeItem('league-preview-resume-id');

    const cachedEvent = window.sessionStorage.getItem(`league-preview-event:${resumeId}`);
    if (cachedEvent) {
      try {
        const parsed = JSON.parse(cachedEvent) as Event;
        setResumePreviewEvent(parsed);
      } catch (parseError) {
        console.warn('Failed to hydrate preview draft from cache:', parseError);
        setResumePreviewEvent(null);
      }
    } else {
      setResumePreviewEvent(null);
    }

    setShowCreateModal(true);
  }, [authLoading, user]);

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
  const availableFieldTypes = useMemo(() => {
    const types = new Set<string>();
    rentalOrganizations.forEach((organization) => {
      (organization.fields || []).forEach((field) => {
        if (field.type) {
          types.add(field.type);
        }
      });
    });
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [rentalOrganizations]);

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
        if (selectedFieldTypes.length && field.type && !selectedFieldTypes.includes(field.type)) {
          return;
        }

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
  }, [rentalOrganizations, selectedFieldTypes, location, kmBetween]);

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
      <Container size="lg" py="xl">
        <div className="mb-8">
          <Title order={2} mb={6}>
            Discover
          </Title>
          <Text c="dimmed">
            Explore upcoming events and available rentals {location ? 'near you' : 'in your area'}.
          </Text>
        </div>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value as 'events' | 'rentals')}>
          <Tabs.List mb="lg">
            <Tabs.Tab value="events">Events</Tabs.Tab>
            <Tabs.Tab value="rentals">Rentals</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="events">
            <EventsTabContent
              location={location}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedEventTypes={selectedEventTypes}
              setSelectedEventTypes={setSelectedEventTypes}
              eventTypeOptions={EVENT_TYPE_OPTIONS}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              maxDistance={maxDistance}
              setMaxDistance={setMaxDistance}
              sports={SPORTS_LIST}
              distanceOptions={DISTANCE_OPTIONS}
              filteredEvents={filteredEvents}
              isLoadingInitial={isLoadingInitial}
              isLoadingMore={isLoadingMore}
              hasMoreEvents={hasMoreEvents}
              loadMoreEvents={loadMoreEvents}
              sentinelRef={sentinelRef}
              eventsError={eventsError}
              onEventClick={(event) => {
                setSelectedEvent(event);
                setShowEventModal(true);
              }}
              onCreateEvent={() => setShowCreateModal(true)}
            />
          </Tabs.Panel>

          <Tabs.Panel value="rentals">
            <RentalsTabContent
              rentalsLoading={rentalsLoading}
              rentalsError={rentalsError}
              rentalListings={rentalListings}
              availableFieldTypes={availableFieldTypes}
              selectedFieldTypes={selectedFieldTypes}
              setSelectedFieldTypes={setSelectedFieldTypes}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              onSelectOrganization={(org, listings) => setRentalModalData({ organization: org, listings })}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          isOpen={showEventModal}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
          }}
        />
      )}

      {user && (
        <EventCreationModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onEventCreated={async () => {
            setShowCreateModal(false);
            await loadFirstPage();
          }}
          currentUser={user}
          organization={null}
          editingEvent={resumePreviewEvent ?? undefined}
        />
      )}

      <RentalSelectionModal
        opened={Boolean(rentalModalData)}
        onClose={() => setRentalModalData(null)}
        organization={rentalModalData?.organization ?? null}
        listings={rentalModalData?.listings ?? []}
      />
    </>
  );
}

function EventsTabContent(props: {
  location: { lat: number; lng: number } | null;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedCategory: 'All' | EventCategory;
  setSelectedCategory: (value: 'All' | EventCategory) => void;
  selectedEventTypes: ('pickup' | 'tournament' | 'league')[];
  setSelectedEventTypes: (value: ('pickup' | 'tournament' | 'league')[]) => void;
  eventTypeOptions: readonly ('pickup' | 'tournament' | 'league')[];
  selectedSports: string[];
  setSelectedSports: (value: string[]) => void;
  maxDistance: number;
  setMaxDistance: (value: number) => void;
  sports: string[];
  distanceOptions: number[];
  filteredEvents: Event[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMoreEvents: boolean;
  loadMoreEvents: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  eventsError: string | null;
  onEventClick: (event: Event) => void;
  onCreateEvent: () => void;
}) {
  const {
    location,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    selectedSports,
    setSelectedSports,
    maxDistance,
    setMaxDistance,
    sports,
    distanceOptions,
    filteredEvents,
    isLoadingInitial,
    isLoadingMore,
    hasMoreEvents,
    loadMoreEvents,
    sentinelRef,
    eventsError,
    onEventClick,
    onCreateEvent,
  } = props;

  const categories: ('All' | EventCategory)[] = ['All', 'Volleyball', 'Soccer', 'Basketball', 'Tennis', 'Pickleball', 'Swimming', 'Football', 'Other'];

  return (
    <>
      <div className="space-y-6 mb-8">
        <Group justify="space-between" align="stretch" gap="md" wrap="wrap">
          <Group align="center" gap="md" style={{ flex: 1, minWidth: 320 }}>
            <div style={{ minWidth: 270 }}>
              <TextInput
                label="Search events"
                placeholder="Search by name or description"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
              />
            </div>
            <div style={{ minWidth: 270 }}>
              <LocationSearch />
            </div>
          </Group>
          <Button size="md" onClick={onCreateEvent}>
            Create event
          </Button>
        </Group>

        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">
            Filters
          </Title>
          <Group gap="md" align="flex-start" wrap="wrap">
            <div>
              <Text size="sm" fw={600} mb={6}>
                Category
              </Text>
              <Chip.Group
                value={[selectedCategory]}
                onChange={(values) => setSelectedCategory((values[0] as 'All' | EventCategory) || 'All')}
              >
                <Group gap="xs">
                  {categories.map((category) => (
                    <Chip key={category} value={category} radius="sm">
                      {category}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            <div>
              <Text size="sm" fw={600} mb={6}>
                Event types
              </Text>
              <Chip.Group
                multiple
                value={selectedEventTypes}
                onChange={(values) => {
                  const normalized = values
                    .map((type) => eventTypeOptions.find((option) => option === type) ?? null)
                    .filter((value): value is ('pickup' | 'tournament' | 'league') => value !== null);
                  setSelectedEventTypes(normalized);
                }}
              >
                <Group gap="xs">
                  {eventTypeOptions.map((type) => (
                    <Chip key={type} value={type} radius="sm">
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            <div>
              <Text size="sm" fw={600} mb={6}>
                Sports
              </Text>
              <Chip.Group multiple value={selectedSports} onChange={setSelectedSports}>
                <Group gap="xs">
                  {sports.map((sport) => (
                    <Chip key={sport} value={sport} radius="sm">
                      {sport}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </div>

            {location && (
              <div>
                <Text size="sm" fw={600} mb={6}>
                  Max distance (km)
                </Text>
                <Chip.Group value={[String(maxDistance)]} onChange={(values) => setMaxDistance(Number(values[0] ?? maxDistance))}>
                  <Group gap="xs">
                    {distanceOptions.map((distance) => (
                      <Chip key={distance} value={String(distance)} radius="sm">
                        {distance} km
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </div>
            )}
          </Group>
        </Paper>
      </div>

      {eventsError && (
        <Alert color="red" mb="lg">
          {eventsError}
        </Alert>
      )}

      {isLoadingInitial ? (
        <Loading text="Loading events..." />
      ) : filteredEvents.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Text fw={600} mb={4}>
            No events found
          </Text>
          <Text size="sm" c="dimmed">
            Try adjusting your filters or search query.
          </Text>
        </Paper>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {filteredEvents.map((event) => (
              <EventCard key={event.$id} event={event} onClick={() => onEventClick(event)} />
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
    </>
  );
}

function RentalsTabContent(props: {
  rentalsLoading: boolean;
  rentalsError: string | null;
  rentalListings: RentalListing[];
  availableFieldTypes: string[];
  selectedFieldTypes: string[];
  setSelectedFieldTypes: (types: string[]) => void;
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  onSelectOrganization: (organization: Organization, listings: RentalListing[]) => void;
}) {
  const {
    rentalsLoading,
    rentalsError,
    rentalListings,
    availableFieldTypes,
    selectedFieldTypes,
    setSelectedFieldTypes,
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
          <div>
            <Text size="sm" fw={600} mb={6}>
              Field types
            </Text>
            {availableFieldTypes.length ? (
              <Chip.Group multiple value={selectedFieldTypes} onChange={setSelectedFieldTypes}>
                <Group gap="xs">
                  {availableFieldTypes.map((type) => (
                    <Chip key={type} value={type} radius="sm">
                      {type}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            ) : (
              <Text size="sm" c="dimmed">
                No field types available yet.
              </Text>
            )}
          </div>

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
  return date.toLocaleTimeString([], { hour: 'numeric' });
}
