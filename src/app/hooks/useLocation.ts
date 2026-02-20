import { useState, useEffect, useCallback } from 'react';
import { LocationCoordinates, LocationInfo, locationService } from '@/lib/locationService';

// Shared store to keep location in sync across hook consumers
type Listener = (loc: LocationCoordinates | null, info: LocationInfo | null) => void;
const listeners = new Set<Listener>();
let sharedLocation: LocationCoordinates | null = null;
let sharedLocationInfo: LocationInfo | null = null;

const notifyAll = () => {
  listeners.forEach(fn => fn(sharedLocation, sharedLocationInfo));
};

interface UseLocationReturn {
  location: LocationCoordinates | null;
  locationInfo: LocationInfo | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<void>;
  searchLocation: (query: string) => Promise<void>;
  clearLocation: () => void;
  setLocationFromInfo: (info: LocationInfo) => void;
}

export function useLocation(): UseLocationReturn {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved location from localStorage
  useEffect(() => {
    // Initialize from shared store if available, otherwise from localStorage
    const savedLocation = localStorage.getItem('user-location');
    const savedLocationInfo = localStorage.getItem('user-location-info');

    if (sharedLocation) {
      setLocation(sharedLocation);
    } else if (savedLocation) {
      try {
        const parsed = JSON.parse(savedLocation);
        sharedLocation = parsed;
        setLocation(parsed);
      } catch {}
    }

    if (sharedLocationInfo) {
      setLocationInfo(sharedLocationInfo);
    } else if (savedLocationInfo) {
      try {
        const parsedInfo = JSON.parse(savedLocationInfo);
        sharedLocationInfo = parsedInfo;
        setLocationInfo(parsedInfo);
      } catch {}
    }

    // Subscribe to shared updates
    const listener: Listener = (loc, info) => {
      setLocation(loc);
      setLocationInfo(info);
    };
    listeners.add(listener);

    // Subscribe to window-level location change events for cross-bundle safety
    const onWindowLocationChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ loc: LocationCoordinates | null; info: LocationInfo | null }>).detail;
      if (detail) {
        setLocation(detail.loc);
        setLocationInfo(detail.info);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('user-location-changed', onWindowLocationChanged as EventListener);
    }
    return () => {
      listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('user-location-changed', onWindowLocationChanged as EventListener);
      }
    };
  }, []);

  const requestLocation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check permission if Permissions API is available
      if (typeof navigator !== 'undefined' && (navigator as any).permissions && (navigator as any).permissions.query) {
        try {
          const status = await (navigator as any).permissions.query({ name: 'geolocation' as PermissionName });
          if (status.state === 'denied') {
            setError('Location permission denied. Enable it in your browser settings.');
            setLoading(false);
            return;
          }
          // If 'prompt' or 'granted', proceed to request/get location
        } catch {
          // Ignore permission check failures and fallback to requesting
        }
      }

      const coords = await locationService.getCurrentLocation();
      // Reverse geocode to get city/state/etc
      let info: LocationInfo = { ...coords };
      try {
        info = await locationService.reverseGeocode(coords.lat, coords.lng);
      } catch {
        // Best-effort fallback keeps coords only
      }
      setLocation(coords);
      setLocationInfo(info);
      // Update shared store and notify
      sharedLocation = coords;
      sharedLocationInfo = info;
      notifyAll();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('user-location-changed', { detail: { loc: coords, info } }));
      }

      // Save to localStorage
      localStorage.setItem('user-location', JSON.stringify(coords));
      localStorage.setItem('user-location-info', JSON.stringify(info));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    } finally {
      setLoading(false);
    }
  }, []);

  const searchLocation = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const locationData = await locationService.geocodeLocation(query);
      const coords = { lat: locationData.lat, lng: locationData.lng };
      setLocation(coords);
      setLocationInfo(locationData);
      // Update shared store and notify
      sharedLocation = coords;
      sharedLocationInfo = locationData;
      notifyAll();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('user-location-changed', { detail: { loc: coords, info: locationData } }));
      }

      // Save to localStorage
      localStorage.setItem('user-location', JSON.stringify(coords));
      localStorage.setItem('user-location-info', JSON.stringify(locationData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find location');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setLocationInfo(null);
    setError(null);
    // Update shared store and notify
    sharedLocation = null;
    sharedLocationInfo = null;
    notifyAll();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user-location-changed', { detail: { loc: null, info: null } }));
    }
    localStorage.removeItem('user-location');
    localStorage.removeItem('user-location-info');
  }, []);

  const setLocationFromInfo = useCallback((info: LocationInfo) => {
    const coords = { lat: info.lat, lng: info.lng };
    setLocation(coords);
    setLocationInfo(info);
    sharedLocation = coords;
    sharedLocationInfo = info;
    notifyAll();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user-location-changed', { detail: { loc: coords, info } }));
    }
    localStorage.setItem('user-location', JSON.stringify(coords));
    localStorage.setItem('user-location-info', JSON.stringify(info));
  }, []);

  return {
    location,
    locationInfo,
    loading,
    error,
    requestLocation,
    searchLocation,
    clearLocation,
    setLocationFromInfo
  };
}
