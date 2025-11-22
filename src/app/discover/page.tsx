'use client';

import { Dispatch, SetStateAction, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Button,
  Chip,
  Collapse,
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

import { ChevronDown, ChevronUp } from 'lucide-react';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import EventCard from '@/components/ui/EventCard';
import OrganizationCard from '@/components/ui/OrganizationCard';
import RentalSelectionModal from '@/app/discover/components/RentalSelectionModal';
import EventDetailSheet from './components/EventDetailSheet';
import EventCreationSheet from './components/EventCreationSheet';
import LocationSearch from '@/components/location/LocationSearch';
import { useApp } from '@/app/providers';
import { useLocation } from '@/app/hooks/useLocation';
import { useDebounce } from '@/app/hooks/useDebounce';
import { Event, Field, Organization, TimeSlot, formatPrice } from '@/types';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import { getNextRentalOccurrence, weekdayLabel } from './utils/rentals';
import { useSports } from '@/app/hooks/useSports';

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

  const EVENT_TYPE_OPTIONS = useMemo(() => ['EVENT', 'TOURNAMENT', 'LEAGUE'] as const, []);
  const [selectedEventTypes, setSelectedEventTypes] =
    useState<(typeof EVENT_TYPE_OPTIONS)[number][]>(['EVENT', 'TOURNAMENT', 'LEAGUE']);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const searchQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [resumePreviewEvent, setResumePreviewEvent] = useState<Event | null>(null);
  const resumePreviewHandled = useRef(false);

  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const sportOptions = useMemo(() => sports.map((sport) => sport.name), [sports]);

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

  useEffect(() => {
    if (sportsLoading) return;
    setSelectedSports((current) =>
      current.filter((sport) => sportOptions.includes(sport))
    );
  }, [sportOptions, sportsLoading]);

  /**
   * Derived events list with filters applied on the client to avoid flicker.
   */
  const filteredEvents = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    return events.filter((event) => {
      if (selectedEventTypes.length && !selectedEventTypes.includes(event.eventType)) return false;
      if (
        selectedSports.length > 0 &&
        !selectedSports.map((sport) => sport.toLowerCase()).includes((event.sport?.name ?? '').toLowerCase())
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
    selectedEventTypes,
    selectedSports,
    searchQuery,
    location,
    maxDistance,
    kmBetween,
  ]);

  const buildEventFilters = useCallback(
    () => ({
      eventTypes: selectedEventTypes.length === EVENT_TYPE_OPTIONS.length ? undefined : selectedEventTypes,
      sports: selectedSports.length > 0 ? selectedSports : undefined,
      userLocation: location || undefined,
      maxDistance: location ? maxDistance : undefined,
      query: searchQuery || undefined,
    }),
    [selectedEventTypes, selectedSports, location, maxDistance, searchQuery, EVENT_TYPE_OPTIONS],
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

    setShowCreateSheet(true);
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
              selectedEventTypes={selectedEventTypes}
              setSelectedEventTypes={setSelectedEventTypes}
              eventTypeOptions={EVENT_TYPE_OPTIONS}
              selectedSports={selectedSports}
              setSelectedSports={setSelectedSports}
              maxDistance={maxDistance}
              setMaxDistance={setMaxDistance}
              sports={sportOptions}
              sportsLoading={sportsLoading}
              sportsError={sportsError?.message ?? null}
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
                setShowEventSheet(true);
              }}
              onCreateEvent={() => setShowCreateSheet(true)}
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
        <EventDetailSheet
          event={selectedEvent}
          isOpen={showEventSheet}
          onClose={() => {
            setShowEventSheet(false);
          }}
        />
      )}

      {user && (
        <EventCreationSheet
          isOpen={showCreateSheet}
          onClose={() => setShowCreateSheet(false)}
          onEventCreated={async () => {
            setShowCreateSheet(false);
            await loadFirstPage();
            return true;
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
  selectedEventTypes: Event['eventType'][];
  setSelectedEventTypes: (value: Event['eventType'][]) => void;
  eventTypeOptions: readonly Event['eventType'][];
  selectedSports: string[];
  setSelectedSports: Dispatch<SetStateAction<string[]>>;
  maxDistance: number;
  setMaxDistance: (value: number) => void;
  sports: string[];
  sportsLoading: boolean;
  sportsError: string | null;
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
    selectedEventTypes,
    setSelectedEventTypes,
    eventTypeOptions,
    selectedSports,
    setSelectedSports,
    maxDistance,
    setMaxDistance,
    sports,
    sportsLoading,
    sportsError,
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

  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const allEventTypesSelected = selectedEventTypes.length === eventTypeOptions.length;
  const allSportsSelected = selectedSports.length === 0;

  return (
    <>
      <div className="space-y-6 mb-8">
        <Group justify="space-between" align="center" gap="md" wrap="wrap">
          <Group align="center" gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 320 }}>
            <Text fw={600} size="sm">
              Search events
            </Text>
            <TextInput
              aria-label="Search events"
              placeholder="Search by name or description"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <div style={{ minWidth: 170, flexShrink: 0 }}>
              <LocationSearch />
            </div>
          </Group>
          <Button size="md" onClick={onCreateEvent}>
            Create event
          </Button>
        </Group>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" align="center" mb="sm">
            <Title order={5}>
              Filters
            </Title>
            <ActionIcon
              variant="subtle"
              onClick={() => setFiltersCollapsed((prev) => !prev)}
              aria-label={filtersCollapsed ? 'Expand filters' : 'Collapse filters'}
            >
              {filtersCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </ActionIcon>
          </Group>
          <Collapse in={!filtersCollapsed}>
            <Group gap="md" align="flex-start" wrap="wrap">
              <div>
                <Text size="sm" fw={600} mb={6}>
                  Event types
                </Text>
                <Group gap="xs">
                  <Chip
                    radius="sm"
                    checked={allEventTypesSelected}
                    onChange={(checked) => setSelectedEventTypes(checked ? [...eventTypeOptions] : [])}
                  >
                    All
                  </Chip>
                  {eventTypeOptions.map((type) => (
                    <Chip
                      key={type}
                      radius="sm"
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
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Chip>
                  ))}
                </Group>
              </div>

              <div>
                <Text size="sm" fw={600} mb={6}>
                  Sports
                </Text>
                <Group gap="xs" align="center">
                  <Chip
                    radius="sm"
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
                  ) : sports.length ? (
                    sports.map((sport) => (
                      <Chip
                        key={sport}
                        radius="sm"
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
                      No sports available
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
          </Collapse>
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
