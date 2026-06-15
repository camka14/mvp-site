export const DISCOVER_SPORT_PARAM = 'sport';
const LEGACY_DISCOVER_SPORTS_PARAM = 'sports';

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
}: {
  query?: string | null;
  sports?: string[];
} = {}): string => {
  const params = new URLSearchParams();
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }
  uniqueNonEmptyValues(sports).forEach((sport) => {
    params.append(DISCOVER_SPORT_PARAM, sport);
  });

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
