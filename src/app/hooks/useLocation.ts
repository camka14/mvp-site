import { useState, useEffect } from 'react';
import { LocationCoordinates, LocationInfo, locationService } from '@/lib/locationService';

interface UseLocationReturn {
  location: LocationCoordinates | null;
  locationInfo: LocationInfo | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<void>;
  searchLocation: (query: string) => Promise<void>;
  clearLocation: () => void;
}

export function useLocation(): UseLocationReturn {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved location from localStorage
  useEffect(() => {
    const savedLocation = localStorage.getItem('user-location');
    const savedLocationInfo = localStorage.getItem('user-location-info');
    
    if (savedLocation) {
      setLocation(JSON.parse(savedLocation));
    }
    if (savedLocationInfo) {
      setLocationInfo(JSON.parse(savedLocationInfo));
    }
  }, []);

  const requestLocation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const coords = await locationService.getCurrentLocation();
      setLocation(coords);
      setLocationInfo(coords);
      
      // Save to localStorage
      localStorage.setItem('user-location', JSON.stringify(coords));
      localStorage.setItem('user-location-info', JSON.stringify(coords));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    } finally {
      setLoading(false);
    }
  };

  const searchLocation = async (query: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const locationData = await locationService.geocodeLocation(query);
      setLocation({ lat: locationData.lat, lng: locationData.lng });
      setLocationInfo(locationData);
      
      // Save to localStorage
      localStorage.setItem('user-location', JSON.stringify({ lat: locationData.lat, lng: locationData.lng }));
      localStorage.setItem('user-location-info', JSON.stringify(locationData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find location');
    } finally {
      setLoading(false);
    }
  };

  const clearLocation = () => {
    setLocation(null);
    setLocationInfo(null);
    setError(null);
    localStorage.removeItem('user-location');
    localStorage.removeItem('user-location-info');
  };

  return {
    location,
    locationInfo,
    loading,
    error,
    requestLocation,
    searchLocation,
    clearLocation
  };
}
