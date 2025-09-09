'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Event, EventCategory } from '@/types';
import { eventService } from '@/lib/eventService';
import { useLocation } from '@/app/hooks/useLocation';
import Navigation from '@/components/layout/Navigation';
import SearchBar from '@/components/ui/SearchBar';
import EventCard from '@/components/ui/EventCard';
import LocationSearch from '@/components/ui/LocationSearch';
import Loading from '@/components/ui/Loading';
import EventDetailModal from './components/EventDetailModal';
import EventCreationModal from './components/EventCreationModal';

export default function EventsPage() {
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const { location, requestLocation } = useLocation();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'All' | EventCategory>('All');
  const [selectedEventTypes, setSelectedEventTypes] = useState<('pickup' | 'tournament')[]>(['pickup', 'tournament']);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const LIMIT = 18;

  const buildFilters = useCallback(() => ({
    category: selectedCategory === 'All' ? undefined : selectedCategory,
    eventTypes: selectedEventTypes.length === 2 ? undefined : selectedEventTypes,
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
      setEvents(page);
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
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const filters = buildFilters();
      const page = await eventService.getEventsPaginated(filters, LIMIT, offset);
      setEvents(prev => [...prev, ...page]);
      setOffset(prev => prev + page.length);
      setHasMore(page.length === LIMIT);
    } catch (error) {
      console.error('Failed to load more events:', error);
      setError('Failed to load more events. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildFilters, offset, isLoadingMore, hasMore]);

  // Fetch when auth is confirmed and filters change
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
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
      requestLocation().catch(() => {});
    }
  }, []);

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

  const handleEventTypeToggle = (eventType: 'pickup' | 'tournament') => {
    setSelectedEventTypes(prev => {
      if (prev.includes(eventType)) {
        return prev.filter(type => type !== eventType);
      } else {
        return [...prev, eventType];
      }
    });
  };

  const categories = ['All', 'Volleyball', 'Soccer', 'Basketball', 'Tennis', 'Pickleball', 'Swimming', 'Football'] as const;
  const sports = ['Volleyball', 'Soccer', 'Basketball', 'Tennis', 'Pickleball', 'Swimming', 'Football']; // You can populate this dynamically
  const distanceOptions = [10, 25, 50, 100]; // km

  if (authLoading) {
    return <Loading fullScreen text="Loading events..." />;
  }

  if (!isAuthenticated) {
    return <Loading fullScreen text="Redirecting to login..." />;
  }

  return (
    <>
      <Navigation />
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover Events</h1>
          <p className="text-gray-600">
            Find pickup games and tournaments {location ? 'near you' : 'in your area'}
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-6 mb-8">
          {/* Location and Search */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-1/3">
              <LocationSearch />
            </div>
            <div className="flex-1">
              <SearchBar defaultValue={searchQuery} />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md flex items-center"
            >
              <span className="mr-2">+</span>
              Create Event
            </button>
          </div>

          {/* Event Type Filter */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Event Type:</span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleEventTypeToggle('pickup')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${selectedEventTypes.includes('pickup')
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                🏐 Pickup Games
              </button>
              <button
                onClick={() => handleEventTypeToggle('tournament')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${selectedEventTypes.includes('tournament')
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                🏆 Tournaments
              </button>
            </div>
          </div>

          {/* Distance Filter */}
          {location && (
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Distance:</span>
              <div className="flex space-x-2">
                {distanceOptions.map((distance) => (
                  <button
                    key={distance}
                    onClick={() => setMaxDistance(distance)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${maxDistance === distance
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                  >
                    {distance}km
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${selectedCategory === category
                  ? 'bg-blue-600 text-white elevation-2'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => loadFirstPage()}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            {events.length} event{events.length !== 1 ? 's' : ''} loaded
            {searchQuery && ` for "${searchQuery}"`}
            {selectedCategory !== 'All' && ` in ${selectedCategory}`}
            {location && ` within ${maxDistance}km`}
          </p>
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch auto-rows-fr">
          {isLoadingInitial ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="card h-[420px] flex flex-col">
                <div className="relative h-48 skeleton" />
                <div className="card-content flex-1 flex flex-col">
                  <div className="h-5 w-3/4 skeleton mb-2" />
                  <div className="h-4 w-full skeleton mb-2" />
                  <div className="h-4 w-5/6 skeleton mb-4" />
                  <div className="mt-auto flex items-center justify-between">
                    <div className="h-4 w-1/2 skeleton" />
                    <div className="h-3 w-12 skeleton" />
                  </div>
                </div>
              </div>
            ))
          ) : events.length > 0 ? (
            events.map((event) => (
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
                  <button
                    onClick={() => setMaxDistance(maxDistance * 2)}
                    className="btn-primary"
                  >
                    Expand Search Radius
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedEventTypes(['pickup', 'tournament']);
                    setSelectedSports([]);
                    router.push('/events');
                  }}
                  className="btn-secondary"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Loading more indicator */}
        {!isLoadingInitial && hasMore && (
          <div className="col-span-full flex justify-center py-6">
            <div className="flex items-center space-x-2 text-gray-500">
              <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              <span className="text-sm">Loading more…</span>
            </div>
          </div>
        )}
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="col-span-full h-1" />
      </div>
      <EventDetailModal
        event={selectedEvent!}
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
      />
      <EventCreationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onEventCreated={(event) => {
          setShowCreateModal(false);
        }}
        currentUser={user}
      />
    </>
  );
}
