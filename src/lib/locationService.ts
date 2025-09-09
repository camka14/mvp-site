export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationInfo extends LocationCoordinates {
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

class LocationService {
  private googleApiKey?: string;
  private placesLoaded?: Promise<void>;

  constructor() {
    this.googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  }

  private ensureBrowser(): asserts this is LocationService {
    if (typeof window === 'undefined') {
      throw new Error('Google Places is only available in the browser');
    }
  }

  private loadPlacesLibrary(): Promise<void> {
    this.ensureBrowser();
    if ((window as any).google?.maps?.places) return Promise.resolve();
    if (this.placesLoaded) return this.placesLoaded;
    if (!this.googleApiKey) {
      return Promise.reject(new Error('Google Maps API key not configured'));
    }
    this.placesLoaded = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-source="gmaps-places"]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
        return;
      }
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.defer = true;
      script.dataset.source = 'gmaps-places';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.googleApiKey}&libraries=places&v=weekly`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    });
    return this.placesLoaded;
  }

  // Get user's current location using browser geolocation
  async getCurrentLocation(): Promise<LocationCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // Cache for 5 minutes
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          let errorMessage = 'Unable to retrieve location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied by user';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }
          reject(new Error(errorMessage));
        },
        options
      );
    });
  }

  // Convert city/zip to coordinates using Google Geocoding API
  async geocodeLocation(location: string): Promise<LocationInfo> {
    if (!this.googleApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${this.googleApiKey}`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }

      const data = await response.json();
      
      if (data.status !== 'OK' || !data.results.length) {
        throw new Error('Location not found');
      }

      const result = data.results[0];
      const location_info: LocationInfo = {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng
      };

      // Extract city, state, zipCode from address components
      result.address_components?.forEach((component: any) => {
        const types = component.types;
        if (types.includes('locality')) {
          location_info.city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          location_info.state = component.short_name;
        } else if (types.includes('postal_code')) {
          location_info.zipCode = component.long_name;
        } else if (types.includes('country')) {
          location_info.country = component.short_name;
        }
      });

      return location_info;
    } catch (error) {
      throw new Error(`Geocoding failed: ${error}`);
    }
  }

  // Reverse geocode coordinates to city/state/etc
  async reverseGeocode(lat: number, lng: number): Promise<LocationInfo> {
    if (!this.googleApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${this.googleApiKey}`
      );
      if (!response.ok) {
        throw new Error('Reverse geocoding request failed');
      }
      const data = await response.json();
      if (data.status !== 'OK' || !data.results.length) {
        throw new Error('Location not found');
      }
      const result = data.results[0];
      const info: LocationInfo = { lat, lng };
      result.address_components?.forEach((component: any) => {
        const types = component.types;
        if (types.includes('locality')) {
          info.city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          info.state = component.short_name;
        } else if (types.includes('postal_code')) {
          info.zipCode = component.long_name;
        } else if (types.includes('country')) {
          info.country = component.short_name;
        }
      });
      return info;
    } catch (error) {
      throw new Error(`Reverse geocoding failed: ${error}`);
    }
  }

  // Create an Autocomplete session token (kept client-side)
  createPlacesSessionToken(): any {
    if (typeof window === 'undefined') return null;
    const g = (window as any).google;
    if (!g?.maps?.places) return null;
    return new g.maps.places.AutocompleteSessionToken();
  }

  async getPlacePredictions(query: string, sessionToken?: any): Promise<Array<{ description: string; placeId: string }>> {
    this.ensureBrowser();
    if (!query.trim()) return [];
    await this.loadPlacesLibrary();
    const g = (window as any).google;
    const svc = new g.maps.places.AutocompleteService();
    const request: any = { input: query, types: ['(cities)'] };
    if (sessionToken) request.sessionToken = sessionToken;
    return new Promise((resolve, reject) => {
      svc.getPlacePredictions(request, (preds: any[], status: any) => {
        const ok = g.maps.places.PlacesServiceStatus.OK;
        const zero = g.maps.places.PlacesServiceStatus.ZERO_RESULTS;
        if (status !== ok && status !== zero) {
          reject(new Error(`Places autocomplete failed: ${status}`));
          return;
        }
        resolve((preds || []).map((p: any) => ({ description: p.description, placeId: p.place_id })));
      });
    });
  }

  // Place Details via PlacesService
  async getPlaceDetails(placeId: string, sessionToken?: any): Promise<LocationInfo> {
    this.ensureBrowser();
    await this.loadPlacesLibrary();
    const g = (window as any).google;
    const container = document.createElement('div');
    const svc = new g.maps.places.PlacesService(container);
    const req: any = { placeId, fields: ['geometry.location', 'address_components'] };
    if (sessionToken) req.sessionToken = sessionToken;
    return new Promise((resolve, reject) => {
      svc.getDetails(req, (result: any, status: any) => {
        if (status !== g.maps.places.PlacesServiceStatus.OK || !result) {
          reject(new Error(`Place details error: ${status}`));
          return;
        }
        const info: LocationInfo = {
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng()
        };
        result.address_components?.forEach((component: any) => {
          const types = component.types;
          if (types.includes('locality')) {
            info.city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            info.state = component.short_name;
          } else if (types.includes('postal_code')) {
            info.zipCode = component.long_name;
          } else if (types.includes('country')) {
            info.country = component.short_name;
          }
        });
        resolve(info);
      });
    });
  }

  // Calculate distance between two points using Haversine formula
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Convert distance to miles
  kmToMiles(km: number): number {
    return km * 0.621371;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const locationService = new LocationService();
