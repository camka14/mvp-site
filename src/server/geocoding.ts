type GeocodeCoordinates = [number, number];

type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: unknown;
        lng?: unknown;
      };
    };
  }>;
};

const geocodeCache = new Map<string, GeocodeCoordinates | null>();

const googleMapsApiKey = (): string | null => {
  const candidates = [
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  ];
  for (const key of candidates) {
    const trimmed = key?.trim() ?? '';
    if (trimmed.length) return trimmed;
  }
  return null;
};

const normalizeAddress = (address: string): string => (
  address.replace(/\s+/g, ' ').trim()
);

export const geocodeAddressToCoordinates = async (
  address: string | null | undefined,
): Promise<GeocodeCoordinates | null> => {
  const normalized = normalizeAddress(address ?? '');
  if (!normalized) return null;

  const cacheKey = normalized.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    geocodeCache.set(cacheKey, null);
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalized)}&key=${apiKey}`,
    );
    if (!response.ok) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const payload = await response.json() as GoogleGeocodeResponse;
    const location = payload.status === 'OK'
      ? payload.results?.[0]?.geometry?.location
      : null;
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lng)
      ? [lng, lat] satisfies GeocodeCoordinates
      : null;

    geocodeCache.set(cacheKey, coordinates);
    return coordinates;
  } catch {
    geocodeCache.set(cacheKey, null);
    return null;
  }
};

export const clearGeocodeAddressCacheForTests = (): void => {
  geocodeCache.clear();
};
