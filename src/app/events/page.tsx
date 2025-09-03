'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Event } from '@/types';
import Navigation from '@/components/layout/Navigation';
import SearchBar from '@/components/ui/SearchBar';
import EventCard from '@/components/ui/EventCard';
import Loading from '@/components/ui/Loading';

// Mock data - replace with actual API calls
const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Beach Volleyball Tournament',
    description: 'Annual beach volleyball tournament featuring teams from across the region. Perfect for competitive players looking to test their skills.',
    date: '2025-03-15',
    time: '09:00 AM',
    location: 'Santa Monica Beach',
    category: 'Volleyball',
    attendees: 24,
    maxAttendees: 32,
    price: 25,
    image: '/api/placeholder/400/200',
    organizerId: 'user1',
    status: 'published',
    createdAt: '2025-02-01',
    updatedAt: '2025-02-01'
  },
  // ... other mock events
];

export default function EventsPage() {
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'All' | Event['category']>('All');
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      loadEvents();
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    filterEvents();
  }, [searchQuery, selectedCategory, events]);

  const loadEvents = async () => {
    try {
      // TODO: Replace with actual API call
      setEvents(mockEvents);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = () => {
    let filtered = events;

    if (searchQuery) {
      filtered = filtered.filter(event =>
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(event => event.category === selectedCategory);
    }

    setFilteredEvents(filtered);
  };

  const categories = ['All', 'Volleyball', 'Soccer', 'Basketball', 'Tennis', 'Pickleball', 'Swimming', 'Football'] as const;

  if (authLoading || loading) {
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
          <p className="text-gray-600">Find and join exciting sports events in your area</p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <SearchBar defaultValue={searchQuery} />
        </div>

        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white elevation-2'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} found
            {searchQuery && ` for "${searchQuery}"`}
            {selectedCategory !== 'All' && ` in ${selectedCategory}`}
          </p>
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4v10m4-10v10m-4 4h4M4 7h16a2 2 0 012-2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No events found</h3>
              <p className="text-gray-600 mb-4">Try adjusting your search or category filter.</p>
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  router.push('/events');
                }}
                className="btn-primary"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
