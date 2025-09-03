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

  constructor() {
    this.googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
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
