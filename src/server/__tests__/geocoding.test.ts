/** @jest-environment node */

import {
  clearGeocodeAddressCacheForTests,
  geocodeAddressToCoordinates,
} from '@/server/geocoding';

describe('server geocoding', () => {
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalNextPublicGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    clearGeocodeAddressCacheForTests();
    process.env.GOOGLE_MAPS_API_KEY = '';
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-google-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: {
              location: {
                lat: 45.523,
                lng: -122.676,
              },
            },
          },
        ],
      }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearGeocodeAddressCacheForTests();
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }
    if (originalNextPublicGoogleMapsApiKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalNextPublicGoogleMapsApiKey;
    }
  });

  it('geocodes an address using Google and returns persisted event coordinates', async () => {
    await expect(geocodeAddressToCoordinates('205 NE 92nd Avenue Portland')).resolves.toEqual([
      -122.676,
      45.523,
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://maps.googleapis.com/maps/api/geocode/json?address=205%20NE%2092nd%20Avenue%20Portland&key=test-google-key',
    );
  });

  it('caches repeated address lookups', async () => {
    await geocodeAddressToCoordinates('205 NE 92nd Avenue Portland');
    await geocodeAddressToCoordinates(' 205 NE 92nd Avenue Portland ');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API key is missing', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = '';

    await expect(geocodeAddressToCoordinates('205 NE 92nd Avenue Portland')).resolves.toBeNull();

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
