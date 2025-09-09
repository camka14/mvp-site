'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from '@/app/hooks/useLocation';
import { locationService } from '@/lib/locationService';
import { useDebounce } from '@/app/hooks/useDebounce';

export default function LocationSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLocationOptions, setShowLocationOptions] = useState(false);
  const [predictions, setPredictions] = useState<Array<{ description: string; placeId: string }>>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<any | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  const { location, locationInfo, loading, error, requestLocation, clearLocation, setLocationFromInfo } = useLocation();

  const handleUseCurrentLocation = async () => {
    await requestLocation();
  };

  const startSession = () => {
    if (!sessionToken) setSessionToken(locationService.createPlacesSessionToken());
  };
  const endSession = () => {
    setSessionToken(null);
    setPredictions([]);
    setSearchQuery('');
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // If user pressed Enter on a typed query without selecting a prediction, fallback to geocode
    try {
      const info = await locationService.geocodeLocation(searchQuery);
      setLocationFromInfo(info);
      setShowLocationOptions(false);
      endSession();
    } catch (e) {
      // ignore; error surfaced via hook if needed
    }
  };

  const handleClearLocation = () => {
    clearLocation();
    setShowLocationOptions(false);
    endSession();
  };

  // Fetch predictions when query changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!debouncedQuery || !showLocationOptions) {
        setPredictions([]);
        return;
      }
      try {
        setPredictionsLoading(true);
        const preds = await locationService.getPlacePredictions(debouncedQuery, sessionToken || undefined);
        if (!cancelled) setPredictions(preds);
      } catch (e) {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setPredictionsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedQuery, sessionToken, showLocationOptions]);

  const selectPrediction = async (placeId: string) => {
    try {
      const info = await locationService.getPlaceDetails(placeId, sessionToken || undefined);
      setLocationFromInfo(info);
      setShowLocationOptions(false);
    } catch (e) {
      // noop
    } finally {
      endSession();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setShowLocationOptions(!showLocationOptions); if (!showLocationOptions) startSession(); }}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm">
          {locationInfo?.city ? `${locationInfo.city}, ${locationInfo.state || ''}`.trim().replace(/,\s*$/, '') : 'Set Location'}
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

            {/* Autocomplete suggestions */}
            {(predictionsLoading || predictions.length > 0) && (
              <div className="border-t border-gray-200 pt-2 max-h-60 overflow-auto">
                {predictionsLoading && (
                  <div className="text-xs text-gray-500 px-2 py-1">Loading suggestions…</div>
                )}
                {predictions.map((p) => (
                  <button
                    key={p.placeId}
                    type="button"
                    onClick={() => selectPrediction(p.placeId)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md text-sm flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {p.description}
                  </button>
                ))}
              </div>
            )}

            {/* Current Location Display */}
            {locationInfo && (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Current: {locationInfo.city}{locationInfo.state ? `, ${locationInfo.state}` : ''}
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
