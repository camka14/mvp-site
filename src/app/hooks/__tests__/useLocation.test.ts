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

  it('searches for a location via geocode', async () => {
    mockedLocationService.geocodeLocation.mockResolvedValue({
      lat: 51.5,
      lng: -0.12,
      city: 'London',
    });

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.searchLocation('London');
    });

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
});

