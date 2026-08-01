export type GeocodeCoordinates = [number, number];

export type GoogleLocationProvider = 'GOOGLE_PLACES_TEXT_SEARCH' | 'GOOGLE_GEOCODING';

export type GoogleLocationStatus =
  | 'RESOLVED'
  | 'NO_API_KEY'
  | 'ZERO_RESULTS'
  | 'REQUEST_DENIED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';

export type GoogleLocationAttempt = {
  provider: GoogleLocationProvider;
  status: GoogleLocationStatus;
  httpStatus?: number;
  message?: string;
};

export type GooglePlaceResolution = {
  query: string;
  status: GoogleLocationStatus;
  provider: GoogleLocationProvider | null;
  coordinates: GeocodeCoordinates | null;
  formattedAddress: string | null;
  placeId: string | null;
  displayName: string | null;
  attempts: GoogleLocationAttempt[];
};

type GooglePlacesTextSearchResponse = {
  places?: Array<{
    id?: unknown;
    formattedAddress?: unknown;
    displayName?: { text?: unknown };
    location?: {
      latitude?: unknown;
      longitude?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
    status?: unknown;
  };
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: unknown;
  results?: Array<{
    place_id?: unknown;
    formatted_address?: unknown;
    geometry?: {
      location?: {
        lat?: unknown;
        lng?: unknown;
      };
    };
  }>;
};

type ProviderResolution = {
  attempt: GoogleLocationAttempt;
  coordinates: GeocodeCoordinates | null;
  formattedAddress: string | null;
  placeId: string | null;
  displayName: string | null;
};

const locationCache = new Map<string, GooglePlaceResolution>();

const googleMapsApiKey = (): string | null => {
  const trimmed = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? '';
  return trimmed.length ? trimmed : null;
};

const normalizeAddress = (address: string): string => (
  address.replace(/\s+/g, ' ').trim()
);

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const isValidGeocodeCoordinates = (value: unknown): value is GeocodeCoordinates => {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lng)
    && Number.isFinite(lat)
    && Math.abs(lng) <= 180
    && Math.abs(lat) <= 90
    && !(lng === 0 && lat === 0);
};

const coordinatesFromValues = (longitude: unknown, latitude: unknown): GeocodeCoordinates | null => {
  const coordinates = [Number(longitude), Number(latitude)];
  return isValidGeocodeCoordinates(coordinates) ? coordinates : null;
};

const safeJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
};

const httpFailureStatus = (response: Response): GoogleLocationStatus => (
  response.status === 401 || response.status === 403 ? 'REQUEST_DENIED' : 'UPSTREAM_ERROR'
);

