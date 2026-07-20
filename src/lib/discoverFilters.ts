export const DISCOVER_SPORT_PARAM = 'sport';
const LEGACY_DISCOVER_SPORTS_PARAM = 'sports';
const DISCOVER_EVENT_TYPES = new Set(['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'TRYOUT', 'AFFILIATE']);
const DISCOVER_GENDERS = new Set(['M', 'F', 'C']);
export type DiscoverTabValue = 'events' | 'organizations' | 'rentals' | 'teams';

export type DiscoverPreset = {
  tab: DiscoverTabValue;
  query: string;
  tags: string[];
  eventTypes: string[];
  genders: string[];
  skillDivisionTypeIds: string[];
  ageDivisionTypeIds: string[];
  teamDivisionTypeIds: string[];
  priceMinDollars: number | null;
  priceMaxDollars: number | null;
  startDate: string | null;
  endDate: string | null;
  startHour: number | null;
  endHour: number | null;
  distanceMiles: number | null;
  location: { lat: number; lng: number; label: string | null } | null;
};

export type DiscoverHrefInput = {
  tab?: DiscoverTabValue;
  query?: string | null;
  sports?: string[];
  tags?: string[];
  eventTypes?: string[];
  genders?: string[];
  skillDivisionTypeIds?: string[];
  ageDivisionTypeIds?: string[];
  teamDivisionTypeIds?: string[];
  priceMinDollars?: number | null;
  priceMaxDollars?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  startHour?: number | null;
  endHour?: number | null;
  location?: { lat: number; lng: number; label?: string | null } | null;
  distanceMiles?: number | null;
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

const parseBoundedNumber = (
  value: string | null,
  minimum: number,
  maximum: number,
): number | null => {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const parseHour = (value: string | null): number | null => {
  const parsed = parseBoundedNumber(value, 0, 24);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

export const normalizeDiscoverDateParam = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

export const discoverDateToParam = (value: Date | string | null | undefined): string | null => {
  if (typeof value === 'string') {
    return normalizeDiscoverDateParam(value);
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const discoverDateParamToDate = (value: string | null | undefined): Date | null => {
  const normalized = normalizeDiscoverDateParam(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day);
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
  const parsedStartHour = parseHour(searchParams.get('startHour'));
  const parsedEndHour = parseHour(searchParams.get('endHour'));
  const hasValidRentalHours = parsedStartHour !== null
    && parsedEndHour !== null
    && parsedStartHour < parsedEndHour;

  return {
    tab,
    query: searchParams.get('q')?.trim() || '',
    tags: uniqueNonEmptyValues(searchParams.getAll('tags').flatMap(splitFilterValues)),
    eventTypes: uniqueNonEmptyValues(searchParams.getAll('eventTypes').flatMap(splitFilterValues))
      .map((value) => value.toUpperCase())
      .filter((value) => DISCOVER_EVENT_TYPES.has(value)),
    genders: uniqueNonEmptyValues(searchParams.getAll('genders').flatMap(splitFilterValues))
      .map((value) => value.toUpperCase())
      .filter((value) => DISCOVER_GENDERS.has(value)),
    skillDivisionTypeIds: uniqueNonEmptyValues(
      searchParams.getAll('skillDivisionTypeIds').flatMap(splitFilterValues),
    ),
    ageDivisionTypeIds: uniqueNonEmptyValues(
      searchParams.getAll('ageDivisionTypeIds').flatMap(splitFilterValues),
    ),
    teamDivisionTypeIds: uniqueNonEmptyValues(
      searchParams.getAll('teamDivisionTypeIds').flatMap(splitFilterValues),
    ),
    priceMinDollars: parseBoundedNumber(searchParams.get('priceMin'), 0, 1_000_000),
    priceMaxDollars: parseBoundedNumber(searchParams.get('priceMax'), 0, 1_000_000),
    startDate: normalizeDiscoverDateParam(searchParams.get('startDate')),
    endDate: normalizeDiscoverDateParam(searchParams.get('endDate')),
    startHour: hasValidRentalHours ? parsedStartHour : null,
    endHour: hasValidRentalHours ? parsedEndHour : null,
    distanceMiles: location ? distanceMiles : null,
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

const appendFilterValues = (params: URLSearchParams, name: string, values: string[] = []) => {
  uniqueNonEmptyValues(values).forEach((value) => params.append(name, value));
};

const setBoundedNumber = (
  params: URLSearchParams,
  name: string,
  value: number | null | undefined,
  minimum: number,
  maximum: number,
) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum) {
    params.set(name, String(value));
  }
};

export const buildDiscoverHref = ({
  tab = 'events',
  query,
  sports = [],
  tags = [],
  eventTypes = [],
  genders = [],
  skillDivisionTypeIds = [],
  ageDivisionTypeIds = [],
  teamDivisionTypeIds = [],
  priceMinDollars,
  priceMaxDollars,
  startDate,
  endDate,
  startHour,
  endHour,
  location,
  distanceMiles,
}: DiscoverHrefInput = {}): string => {
  const params = new URLSearchParams();
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }
  if (tab !== 'events') {
    params.set('tab', tab);
  }
  appendFilterValues(params, DISCOVER_SPORT_PARAM, sports);

  if (tab === 'events' || tab === 'organizations') {
    appendFilterValues(params, 'tags', tags);
    appendFilterValues(params, 'genders', genders);
    appendFilterValues(params, 'skillDivisionTypeIds', skillDivisionTypeIds);
    appendFilterValues(params, 'ageDivisionTypeIds', ageDivisionTypeIds);
    setBoundedNumber(params, 'priceMin', priceMinDollars, 0, 1_000_000);
    setBoundedNumber(params, 'priceMax', priceMaxDollars, 0, 1_000_000);
  }
  if (tab === 'events') {
    appendFilterValues(params, 'eventTypes', eventTypes);
    const normalizedStartDate = discoverDateToParam(startDate);
    const normalizedEndDate = discoverDateToParam(endDate);
    if (normalizedStartDate) params.set('startDate', normalizedStartDate);
    if (normalizedEndDate) params.set('endDate', normalizedEndDate);
  }
  if (tab === 'rentals') {
    if (
      typeof startHour === 'number'
      && typeof endHour === 'number'
      && Number.isInteger(startHour)
      && Number.isInteger(endHour)
      && startHour >= 0
      && endHour <= 24
      && startHour < endHour
    ) {
      params.set('startHour', String(startHour));
      params.set('endHour', String(endHour));
    }
  }
  if (tab === 'teams') {
    appendFilterValues(params, 'teamDivisionTypeIds', teamDivisionTypeIds);
  }

  if (
    tab !== 'teams'
    && location
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
    setBoundedNumber(params, 'distanceMiles', distanceMiles, 0.000001, 500);
  }

  const queryString = params.toString();
  return queryString ? `/discover?${queryString}` : '/discover';
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
} = {}): string => buildDiscoverHref({ query, sports, location, distanceMiles });

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
