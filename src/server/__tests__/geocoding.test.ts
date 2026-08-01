/** @jest-environment node */

import {
  clearGeocodeAddressCacheForTests,
  geocodeAddressToCoordinates,
  isValidGeocodeCoordinates,
  resolveAddressToPlace,
} from '@/server/geocoding';

describe('server geocoding', () => {
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    clearGeocodeAddressCacheForTests();
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearGeocodeAddressCacheForTests();
    if (originalGoogleMapsApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    }
  });

  it('resolves a place through Google Places Text Search first', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [{
          id: 'place_1',
          displayName: { text: 'Major R. Owens Health & Wellness Community Center' },
          formattedAddress: '1561 Bedford Ave, Brooklyn, NY 11225, USA',
          location: { latitude: 40.6681, longitude: -73.9558 },
        }],
      }),
    } as Response);

    await expect(resolveAddressToPlace('1561 Bedford Ave, Brooklyn, NY 11225')).resolves.toEqual({
      query: '1561 Bedford Ave, Brooklyn, NY 11225',
      status: 'RESOLVED',
      provider: 'GOOGLE_PLACES_TEXT_SEARCH',
      coordinates: [-73.9558, 40.6681],
      formattedAddress: '1561 Bedford Ave, Brooklyn, NY 11225, USA',
      placeId: 'place_1',
      displayName: 'Major R. Owens Health & Wellness Community Center',
      attempts: [{ provider: 'GOOGLE_PLACES_TEXT_SEARCH', status: 'RESOLVED', httpStatus: 200 }],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-google-key',
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
        }),
        body: JSON.stringify({
          textQuery: '1561 Bedford Ave, Brooklyn, NY 11225',
          languageCode: 'en',
        }),
      }),
    );
  });

  it('falls back to Google Geocoding when Places has no result', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ places: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          results: [{
            place_id: 'geocode_place_1',
            formatted_address: '205 NE 92nd Ave, Portland, OR 97220, USA',
            geometry: { location: { lat: 45.523, lng: -122.676 } },
          }],
        }),
      } as Response);

    await expect(geocodeAddressToCoordinates('205 NE 92nd Avenue Portland')).resolves.toEqual([
      -122.676,
      45.523,
    ]);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://maps.googleapis.com/maps/api/geocode/json?address=205%20NE%2092nd%20Avenue%20Portland&key=test-google-key',
    );
  });

  it('caches successful repeated address lookups', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [{ location: { latitude: 45.523, longitude: -122.676 } }],
      }),
    } as Response);

    await geocodeAddressToCoordinates('205 NE 92nd Avenue Portland');
    await geocodeAddressToCoordinates(' 205 NE 92nd Avenue Portland ');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a diagnostic result when the server key is missing', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(resolveAddressToPlace('205 NE 92nd Avenue Portland')).resolves.toEqual(
      expect.objectContaining({
        status: 'NO_API_KEY',
        provider: null,
        coordinates: null,
      }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not cache transient request failures', async () => {
    jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('places unavailable'))
      .mockRejectedValueOnce(new Error('geocoding unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          places: [{ location: { latitude: 40.7128, longitude: -74.006 } }],
        }),
      } as Response);

    await expect(resolveAddressToPlace('New York, NY')).resolves.toEqual(
      expect.objectContaining({ status: 'NETWORK_ERROR', coordinates: null }),
    );
    await expect(resolveAddressToPlace('New York, NY')).resolves.toEqual(
      expect.objectContaining({ status: 'RESOLVED', coordinates: [-74.006, 40.7128] }),
    );

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects missing, out-of-range, and zero coordinate pairs', () => {
    expect(isValidGeocodeCoordinates(null)).toBe(false);
    expect(isValidGeocodeCoordinates([0, 0])).toBe(false);
    expect(isValidGeocodeCoordinates([-181, 40])).toBe(false);
    expect(isValidGeocodeCoordinates([-74.006, 40.7128])).toBe(true);
  });
});
