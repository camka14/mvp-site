export const DISCOVER_SPORT_PARAM = 'sport';
const LEGACY_DISCOVER_SPORTS_PARAM = 'sports';
export type DiscoverTabValue = 'events' | 'organizations' | 'rentals' | 'teams';

export type DiscoverPreset = {
  tab: DiscoverTabValue;
  tags: string[];
  skillDivisionTypeIds: string[];
  distanceMiles: number | null;
  location: { lat: number; lng: number; label: string | null } | null;
};

type SearchParamsLike = {
  get(name: string): string | null;
  getAll(name: string): string[];
};

const normalizeFilterValue = (value: string): string => value.trim().toLowerCase();

const uniqueNonEmptyValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizeFilterValue(trimmed);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  });

  return result;
};

const splitFilterValues = (value: string | null | undefined): string[] => (
  typeof value === 'string'
    ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
    : []
);

const parseFiniteNumber = (value: string | null): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseDiscoverPreset = (searchParams: SearchParamsLike): DiscoverPreset => {
  const requestedTab = searchParams.get('tab');
  const tab: DiscoverTabValue = requestedTab === 'organizations'
    || requestedTab === 'rentals'
    || requestedTab === 'teams'
    ? requestedTab
    : 'events';
  const lat = parseFiniteNumber(searchParams.get('lat'));
  const lng = parseFiniteNumber(searchParams.get('lng'));
  const rawDistance = parseFiniteNumber(searchParams.get('distanceMiles'));
  const distanceMiles = rawDistance !== null && rawDistance > 0 && rawDistance <= 500
    ? rawDistance
    : null;
  const location = lat !== null
    && lng !== null
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    ? {
        lat,
        lng,
        label: searchParams.get('location')?.trim() || null,
      }
    : null;

  return {
    tab,
    tags: uniqueNonEmptyValues(searchParams.getAll('tags').flatMap(splitFilterValues)),
    skillDivisionTypeIds: uniqueNonEmptyValues(
      searchParams.getAll('skillDivisionTypeIds').flatMap(splitFilterValues),
    ),
    distanceMiles,
    location,
  };
};

export const parseDiscoverSportFilters = (searchParams: SearchParamsLike): string[] => (
  uniqueNonEmptyValues([
    ...searchParams.getAll(DISCOVER_SPORT_PARAM).flatMap(splitFilterValues),
    ...searchParams.getAll(LEGACY_DISCOVER_SPORTS_PARAM).flatMap(splitFilterValues),
  ])
);

export const resolveDiscoverSportFilters = (
  filters: string[],
  availableSports: string[],
): string[] => {
  if (!filters.length) {
    return [];
  }
  if (!availableSports.length) {
    return uniqueNonEmptyValues(filters);
  }

  const sportByKey = new Map(
    availableSports
      .map((sport) => [normalizeFilterValue(sport), sport.trim()] as const)
      .filter(([, sport]) => sport.length > 0),
  );

  return uniqueNonEmptyValues(
    filters
      .map((filter) => sportByKey.get(normalizeFilterValue(filter)) ?? '')
      .filter(Boolean),
  );
};

export const buildDiscoverEventsHref = ({
  query,
  sports = [],
  location,
  distanceMiles,
}: {
  query?: string | null;
  sports?: string[];
  location?: { lat: number; lng: number; label?: string | null } | null;
  distanceMiles?: number | null;
} = {}): string => {
  const params = new URLSearchParams();
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }
  uniqueNonEmptyValues(sports).forEach((sport) => {
    params.append(DISCOVER_SPORT_PARAM, sport);
  });
  if (
    location
    && Number.isFinite(location.lat)
    && location.lat >= -90
    && location.lat <= 90
    && Number.isFinite(location.lng)
    && location.lng >= -180
    && location.lng <= 180
  ) {
    params.set('lat', String(location.lat));
    params.set('lng', String(location.lng));
    const label = location.label?.trim();
    if (label) {
      params.set('location', label);
    }
    if (typeof distanceMiles === 'number' && distanceMiles > 0 && distanceMiles <= 500) {
      params.set('distanceMiles', String(distanceMiles));
    }
  }

  const queryString = params.toString();
  return queryString ? `/discover?${queryString}` : '/discover';
};

export const sportNameToSlug = (name: string): string => (
  name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

export const sportSlugToLabel = (slug: string): string => (
  slug
    .trim()
    .toLowerCase()
    .replace(/-+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
);
