'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '../lib/auth';
import SearchBar from '../components/SearchBar';
import EventCard from '../components/EventCard';

// Mock events data - replace with actual Appwrite database queries
const mockEvents = [
  {
    id: '1',
    title: 'Tech Conference 2025',
    description: 'Annual technology conference featuring the latest innovations',
    date: '2025-03-15',
    time: '09:00 AM',
    location: 'Seattle Convention Center',
    category: 'Technology',
    attendees: 150,
    image: '/api/placeholder/400/200'
  },
  {
    id: '2',
    title: 'Music Festival Downtown',
    description: 'Live music festival with local and international artists',
    date: '2025-04-20',
    time: '06:00 PM',
    location: 'Downtown Park',
    category: 'Music',
    attendees: 500,
    image: '/api/placeholder/400/200'
  },
  {
    id: '3',
    title: 'Food & Wine Tasting',
    description: 'Culinary experience with local chefs and wine experts',
    date: '2025-03-25',
    time: '07:00 PM',
    location: 'Riverside Restaurant',
    category: 'Food',
    attendees: 80,
    image: '/api/placeholder/400/200'
  },
  {
    id: '4',
    title: 'Art Gallery Opening',
    description: 'Modern art exhibition featuring emerging artists',
    date: '2025-04-10',
    time: '05:00 PM',
    location: 'Metro Art Gallery',
    category: 'Art',
    attendees: 120,
    image: '/api/placeholder/400/200'
  },
];

export default function EventsPage() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState(mockEvents);
  const [filteredEvents, setFilteredEvents] = useState(mockEvents);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    filterEvents();
  }, [searchQuery, selectedCategory, events]);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = () => {
    let filtered = events;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(event =>
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(event => event.category === selectedCategory);
    }

    setFilteredEvents(filtered);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const categories = ['All', 'Technology', 'Music', 'Food', 'Art', 'Sports', 'Business'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">EventFinder</h1>
              {user && (
                <span className="text-sm text-gray-600">Welcome, {user.name}!</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="mb-8">
          <SearchBar defaultValue={searchQuery} />
        </div>

        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.length > 0 ? (
            filteredEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500 text-lg">No events found matching your criteria.</p>
              <p className="text-gray-400 mt-2">Try adjusting your search or category filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
