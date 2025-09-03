'use client';

import { useState } from 'react';
import { useLocation } from '@/app/hooks/useLocation';

interface LocationSearchProps {
  onLocationChange: (location: any) => void;
}

export default function LocationSearch({ onLocationChange }: LocationSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const { location, locationInfo, loading, error, requestLocation, searchLocation, clearLocation } = useLocation();

  const handleUseCurrentLocation = async () => {
    await requestLocation();
    if (location) {
      onLocationChange(location);
    }
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    await searchLocation(searchQuery);
    setShowLocationOptions(false);
  };

  const handleClearLocation = () => {
    clearLocation();
    onLocationChange(null);
    setShowLocationOptions(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowLocationOptions(!showLocationOptions)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm">
          {locationInfo?.city ? `${locationInfo.city}, ${locationInfo.state}` : 'Set Location'}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showLocationOptions && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4 space-y-4">
            {/* Current Location Button */}
            <button
              onClick={handleUseCurrentLocation}
              disabled={loading}
              className="w-full flex items-center space-x-2 px-3 py-2 text-left hover:bg-gray-50 rounded-md transition-colors duration-200"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className="text-sm">
                {loading ? 'Getting location...' : 'Use Current Location'}
              </span>
            </button>

            {/* Search Form */}
            <form onSubmit={handleSearchLocation} className="space-y-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter city, state, or ZIP code"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading || !searchQuery.trim()}
                className="w-full btn-primary text-sm py-2"
              >
                {loading ? 'Searching...' : 'Search Location'}
              </button>
            </form>

            {/* Current Location Display */}
            {locationInfo && (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Current: {locationInfo.city}, {locationInfo.state}
                  </span>
                  <button
                    onClick={handleClearLocation}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
