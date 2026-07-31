import { act, renderHook } from '@testing-library/react';
import { useLocation } from '../useLocation';
import { locationService } from '@/lib/locationService';

jest.mock('@/lib/locationService', () => ({
  locationService: {
    getCurrentLocation: jest.fn(),
    reverseGeocode: jest.fn(),
    geocodeLocation: jest.fn(),
  },
}));

const mockedLocationService = locationService as jest.Mocked<typeof locationService>;

describe('useLocation', () => {
  beforeEach(() => {
    mockedLocationService.getCurrentLocation.mockReset();
    mockedLocationService.reverseGeocode.mockReset();
    mockedLocationService.geocodeLocation.mockReset();
    localStorage.clear();
    (navigator as any).permissions = undefined;
  });

  it('initializes from saved location before effects run', () => {
    localStorage.setItem('user-location', JSON.stringify({ lat: 45.5, lng: -122.6 }));
    localStorage.setItem('user-location-info', JSON.stringify({
      lat: 45.5,
      lng: -122.6,
      city: 'Portland',
    }));

    const { result } = renderHook(() => useLocation());

    expect(result.current.location).toEqual({ lat: 45.5, lng: -122.6 });
    expect(result.current.locationInfo).toMatchObject({ city: 'Portland' });
  });

  it('requests current location and stores it', async () => {
    mockedLocationService.getCurrentLocation.mockResolvedValue({ lat: 40, lng: -105 });
    mockedLocationService.reverseGeocode.mockResolvedValue({
      lat: 40,
      lng: -105,
      city: 'Boulder',
    });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.location).toEqual({ lat: 40, lng: -105 });
    expect(result.current.locationInfo).toMatchObject({ city: 'Boulder' });
    expect(localStorage.getItem('user-location')).toBe(JSON.stringify({ lat: 40, lng: -105 }));
  });

  it('starts geolocation without awaiting the Permissions API', async () => {
    const permissionsQuery = jest.fn().mockResolvedValue({ state: 'prompt' });
    (navigator as Navigator & { permissions?: { query: jest.Mock } }).permissions = {
      query: permissionsQuery,
    };
    mockedLocationService.getCurrentLocation.mockResolvedValue({ lat: 45.58, lng: -122.35 });
    mockedLocationService.reverseGeocode.mockResolvedValue({
      lat: 45.58,
      lng: -122.35,
      city: 'Washougal',
      state: 'WA',
    });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(permissionsQuery).not.toHaveBeenCalled();
    expect(mockedLocationService.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(result.current.locationInfo).toMatchObject({ city: 'Washougal', state: 'WA' });
  });

  it('searches for a location via geocode', async () => {
    mockedLocationService.geocodeLocation.mockResolvedValue({
      lat: 51.5,
      lng: -0.12,
      city: 'London',
    });

    const { result } = renderHook(() => useLocation());

    let found = false;
    await act(async () => {
      found = await result.current.searchLocation('London');
    });

    expect(found).toBe(true);
    expect(mockedLocationService.geocodeLocation).toHaveBeenCalledWith('London');
    expect(result.current.location).toEqual({ lat: 51.5, lng: -0.12 });
    expect(result.current.locationInfo?.city).toBe('London');
  });

  it('clears stored location', async () => {
    mockedLocationService.geocodeLocation.mockResolvedValue({ lat: 10, lng: 10 });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.searchLocation('Somewhere');
      result.current.clearLocation();
    });

    expect(result.current.location).toBeNull();
    expect(localStorage.getItem('user-location')).toBeNull();
  });

  it('returns false and exposes the geocoder error when a location is not found', async () => {
    mockedLocationService.geocodeLocation.mockRejectedValue(new Error('Location not found'));

    const { result } = renderHook(() => useLocation());

    let found = true;
    await act(async () => {
      found = await result.current.searchLocation('not-a-real-place');
    });

    expect(found).toBe(false);
    expect(result.current.error).toBe('Location not found');
    expect(result.current.location).toBeNull();
  });
});
