'use client';

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Event, EventCategory, SPORTS_LIST } from '@/types';
import { eventService } from '@/lib/eventService';
import { useLocation } from '@/app/hooks/useLocation';
import Navigation from '@/components/layout/Navigation';
// SearchBar replaced inline with Mantine TextInput
import EventCard from '@/components/ui/EventCard';
import LocationSearch from '@/components/location/LocationSearch';
import Loading from '@/components/ui/Loading';
import { Container, Title, Text, Group, Button, Paper, Chip, SegmentedControl, Alert, Loader, SimpleGrid, TextInput } from '@mantine/core';
import { useDebounce } from '@/app/hooks/useDebounce';
import EventDetailModal from './components/EventDetailModal';
import EventCreationModal from './components/EventCreationModal';

export default function EventsPage() {
  return <Suspense fallback={<Loading text="Loading events..." />}>
    <EventsPageContent />
  </Suspense>;
}

function EventsPageContent() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useApp();
  const { location, requestLocation } = useLocation();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'All' | EventCategory>('All');
  const [selectedEventTypes, setSelectedEventTypes] = useState<('pickup' | 'tournament' | 'league')[]>(['pickup', 'tournament', 'league']);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resumePreviewEvent, setResumePreviewEvent] = useState<Event | null>(null);
  const resumePreviewHandled = useRef(false);

  const LIMIT = 18;
  const DEFAULT_EVENT_ID = '68b89ab116e106a731c3';

  const kmBetween = useCallback((a: { lat: number, lng: number }, b: { lat: number, lng: number }) => {
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const c = 2 * Math.asin(Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon));
    return R * c;
  }, []);

  // Update URL when search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedSearch) params.set('q', debouncedSearch); else params.delete('q');
    router.push(`/events?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Derived client-side filtered list to avoid flicker while awaiting server-filtered pages
  const filteredEvents = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    return events.filter(e => {
      if (selectedCategory !== 'All' && e.category !== selectedCategory) return false;
      if (selectedEventTypes.length === 1 && !selectedEventTypes.includes(e.eventType)) return false;
      if (selectedSports.length > 0 && !selectedSports.map(s => s.toLowerCase()).includes(e.sport.toLowerCase())) return false;
      if (q) {
        const text = `${e.name} ${e.description ?? ''} ${e.location ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (location) {
        try {
          const dist = kmBetween({ lat: location.lat, lng: location.lng }, { lat: e.coordinates[1], lng: e.coordinates[0] });
          if (dist > maxDistance) return false;
        } catch { }
      }
      return true;
    });
  }, [events, selectedCategory, selectedEventTypes, selectedSports, searchQuery, location, maxDistance, kmBetween]);

  const buildFilters = useCallback(() => ({
    category: selectedCategory === 'All' ? undefined : selectedCategory,
    eventTypes: selectedEventTypes.length === 3 ? undefined : selectedEventTypes,
    sports: selectedSports.length > 0 ? selectedSports : undefined,
    userLocation: location || undefined,
    maxDistance: location ? maxDistance : undefined,
    query: searchQuery || undefined
  }), [selectedCategory, selectedEventTypes, selectedSports, location, maxDistance, searchQuery]);

  const loadFirstPage = useCallback(async () => {
    setIsLoadingInitial(true);
    setIsLoadingMore(false);
    setError(null);
    setOffset(0);
    setHasMore(true);
    try {
      const filters = buildFilters();
      const page = await eventService.getEventsPaginated(filters, LIMIT, 0);

      // Try to include a default sample event at the top when available
      let result = page;
      try {
        const sample = await eventService.getEvent(DEFAULT_EVENT_ID);
        if (sample && !page.some(e => e.$id === sample.$id)) {
          result = [sample, ...page];
        }
      } catch { }

      setEvents(result);
      setOffset(page.length);
      setHasMore(page.length === LIMIT);
    } catch (error) {
      console.error('Failed to load events:', error);
      setError('Failed to load events. Please try again.');
    } finally {
      setIsLoadingInitial(false);
    }
  }, [buildFilters]);

  const loadMore = useCallback(async () => {
    // Prevent fetching more while the initial page is loading or a fetch is in-flight
    if (isLoadingInitial || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const filters = buildFilters();
      const page = await eventService.getEventsPaginated(filters, LIMIT, offset);
      // Append while de-duplicating by $id to avoid duplicate cards if the backend overlaps pages
      setEvents(prev => {
        const merged = [...prev, ...page];
        const seen = new Set<string>();
        return merged.filter(e => {
          if (seen.has(e.$id)) return false;
          seen.add(e.$id);
          return true;
        });
      });
      setOffset(prev => prev + page.length);
      setHasMore(page.length === LIMIT);
    } catch (error) {
      console.error('Failed to load more events:', error);
      setError('Failed to load more events. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildFilters, offset, isLoadingMore, hasMore, isLoadingInitial]);

  // Fetch when auth is confirmed and filters change (allow guests)
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
        router.push('/login');
        return;
      }
      loadFirstPage();
    }
  }, [isAuthenticated, authLoading, router, loadFirstPage]);

  // Ensure geolocation permission is requested and location obtained when entering the page
  useEffect(() => {
    let requested = false;
    if (!location && typeof window !== 'undefined' && !requested) {
      requested = true;
      requestLocation().catch(() => { });
    }
  }, []);

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

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        loadMore();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const sports = SPORTS_LIST;
  const distanceOptions = [10, 25, 50, 100]; // km

  if (authLoading) {
    return <Loading fullScreen text="Loading events..." />;
  }

  if (!isAuthenticated && !(typeof window !== 'undefined' && window.localStorage.getItem('guest-session') === '1')) {
    return <Loading fullScreen text="Redirecting to login..." />;
  }

  return (
    <>
      <Navigation />
      <Container size="lg" py="xl">
        {/* Header */}
        <div className="mb-8">
          <Title order={2} mb={6}>Discover Events</Title>
          <Text c="dimmed">Find pickup games and tournaments {location ? 'near you' : 'in your area'}</Text>
        </div>

        {/* Controls */}
        <div className="space-y-6 mb-8">
          {/* Location and Search */}
          <Group justify="space-between" align="stretch" gap="md" wrap="wrap">
            <Group align="center" gap="md" style={{ flex: 1, minWidth: 320 }}>
              <div style={{ minWidth: 270 }}>
                <LocationSearch />
              </div>
              <div style={{ flex: 1, minWidth: 240, maxWidth: 520 }}>
                <TextInput
                  placeholder="Search events by title, location, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.currentTarget.value)}
                  leftSection={<span aria-hidden>🔍</span>}
                  rightSection={searchTerm ? (
                    <button onClick={() => setSearchTerm('')} aria-label="Clear search">✕</button>
                  ) : null}
                />
              </div>
            </Group>
            {!isGuest && (
              <Button onClick={() => setShowCreateModal(true)} leftSection={<span>+</span>}>
                Create Event
              </Button>
            )}
          </Group>

          {/* Event Type Filter */}
          <Group gap="sm" align="center">
            <Text size="sm" fw={500}>Event Type:</Text>
            <Chip.Group
              multiple
              value={selectedEventTypes}
              onChange={(vals) => setSelectedEventTypes(vals as ('pickup' | 'tournament' | 'league')[])}
            >
              <Chip value="pickup">🏐 Pickup Games</Chip>
              <Chip value="tournament">🏆 Tournaments</Chip>
              <Chip value="league">🏟️ Leagues</Chip>
            </Chip.Group>
          </Group>

          {/* Distance Filter */}
          {location && (
            <Group gap="sm" align="center">
              <Text size="sm" fw={500}>Distance:</Text>
              <SegmentedControl
                value={String(maxDistance)}
                onChange={(v: string) => setMaxDistance(parseInt(v))}
                data={distanceOptions.map(d => ({ label: `${d}km`, value: String(d) }))}
              />
            </Group>
          )}

        {/* Sports Filter */}
        <Group gap="sm" align="center">
          <Text size="sm" fw={500}>Sports:</Text>
          <Chip.Group multiple value={selectedSports} onChange={(vals: any) => setSelectedSports(vals)}>
            {sports.map((sport) => (
              <Chip key={sport} value={sport}>{sport}</Chip>
            ))}
          </Chip.Group>
        </Group>
      </div>

        {/* Error Display */}
        {error && (
          <Alert color="red" variant="light" mb="md">
            <Group justify="space-between" wrap="wrap">
              <Text>{error}</Text>
              <Button variant="subtle" color="red" onClick={() => loadFirstPage()}>Try again</Button>
            </Group>
          </Alert>
        )}

        {/* Results */}
        <div className="mb-4">
          <Text size="sm" c="dimmed">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} loaded
            {searchQuery && ` for "${searchQuery}"`}
            {selectedCategory !== 'All' && ` in ${selectedCategory}`}
            {location && ` within ${maxDistance}km`}
          </Text>
        </div>

        {/* Events Grid */}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {isLoadingInitial ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Paper key={`skeleton-${i}`} withBorder h={500} p="md" radius="md">
                <Paper h={192} radius="md" className="skeleton" />
              </Paper>
            ))
          ) : filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <EventCard
                key={event.$id}
                event={event}
                onClick={() => handleEventClick(event)}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10m4-10v10m-4 4h4M4 7h16a2 2 0 012-2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No events found</h3>
              <p className="text-gray-600 mb-4">
                {location
                  ? `Try increasing your search radius or adjusting your filters.`
                  : 'Set your location to find events near you, or adjust your search filters.'
                }
              </p>
              <div className="space-x-4">
                {location && (
                  <Button onClick={() => setMaxDistance(maxDistance * 2)}>Expand Search Radius</Button>
                )}
                <Button variant="default"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedEventTypes(['pickup', 'tournament', 'league']);
                    setSelectedSports([]);
                    router.push('/events');
                  }}
                >
                  Clear All Filters
                </Button>
              </div>
            </div>
          )}
        </SimpleGrid>
        {/* Loading more indicator */}
        {!isLoadingInitial && hasMore && (
          <Group justify="center" py="lg">
            <Loader size="sm" />
            <Text c="dimmed" size="sm">Loading more…</Text>
          </Group>
        )}
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="col-span-full h-1" />
      </Container>
      <EventDetailModal
        event={selectedEvent!}
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
      />
      {user && (
        <EventCreationModal
          isOpen={showCreateModal}
          editingEvent={resumePreviewEvent ?? undefined}
          onClose={() => {
            setShowCreateModal(false);
            setResumePreviewEvent(null);
          }}
          onEventCreated={() => {
            setShowCreateModal(false);
            setResumePreviewEvent(null);
          }}
          currentUser={user}
          organization={null}
        />
      )}
    </>
  );
}