const resolveWithPlaces = async (query: string, apiKey: string): Promise<ProviderResolution> => {
  const provider = 'GOOGLE_PLACES_TEXT_SEARCH' as const;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'en' }),
    });
    const payload = await safeJson<GooglePlacesTextSearchResponse>(response);
    if (!response.ok) {
      return {
        attempt: {
          provider,
          status: httpFailureStatus(response),
          httpStatus: response.status,
          message: nullableString(payload?.error?.message) ?? `Google Places returned HTTP ${response.status}.`,
        },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }
    if (!payload) {
      return {
        attempt: { provider, status: 'INVALID_RESPONSE', httpStatus: response.status },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }

    const place = payload.places?.[0];
    if (!place) {
      return {
        attempt: { provider, status: 'ZERO_RESULTS', httpStatus: response.status },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }
    const coordinates = coordinatesFromValues(place.location?.longitude, place.location?.latitude);
    if (!coordinates) {
      return {
        attempt: {
          provider,
          status: 'INVALID_RESPONSE',
          httpStatus: response.status,
          message: 'Google Places returned a place without valid non-zero coordinates.',
        },
        coordinates: null,
        formattedAddress: nullableString(place.formattedAddress),
        placeId: nullableString(place.id),
        displayName: nullableString(place.displayName?.text),
      };
    }

    return {
      attempt: { provider, status: 'RESOLVED', httpStatus: response.status },
      coordinates,
      formattedAddress: nullableString(place.formattedAddress),
      placeId: nullableString(place.id),
      displayName: nullableString(place.displayName?.text),
    };
  } catch (error) {
    return {
      attempt: {
        provider,
        status: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Google Places request failed.',
      },
      coordinates: null,
      formattedAddress: null,
      placeId: null,
      displayName: null,
    };
  }
};

const resolveWithGeocoding = async (query: string, apiKey: string): Promise<ProviderResolution> => {
  const provider = 'GOOGLE_GEOCODING' as const;
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`,
    );
    const payload = await safeJson<GoogleGeocodeResponse>(response);
    if (!response.ok) {
      return {
        attempt: {
          provider,
          status: httpFailureStatus(response),
          httpStatus: response.status,
          message: nullableString(payload?.error_message) ?? `Google Geocoding returned HTTP ${response.status}.`,
        },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }
    if (!payload) {
      return {
        attempt: { provider, status: 'INVALID_RESPONSE', httpStatus: response.status },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }
    if (payload.status !== 'OK') {
      const status: GoogleLocationStatus = payload.status === 'ZERO_RESULTS'
        ? 'ZERO_RESULTS'
        : ['REQUEST_DENIED', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT'].includes(payload.status ?? '')
          ? 'REQUEST_DENIED'
          : 'UPSTREAM_ERROR';
      return {
        attempt: {
          provider,
          status,
          httpStatus: response.status,
          message: nullableString(payload.error_message) ?? nullableString(payload.status) ?? undefined,
        },
        coordinates: null,
        formattedAddress: null,
        placeId: null,
        displayName: null,
      };
    }

    const result = payload.results?.[0];
    const coordinates = coordinatesFromValues(
      result?.geometry?.location?.lng,
      result?.geometry?.location?.lat,
    );
    if (!coordinates) {
      return {
        attempt: {
          provider,
          status: 'INVALID_RESPONSE',
          httpStatus: response.status,
          message: 'Google Geocoding returned a result without valid non-zero coordinates.',
        },
        coordinates: null,
        formattedAddress: nullableString(result?.formatted_address),
        placeId: nullableString(result?.place_id),
        displayName: null,
      };
    }

    return {
      attempt: { provider, status: 'RESOLVED', httpStatus: response.status },
      coordinates,
      formattedAddress: nullableString(result?.formatted_address),
      placeId: nullableString(result?.place_id),
      displayName: null,
    };
  } catch (error) {
    return {
      attempt: {
        provider,
        status: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Google Geocoding request failed.',
      },
      coordinates: null,
      formattedAddress: null,
      placeId: null,
      displayName: null,
    };
  }
};

const terminalFailureStatus = (attempts: GoogleLocationAttempt[]): GoogleLocationStatus => {
  const priority: GoogleLocationStatus[] = [
    'REQUEST_DENIED',
    'NETWORK_ERROR',
    'UPSTREAM_ERROR',
    'INVALID_RESPONSE',
    'ZERO_RESULTS',
  ];
  return priority.find((status) => attempts.some((attempt) => attempt.status === status)) ?? 'ZERO_RESULTS';
};

export const resolveAddressToPlace = async (
  address: string | null | undefined,
): Promise<GooglePlaceResolution> => {
  const query = normalizeAddress(address ?? '');
  if (!query) {
    return {
      query,
      status: 'ZERO_RESULTS',
      provider: null,
      coordinates: null,
      formattedAddress: null,
      placeId: null,
      displayName: null,
      attempts: [],
    };
  }

  const cacheKey = query.toLowerCase();
  const cached = locationCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return {
      query,
      status: 'NO_API_KEY',
      provider: null,
      coordinates: null,
      formattedAddress: null,
      placeId: null,
      displayName: null,
      attempts: [],
    };
  }

  const places = await resolveWithPlaces(query, apiKey);
  if (places.coordinates) {
    const resolution: GooglePlaceResolution = {
      query,
      status: 'RESOLVED',
      provider: places.attempt.provider,
      coordinates: places.coordinates,
      formattedAddress: places.formattedAddress,
      placeId: places.placeId,
      displayName: places.displayName,
      attempts: [places.attempt],
    };
    locationCache.set(cacheKey, resolution);
    return resolution;
  }

  const geocoding = await resolveWithGeocoding(query, apiKey);
  const attempts = [places.attempt, geocoding.attempt];
  if (geocoding.coordinates) {
    const resolution: GooglePlaceResolution = {
      query,
      status: 'RESOLVED',
      provider: geocoding.attempt.provider,
      coordinates: geocoding.coordinates,
      formattedAddress: geocoding.formattedAddress,
      placeId: geocoding.placeId,
      displayName: geocoding.displayName,
      attempts,
    };
    locationCache.set(cacheKey, resolution);
    return resolution;
  }

  const status = terminalFailureStatus(attempts);
  const resolution: GooglePlaceResolution = {
    query,
    status,
    provider: null,
    coordinates: null,
    formattedAddress: null,
    placeId: null,
    displayName: null,
    attempts,
  };
  if (status === 'ZERO_RESULTS') {
    locationCache.set(cacheKey, resolution);
  }
  return resolution;
};

export const geocodeAddressToCoordinates = async (
  address: string | null | undefined,
): Promise<GeocodeCoordinates | null> => (
  (await resolveAddressToPlace(address)).coordinates
);

export const clearGeocodeAddressCacheForTests = (): void => {
  locationCache.clear();
};
