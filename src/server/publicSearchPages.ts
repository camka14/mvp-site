import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { buildDiscoverEventsHref, sportNameToSlug, sportSlugToLabel } from '@/lib/discoverFilters';
import { DEFAULT_ORGANIZATION_STATUS } from '@/lib/organizationStatus';
import { SITE_URL } from '@/lib/siteUrl';
import {
  absoluteUrl,
  publicEventPath,
} from '@/server/publicSearchSeo';

const PUBLIC_RESULT_LIMIT = 24;
const PUBLIC_SITEMAP_PAGE_LIMIT = 50000;
const PUBLIC_EVENT_STATES = ['PUBLISHED', null] as const;
const FALLBACK_IMAGE_URL = '/BIQ_drawing.svg';
export const PUBLIC_SEARCH_RADIUS_MILES = 25;

export type PublicSearchKind = 'events' | 'clubs' | 'facilities';
export type PublicSearchEventType = 'events' | 'leagues' | 'tournaments' | 'weekly-events';

export type PublicSearchCoordinates = {
  lng: number;
  lat: number;
};

export type PublicSearchLocation = {
  slug: string;
  label: string;
  city?: string;
  state?: string;
  coordinates?: PublicSearchCoordinates;
};

export type PublicSearchPageSummary = {
  path: string;
  title: string;
  description: string;
  resultCount?: number;
  lastModified?: Date;
};

export type PublicSearchResult = {
  id: string;
  kind: PublicSearchKind;
  title: string;
  description: string | null;
  href: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string | null;
  sportName?: string | null;
  eventType?: string | null;
  start?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  lastModified?: Date;
};

export type PublicSearchPage = {
  path: string;
  title: string;
  h1: string;
  description: string;
  canonicalPath: string;
  discoverHref: string;
  kind: PublicSearchKind;
  sportName?: string;
  sportSlug?: string;
  eventType?: PublicSearchEventType;
  location?: PublicSearchLocation;
  searchRadiusMiles?: number;
  results: PublicSearchResult[];
  relatedPages: PublicSearchPageSummary[];
  lastModified?: Date;
};

export type RegularPublicEventSeoData = {
  event: {
    id: string;
    name: string;
    description: string | null;
    start: string | null;
    end: string | null;
    location: string | null;
    address: string | null;
    priceCents: number;
    imageUrl: string;
    eventType: string | null;
    sportName: string | null;
    updatedAt?: Date;
  };
  organization: {
    id: string;
    name: string;
    description: string | null;
    location: string | null;
    website: string | null;
    logoUrl: string;
    publicSlug: string | null;
    publicPageEnabled: boolean;
  };
  canonicalPath: string;
  registrationPath: string | null;
  title: string;
  description: string;
  indexable: boolean;
};

type SearchableOrganization = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  location: string | null;
  address: string | null;
  website: string | null;
  sports: string[];
  logoId: string | null;
  publicPageEnabled: boolean;
  coordinates: PublicSearchCoordinates | null;
  updatedAt?: Date;
};

type SearchableEvent = {
  id: string;
  name: string;
  description: string | null;
  start?: Date;
  end?: Date;
  location: string | null;
  address: string | null;
  coordinates: PublicSearchCoordinates | null;
  priceCents: number;
  eventType: string | null;
  sportId: string | null;
  organizationId: string;
  imageId: string | null;
  updatedAt?: Date;
};

type SearchableFacility = {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  organizationId: string;
  coordinates: PublicSearchCoordinates | null;
  updatedAt?: Date;
  sportIds: string[];
};

export type PublicSearchSportEntry = {
  id: string;
  name: string;
  slug: string;
  sportIds: string[];
  sportNames: string[];
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};
const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

const EVENT_TYPE_LABELS: Record<PublicSearchEventType, string> = {
  events: 'Events',
  leagues: 'Leagues',
  tournaments: 'Tournaments',
  'weekly-events': 'Weekly Events',
};

const EVENT_TYPE_TO_DB: Partial<Record<PublicSearchEventType, string>> = {
  events: 'EVENT',
  leagues: 'LEAGUE',
  tournaments: 'TOURNAMENT',
  'weekly-events': 'WEEKLY_EVENT',
};

const KIND_BASE_PATH: Record<PublicSearchKind, string> = {
  events: '/find-events',
  clubs: '/find-clubs',
  facilities: '/find-facilities',
};

export const PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS: PublicSearchLocation[] = [
  { slug: 'seattle-wa', label: 'Seattle, WA', city: 'Seattle', state: 'WA', coordinates: { lng: -122.3321, lat: 47.6062 } },
  { slug: 'spokane-wa', label: 'Spokane, WA', city: 'Spokane', state: 'WA', coordinates: { lng: -117.426, lat: 47.6588 } },
  { slug: 'tacoma-wa', label: 'Tacoma, WA', city: 'Tacoma', state: 'WA', coordinates: { lng: -122.4443, lat: 47.2529 } },
  { slug: 'vancouver-wa', label: 'Vancouver, WA', city: 'Vancouver', state: 'WA', coordinates: { lng: -122.6615, lat: 45.6387 } },
  { slug: 'bellevue-wa', label: 'Bellevue, WA', city: 'Bellevue', state: 'WA', coordinates: { lng: -122.2015, lat: 47.6101 } },
  { slug: 'kent-wa', label: 'Kent, WA', city: 'Kent', state: 'WA', coordinates: { lng: -122.2348, lat: 47.3809 } },
  { slug: 'everett-wa', label: 'Everett, WA', city: 'Everett', state: 'WA', coordinates: { lng: -122.2021, lat: 47.979 } },
  { slug: 'renton-wa', label: 'Renton, WA', city: 'Renton', state: 'WA', coordinates: { lng: -122.2171, lat: 47.4829 } },
  { slug: 'yakima-wa', label: 'Yakima, WA', city: 'Yakima', state: 'WA', coordinates: { lng: -120.5059, lat: 46.6021 } },
  { slug: 'federal-way-wa', label: 'Federal Way, WA', city: 'Federal Way', state: 'WA', coordinates: { lng: -122.3126, lat: 47.3223 } },
  { slug: 'spokane-valley-wa', label: 'Spokane Valley, WA', city: 'Spokane Valley', state: 'WA', coordinates: { lng: -117.2394, lat: 47.6732 } },
  { slug: 'kirkland-wa', label: 'Kirkland, WA', city: 'Kirkland', state: 'WA', coordinates: { lng: -122.2087, lat: 47.6769 } },
  { slug: 'bellingham-wa', label: 'Bellingham, WA', city: 'Bellingham', state: 'WA', coordinates: { lng: -122.4787, lat: 48.7519 } },
  { slug: 'kennewick-wa', label: 'Kennewick, WA', city: 'Kennewick', state: 'WA', coordinates: { lng: -119.1372, lat: 46.2112 } },
  { slug: 'auburn-wa', label: 'Auburn, WA', city: 'Auburn', state: 'WA', coordinates: { lng: -122.2285, lat: 47.3073 } },
  { slug: 'pasco-wa', label: 'Pasco, WA', city: 'Pasco', state: 'WA', coordinates: { lng: -119.1006, lat: 46.2396 } },
  { slug: 'marysville-wa', label: 'Marysville, WA', city: 'Marysville', state: 'WA', coordinates: { lng: -122.1771, lat: 48.0518 } },
  { slug: 'redmond-wa', label: 'Redmond, WA', city: 'Redmond', state: 'WA', coordinates: { lng: -122.1215, lat: 47.674 } },
  { slug: 'sammamish-wa', label: 'Sammamish, WA', city: 'Sammamish', state: 'WA', coordinates: { lng: -122.0326, lat: 47.6163 } },
  { slug: 'lakewood-wa', label: 'Lakewood, WA', city: 'Lakewood', state: 'WA', coordinates: { lng: -122.5185, lat: 47.1718 } },
  { slug: 'portland-or', label: 'Portland, OR', city: 'Portland', state: 'OR', coordinates: { lng: -122.6765, lat: 45.5231 } },
  { slug: 'eugene-or', label: 'Eugene, OR', city: 'Eugene', state: 'OR', coordinates: { lng: -123.0868, lat: 44.0521 } },
  { slug: 'salem-or', label: 'Salem, OR', city: 'Salem', state: 'OR', coordinates: { lng: -123.0351, lat: 44.9429 } },
  { slug: 'gresham-or', label: 'Gresham, OR', city: 'Gresham', state: 'OR', coordinates: { lng: -122.4315, lat: 45.5001 } },
  { slug: 'hillsboro-or', label: 'Hillsboro, OR', city: 'Hillsboro', state: 'OR', coordinates: { lng: -122.9898, lat: 45.5229 } },
  { slug: 'bend-or', label: 'Bend, OR', city: 'Bend', state: 'OR', coordinates: { lng: -121.3153, lat: 44.0582 } },
  { slug: 'beaverton-or', label: 'Beaverton, OR', city: 'Beaverton', state: 'OR', coordinates: { lng: -122.8037, lat: 45.4871 } },
  { slug: 'medford-or', label: 'Medford, OR', city: 'Medford', state: 'OR', coordinates: { lng: -122.8756, lat: 42.3265 } },
  { slug: 'springfield-or', label: 'Springfield, OR', city: 'Springfield', state: 'OR', coordinates: { lng: -123.022, lat: 44.0462 } },
  { slug: 'corvallis-or', label: 'Corvallis, OR', city: 'Corvallis', state: 'OR', coordinates: { lng: -123.262, lat: 44.5646 } },
  { slug: 'albany-or', label: 'Albany, OR', city: 'Albany', state: 'OR', coordinates: { lng: -123.1059, lat: 44.6365 } },
  { slug: 'tigard-or', label: 'Tigard, OR', city: 'Tigard', state: 'OR', coordinates: { lng: -122.7715, lat: 45.4312 } },
  { slug: 'lake-oswego-or', label: 'Lake Oswego, OR', city: 'Lake Oswego', state: 'OR', coordinates: { lng: -122.6706, lat: 45.4207 } },
  { slug: 'keizer-or', label: 'Keizer, OR', city: 'Keizer', state: 'OR', coordinates: { lng: -123.0262, lat: 44.9901 } },
  { slug: 'grants-pass-or', label: 'Grants Pass, OR', city: 'Grants Pass', state: 'OR', coordinates: { lng: -123.3284, lat: 42.439 } },
  { slug: 'oregon-city-or', label: 'Oregon City, OR', city: 'Oregon City', state: 'OR', coordinates: { lng: -122.6068, lat: 45.3573 } },
  { slug: 'mcminnville-or', label: 'McMinnville, OR', city: 'McMinnville', state: 'OR', coordinates: { lng: -123.1987, lat: 45.2101 } },
  { slug: 'redmond-or', label: 'Redmond, OR', city: 'Redmond', state: 'OR', coordinates: { lng: -121.1739, lat: 44.2726 } },
];

const CURATED_LOCATION_BY_SLUG = new Map(
  PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS.map((location) => [location.slug, location]),
);

const UMBRELLA_SPORTS: Array<{ name: string; slug: string; memberNames: string[] }> = [
  {
    name: 'Soccer',
    slug: 'soccer',
    memberNames: ['Soccer', 'Grass Soccer', 'Indoor Soccer', 'Beach Soccer'],
  },
  {
    name: 'Volleyball',
    slug: 'volleyball',
    memberNames: ['Volleyball', 'Indoor Volleyball', 'Grass Volleyball', 'Beach Volleyball'],
  },
];

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length ? normalized : null;
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
};

const toIsoString = (value: unknown): string | null => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean),
    ))
    : []
);

const normalizeCoordinates = (value: unknown): PublicSearchCoordinates | null => {
  let lng: unknown;
  let lat: unknown;

  if (Array.isArray(value)) {
    [lng, lat] = value;
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    lng = record.lng ?? record.long ?? record.longitude;
    lat = record.lat ?? record.latitude;
  }

  const normalizedLng = typeof lng === 'number' ? lng : Number(lng);
  const normalizedLat = typeof lat === 'number' ? lat : Number(lat);
  if (
    !Number.isFinite(normalizedLng)
    || !Number.isFinite(normalizedLat)
    || normalizedLng < -180
    || normalizedLng > 180
    || normalizedLat < -90
    || normalizedLat > 90
    || (normalizedLng === 0 && normalizedLat === 0)
  ) {
    return null;
  }

  return { lng: normalizedLng, lat: normalizedLat };
};

const distanceMilesBetween = (
  left: PublicSearchCoordinates,
  right: PublicSearchCoordinates,
): number => {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(right.lat - left.lat);
  const longitudeDelta = toRadians(right.lng - left.lng);
  const leftLatitude = toRadians(left.lat);
  const rightLatitude = toRadians(right.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const trimForMeta = (value: string, maxLength = 155): string => {
  const normalized = normalizeString(value) ?? '';
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const truncated = normalized.slice(0, maxLength - 1).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 90 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}...`;
};

const titleCase = (value: string): string => (
  value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')
);

const locationSlug = (city: string, stateCode: string): string => (
  `${sportNameToSlug(city)}-${stateCode.toLowerCase()}`
);

const labelForLocation = (city: string, stateCode: string): string => (
  `${titleCase(city)}, ${stateCode.toUpperCase()}`
);

export const extractPublicSearchLocation = (...values: Array<unknown>): PublicSearchLocation | null => {
  const haystack = values
    .map(normalizeString)
    .filter((value): value is string => Boolean(value))
    .join(' | ');
  if (!haystack) {
    return null;
  }

  const codePattern = /(?:^|,\s*)([A-Z][a-zA-Z .'-]{1,60}?),\s*([A-Z]{2})(?:\b|[\s,0-9])/g;
  for (const match of haystack.matchAll(codePattern)) {
    const city = match[1].replace(/^\d+\s+/, '').trim();
    const stateCode = match[2].toUpperCase();
    if (city && STATE_CODES.has(stateCode)) {
      return {
        slug: locationSlug(city, stateCode),
        label: labelForLocation(city, stateCode),
        city: titleCase(city),
        state: stateCode,
      };
    }
  }

  const stateNamePattern = new RegExp(`(?:^|,\\s*)([A-Z][a-zA-Z .'-]{1,60}?),\\s*(${Object.keys(STATE_NAME_TO_CODE).join('|')})(?:\\b|[\\s,])`, 'gi');
  for (const match of haystack.matchAll(stateNamePattern)) {
    const city = match[1].replace(/^\d+\s+/, '').trim();
    const stateCode = STATE_NAME_TO_CODE[match[2].toLowerCase()];
    if (city && stateCode) {
      return {
        slug: locationSlug(city, stateCode),
        label: labelForLocation(city, stateCode),
        city: titleCase(city),
        state: stateCode,
      };
    }
  }

  return null;
};

export const regularOrganizationPath = (organizationId: string): string => (
  `/organizations/${encodeURIComponent(organizationId)}`
);

export const regularEventPath = (eventId: string): string => (
  `/event/${encodeURIComponent(eventId)}`
);

const publicOrganizationPath = (organization: SearchableOrganization): string => (
  organization.slug && organization.publicPageEnabled
    ? `/o/${encodeURIComponent(organization.slug)}`
    : regularOrganizationPath(organization.id)
);

const eventTypeSegment = (eventType?: PublicSearchEventType): string => (
  eventType && eventType !== 'events' ? eventType : ''
);

export const publicSearchPath = ({
  kind,
  sportSlug,
  eventType,
  locationSlug,
}: {
  kind: PublicSearchKind;
  sportSlug?: string;
  eventType?: PublicSearchEventType;
  locationSlug?: string;
}): string => {
  const base = KIND_BASE_PATH[kind];
  const normalizedSport = normalizeString(sportSlug)?.toLowerCase();
  const normalizedLocation = normalizeString(locationSlug)?.toLowerCase();
  if (!normalizedSport) {
    return base;
  }
  const eventTypeSuffix = kind === 'events' ? eventTypeSegment(eventType) : '';
  const primarySegment = eventTypeSuffix ? `${normalizedSport}-${eventTypeSuffix}` : normalizedSport;
  return normalizedLocation ? `${base}/${primarySegment}/${normalizedLocation}` : `${base}/${primarySegment}`;
};

const organizationLogoUrl = (organization: SearchableOrganization): string => (
  organization.logoId
    ? `/api/files/${encodeURIComponent(organization.logoId)}/preview?w=240&h=240`
    : `/api/avatars/initials?name=${encodeURIComponent(organization.name)}&size=240&format=png`
);

const eventImageUrl = (event: SearchableEvent, organization: SearchableOrganization): string => (
  event.imageId
    ? `/api/files/${encodeURIComponent(event.imageId)}/preview?w=1200&h=675`
    : organizationLogoUrl(organization)
);

const facilityHref = (
  facility: SearchableFacility,
  organization: SearchableOrganization,
): string => (
  organization.slug && organization.publicPageEnabled
    ? publicOrganizationPath(organization)
    : `${regularOrganizationPath(facility.organizationId)}/facilities`
);

const eventHref = (event: SearchableEvent, organization: SearchableOrganization): string => (
  organization.slug && organization.publicPageEnabled
    ? publicEventPath(organization.slug, event.id)
    : regularEventPath(event.id)
);

const latestDate = (values: Array<Date | undefined>): Date | undefined => (
  values.filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0]
);

export const createPublicSearchSportEntries = (
  rows: Array<{ id?: unknown; name?: unknown }>,
): PublicSearchSportEntry[] => {
  const baseEntries = rows.flatMap((row): PublicSearchSportEntry[] => {
    const id = normalizeString(row.id);
    const name = normalizeString(row.name);
    const slug = name ? sportNameToSlug(name) : '';
    return id && name && slug
      ? [{
          id,
          name,
          slug,
          sportIds: [id],
          sportNames: [name],
        }]
      : [];
  });

  const umbrellaSlugs = new Set(UMBRELLA_SPORTS.map((sport) => sport.slug));
  const entries = baseEntries.filter((entry) => !umbrellaSlugs.has(entry.slug));

  UMBRELLA_SPORTS.forEach((umbrella) => {
    const memberNames = new Set(umbrella.memberNames.map((name) => name.toLowerCase()));
    const members = baseEntries.filter((entry) => memberNames.has(entry.name.toLowerCase()));
    if (!members.length) {
      return;
    }
    entries.push({
      id: `umbrella:${umbrella.slug}`,
      name: umbrella.name,
      slug: umbrella.slug,
      sportIds: members.flatMap((entry) => entry.sportIds),
      sportNames: members.flatMap((entry) => entry.sportNames),
    });
  });

  return entries.sort((left, right) => left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug));
};

const loadSports = async (): Promise<PublicSearchSportEntry[]> => {
  const rows: Array<Record<string, unknown>> = await (prisma as any).sports.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return createPublicSearchSportEntries(rows);
};

const loadSearchableOrganizations = async (): Promise<SearchableOrganization[]> => {
  const rows: Array<Record<string, unknown>> = await (prisma as any).organizations.findMany({
    where: { status: DEFAULT_ORGANIZATION_STATUS },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      description: true,
      location: true,
      address: true,
      website: true,
      sports: true,
      logoId: true,
      publicPageEnabled: true,
      coordinates: true,
      updatedAt: true,
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 5000,
  });

  return rows.flatMap((row): SearchableOrganization[] => {
    const id = normalizeString(row.id);
    const name = normalizeString(row.name);
    if (!id || !name) {
      return [];
    }
    return [{
      id,
      slug: normalizeString(row.publicSlug),
      name,
      description: normalizeString(row.description),
      location: normalizeString(row.location),
      address: normalizeString(row.address),
      website: normalizeString(row.website),
      sports: normalizeStringArray(row.sports),
      logoId: normalizeString(row.logoId),
      publicPageEnabled: row.publicPageEnabled === true,
      coordinates: normalizeCoordinates(row.coordinates),
      updatedAt: toDate(row.updatedAt),
    }];
  });
};

const loadSearchableEvents = async (organizationIds: string[]): Promise<SearchableEvent[]> => {
  if (!organizationIds.length) {
    return [];
  }
  const rows: Array<Record<string, unknown>> = await (prisma as any).events.findMany({
    where: {
      organizationId: { in: organizationIds },
      archivedAt: null,
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    select: {
      id: true,
      name: true,
      description: true,
      start: true,
      end: true,
      location: true,
      address: true,
      coordinates: true,
      price: true,
      eventType: true,
      sportId: true,
      organizationId: true,
      imageId: true,
      updatedAt: true,
    },
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
    take: 50000,
  });

  return rows.flatMap((row): SearchableEvent[] => {
    const id = normalizeString(row.id);
    const organizationId = normalizeString(row.organizationId);
    const name = normalizeString(row.name);
    if (!id || !organizationId || !name) {
      return [];
    }
    return [{
      id,
      organizationId,
      name,
      description: normalizeString(row.description),
      start: toDate(row.start),
      end: toDate(row.end),
      location: normalizeString(row.location),
      address: normalizeString(row.address),
      coordinates: normalizeCoordinates(row.coordinates),
      priceCents: typeof row.price === 'number' ? row.price : 0,
      eventType: normalizeString(row.eventType),
      sportId: normalizeString(row.sportId),
      imageId: normalizeString(row.imageId),
      updatedAt: toDate(row.updatedAt),
    }];
  });
};

const loadSearchableFacilities = async (organizationIds: string[]): Promise<SearchableFacility[]> => {
  if (!organizationIds.length) {
    return [];
  }

  const [facilities, fields] = await Promise.all([
    (prisma as any).facilities.findMany({
      where: {
        organizationId: { in: organizationIds },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        location: true,
        address: true,
        organizationId: true,
        coordinates: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 10000,
    }),
    (prisma as any).fields.findMany({
      where: {
        organizationId: { in: organizationIds },
        archivedAt: null,
      },
      select: {
        facilityId: true,
        sportIds: true,
      },
      take: 50000,
    }),
  ]);

  const sportIdsByFacilityId = new Map<string, Set<string>>();
  (fields as Array<Record<string, unknown>>).forEach((field) => {
    const facilityId = normalizeString(field.facilityId);
    if (!facilityId) {
      return;
    }
    const set = sportIdsByFacilityId.get(facilityId) ?? new Set<string>();
    normalizeStringArray(field.sportIds).forEach((sportId) => set.add(sportId));
    sportIdsByFacilityId.set(facilityId, set);
  });

  return (facilities as Array<Record<string, unknown>>).flatMap((row): SearchableFacility[] => {
    const id = normalizeString(row.id);
    const organizationId = normalizeString(row.organizationId);
    const name = normalizeString(row.name);
    if (!id || !organizationId || !name) {
      return [];
    }
    return [{
      id,
      organizationId,
      name,
      location: normalizeString(row.location),
      address: normalizeString(row.address),
      coordinates: normalizeCoordinates(row.coordinates),
      updatedAt: toDate(row.updatedAt),
      sportIds: Array.from(sportIdsByFacilityId.get(id) ?? []),
    }];
  });
};

const parseEventSportAndType = (
  segment: string | undefined,
  sports: PublicSearchSportEntry[],
): { sport?: PublicSearchSportEntry; eventType?: PublicSearchEventType } => {
  const normalized = normalizeString(segment)?.toLowerCase();
  if (!normalized) {
    return {};
  }

  const exactSport = sports.find((sport) => sport.slug === normalized);
  if (exactSport) {
    return { sport: exactSport };
  }

  const suffixes: PublicSearchEventType[] = ['weekly-events', 'tournaments', 'leagues', 'events'];
  for (const suffix of suffixes) {
    const marker = `-${suffix}`;
    if (!normalized.endsWith(marker)) {
      continue;
    }
    const sportSlug = normalized.slice(0, -marker.length);
    const sport = sports.find((entry) => entry.slug === sportSlug);
    if (sport) {
      return { sport, eventType: suffix };
    }
  }

  return {
    sport: {
      id: normalized,
      name: sportSlugToLabel(normalized),
      slug: normalized,
      sportIds: [],
      sportNames: [],
    },
  };
};

export const parsePublicSearchSegments = ({
  kind,
  segments,
  sports,
}: {
  kind: PublicSearchKind;
  segments: string[];
  sports: PublicSearchSportEntry[];
}): { sport?: PublicSearchSportEntry; eventType?: PublicSearchEventType; locationSlug?: string } => {
  const [first, second] = segments.map((segment) => normalizeString(segment)?.toLowerCase() ?? '');
  if (kind === 'events') {
    const parsed = parseEventSportAndType(first, sports);
    return {
      ...parsed,
      locationSlug: second || undefined,
    };
  }

  const sport = first ? sports.find((entry) => entry.slug === first) ?? {
    id: first,
    name: sportSlugToLabel(first),
    slug: first,
    sportIds: [],
    sportNames: [],
  } : undefined;
  return {
    sport,
    locationSlug: second || undefined,
  };
};

const resultMatchesLocation = (
  locationSlugInput: string | undefined,
  coordinates: PublicSearchCoordinates | null,
  ...locationValues: Array<unknown>
): boolean => {
  if (!locationSlugInput) {
    return true;
  }
  const curatedLocation = CURATED_LOCATION_BY_SLUG.get(locationSlugInput);
  if (curatedLocation?.coordinates && coordinates) {
    return distanceMilesBetween(curatedLocation.coordinates, coordinates) <= PUBLIC_SEARCH_RADIUS_MILES;
  }
  return extractPublicSearchLocation(...locationValues)?.slug === locationSlugInput;
};

const organizationMatchesSport = (
  organization: SearchableOrganization,
  sport: PublicSearchSportEntry | undefined,
): boolean => {
  if (!sport) {
    return true;
  }
  const umbrella = UMBRELLA_SPORTS.find((entry) => entry.slug === sport.slug);
  const normalizedSportNames = new Set(
    (umbrella?.memberNames ?? sport.sportNames).map((name) => name.trim().toLowerCase()),
  );
  return organization.sports.some((name) => normalizedSportNames.has(name.trim().toLowerCase()));
};

const isCurrentSearchEvent = (event: SearchableEvent): boolean => {
  const currentThrough = event.end ?? event.start;
  return !currentThrough || currentThrough.getTime() >= Date.now();
};

const formatEventTypePhrase = (eventType?: PublicSearchEventType): string => (
  eventType ? EVENT_TYPE_LABELS[eventType].toLowerCase() : 'events'
);

const kindLabel = (kind: PublicSearchKind): string => {
  if (kind === 'clubs') return 'Clubs';
  if (kind === 'facilities') return 'Facilities';
  return 'Events';
};

const pageCopy = ({
  kind,
  sportName,
  eventType,
  location,
}: {
  kind: PublicSearchKind;
  sportName?: string;
  eventType?: PublicSearchEventType;
  location?: PublicSearchLocation;
}): Pick<PublicSearchPage, 'title' | 'h1' | 'description'> => {
  const subject = kind === 'events'
    ? `${sportName ? `${sportName} ` : ''}${formatEventTypePhrase(eventType)}`
    : `${sportName ? `${sportName} ` : ''}${kindLabel(kind).toLowerCase()}`;
  const locationText = location ? ` near ${location.label}` : '';
  const h1 = `${titleCase(subject)}${locationText}`;
  const title = `${h1} | BracketIQ`;
  const description = kind === 'events'
    ? trimForMeta(`Find ${subject}${location ? ` within ${PUBLIC_SEARCH_RADIUS_MILES} miles of ${location.label}` : ''} hosted through BracketIQ. Browse real public listings and open filtered Discover results.`)
    : trimForMeta(`Find ${subject}${location ? ` within ${PUBLIC_SEARCH_RADIUS_MILES} miles of ${location.label}` : ''} on BracketIQ. Browse public organization profiles and local sports listings.`);
  return { title, h1, description };
};

const buildEventResults = ({
  events,
  organizationsById,
  sportNamesById,
  sport,
  eventType,
  locationSlug,
}: {
  events: SearchableEvent[];
  organizationsById: Map<string, SearchableOrganization>;
  sportNamesById: Map<string, string>;
  sport?: PublicSearchSportEntry;
  eventType?: PublicSearchEventType;
  locationSlug?: string;
}): PublicSearchResult[] => {
  const dbEventType = eventType ? EVENT_TYPE_TO_DB[eventType] : undefined;
  return events
    .filter(isCurrentSearchEvent)
    .filter((event) => !sport || Boolean(event.sportId && sport.sportIds.includes(event.sportId)))
    .filter((event) => !dbEventType || event.eventType === dbEventType)
    .filter((event) => {
      const organization = organizationsById.get(event.organizationId);
      return organization && resultMatchesLocation(
        locationSlug,
        event.coordinates ?? organization.coordinates,
        event.location,
        event.address,
        organization.location,
        organization.address,
      );
    })
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((event) => {
      const organization = organizationsById.get(event.organizationId)!;
      return {
        id: event.id,
        kind: 'events' as const,
        title: event.name,
        description: event.description,
        href: eventHref(event, organization),
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        sportName: event.sportId ? sportNamesById.get(event.sportId) ?? null : null,
        eventType: event.eventType,
        start: toIsoString(event.start),
        location: event.location ?? organization.location,
        imageUrl: eventImageUrl(event, organization),
        lastModified: event.updatedAt,
      };
    });
};

const buildClubResults = ({
  organizations,
  sport,
  locationSlug,
}: {
  organizations: SearchableOrganization[];
  sport?: PublicSearchSportEntry;
  locationSlug?: string;
}): PublicSearchResult[] => (
  organizations
    .filter((organization) => organizationMatchesSport(organization, sport))
    .filter((organization) => resultMatchesLocation(
      locationSlug,
      organization.coordinates,
      organization.location,
      organization.address,
    ))
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((organization) => ({
      id: organization.id,
      kind: 'clubs' as const,
      title: organization.name,
      description: organization.description,
      href: publicOrganizationPath(organization),
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      sportName: sport?.name ?? null,
      location: organization.location,
      imageUrl: organizationLogoUrl(organization),
      lastModified: organization.updatedAt,
    }))
);

const buildFacilityResults = ({
  facilities,
  organizationsById,
  sportNamesById,
  sport,
  locationSlug,
}: {
  facilities: SearchableFacility[];
  organizationsById: Map<string, SearchableOrganization>;
  sportNamesById: Map<string, string>;
  sport?: PublicSearchSportEntry;
  locationSlug?: string;
}): PublicSearchResult[] => (
  facilities
    .filter((facility) => !sport || facility.sportIds.some((sportId) => sport.sportIds.includes(sportId)))
    .filter((facility) => {
      const organization = organizationsById.get(facility.organizationId);
      return organization && resultMatchesLocation(
        locationSlug,
        facility.coordinates ?? organization.coordinates,
        facility.location,
        facility.address,
        organization.location,
        organization.address,
      );
    })
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((facility) => {
      const organization = organizationsById.get(facility.organizationId)!;
      const facilitySports = facility.sportIds
        .map((sportId) => sportNamesById.get(sportId))
        .filter((name): name is string => Boolean(name));
      return {
        id: facility.id,
        kind: 'facilities' as const,
        title: facility.name,
        description: facilitySports.length ? `${facilitySports.join(', ')} facility operated by ${organization.name}.` : `Facility operated by ${organization.name}.`,
        href: facilityHref(facility, organization),
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        sportName: sport?.name ?? facilitySports[0] ?? null,
        location: facility.location ?? organization.location,
        imageUrl: organizationLogoUrl(organization),
        lastModified: facility.updatedAt ?? organization.updatedAt,
      };
    })
);

export const getPublicSearchPage = async ({
  kind,
  sportSlug,
  eventType,
  locationSlug,
}: {
  kind: PublicSearchKind;
  sportSlug?: string;
  eventType?: PublicSearchEventType;
  locationSlug?: string;
}): Promise<PublicSearchPage | null> => {
  const [sports, organizations] = await Promise.all([
    loadSports(),
    loadSearchableOrganizations(),
  ]);
  const sportFromCatalog = sportSlug ? sports.find((entry) => entry.slug === sportSlug) : undefined;
  const sport = sportSlug ? sportFromCatalog ?? {
    id: sportSlug,
    name: sportSlugToLabel(sportSlug),
    slug: sportSlug,
    sportIds: [],
    sportNames: [],
  } : undefined;
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const sportNamesById = new Map(
    sports.flatMap((entry) => entry.sportIds.map((sportId, index) => [
      sportId,
      entry.sportNames[index] ?? entry.name,
    ] as const)),
  );

  let results: PublicSearchResult[] = [];
  let events: SearchableEvent[] = [];
  let facilities: SearchableFacility[] = [];
  if (kind === 'events') {
    events = await loadSearchableEvents(organizationIds);
    results = buildEventResults({ events, organizationsById, sportNamesById, sport, eventType, locationSlug });
  } else if (kind === 'clubs') {
    results = buildClubResults({ organizations, sport, locationSlug });
  } else {
    facilities = await loadSearchableFacilities(organizationIds);
    results = buildFacilityResults({ facilities, organizationsById, sportNamesById, sport, locationSlug });
  }

  const curatedLocation = locationSlug ? CURATED_LOCATION_BY_SLUG.get(locationSlug) : undefined;
  if ((sportSlug || locationSlug || eventType) && results.length === 0) {
    return null;
  }

  const resolvedLocation = locationSlug
    ? curatedLocation ?? (
      results
        .map((result) => extractPublicSearchLocation(result.location))
        .find((location) => location?.slug === locationSlug) ?? {
          slug: locationSlug,
          label: sportSlugToLabel(locationSlug.replace(/-[a-z]{2}$/i, '')),
        }
    )
    : undefined;
  const copy = pageCopy({ kind, sportName: sport?.name, eventType, location: resolvedLocation });
  const canonicalPath = publicSearchPath({
    kind,
    sportSlug: sport?.slug,
    eventType,
    locationSlug: resolvedLocation?.slug,
  });
  const lastModified = latestDate(results.map((result) => result.lastModified));
  const page: PublicSearchPage = {
    ...copy,
    kind,
    sportName: sport?.name,
    sportSlug: sport?.slug,
    eventType,
    location: resolvedLocation,
    path: canonicalPath,
    canonicalPath,
    discoverHref: buildDiscoverEventsHref({
      sports: sport?.sportNames ?? [],
      location: resolvedLocation?.coordinates
        ? {
            ...resolvedLocation.coordinates,
            label: resolvedLocation.label,
          }
        : undefined,
      distanceMiles: resolvedLocation?.coordinates ? PUBLIC_SEARCH_RADIUS_MILES : undefined,
    }),
    searchRadiusMiles: resolvedLocation?.coordinates ? PUBLIC_SEARCH_RADIUS_MILES : undefined,
    results,
    relatedPages: [],
    lastModified,
  };

  if (!sport) {
    page.relatedPages = sports.flatMap((entry): PublicSearchPageSummary[] => {
      const relatedResults = kind === 'events'
        ? buildEventResults({ events, organizationsById, sportNamesById, sport: entry })
        : kind === 'clubs'
          ? buildClubResults({ organizations, sport: entry })
          : buildFacilityResults({ facilities, organizationsById, sportNamesById, sport: entry });
      if (!relatedResults.length) {
        return [];
      }
      const relatedCopy = pageCopy({ kind, sportName: entry.name });
      return [{
        path: publicSearchPath({ kind, sportSlug: entry.slug }),
        title: relatedCopy.h1,
        description: relatedCopy.description,
        resultCount: relatedResults.length,
        lastModified: latestDate(relatedResults.map((result) => result.lastModified)),
      }];
    });
  } else if (locationSlug) {
    page.relatedPages = [{
      path: publicSearchPath({ kind, sportSlug: sport.slug, eventType }),
      title: `${sport.name} ${kindLabel(kind).toLowerCase()}`,
      description: `Browse all public ${sport.name} ${kindLabel(kind).toLowerCase()} on BracketIQ.`,
      resultCount: results.length,
      lastModified,
    }];
  } else if (kind === 'events' && !eventType) {
    page.relatedPages = (['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[])
      .flatMap((relatedType): PublicSearchPageSummary[] => {
        const relatedResults = buildEventResults({
          events,
          organizationsById,
          sportNamesById,
          sport,
          eventType: relatedType,
        });
        if (!relatedResults.length) {
          return [];
        }
        const relatedCopy = pageCopy({ kind, sportName: sport.name, eventType: relatedType });
        return [{
          path: publicSearchPath({ kind, sportSlug: sport.slug, eventType: relatedType }),
          title: relatedCopy.h1,
          description: relatedCopy.description,
          resultCount: relatedResults.length,
          lastModified: latestDate(relatedResults.map((result) => result.lastModified)),
        }];
      });
  }
  return page;
};

const addSummary = (
  summaries: Map<string, PublicSearchPageSummary>,
  params: {
    kind: PublicSearchKind;
    sport?: PublicSearchSportEntry;
    eventType?: PublicSearchEventType;
    location?: PublicSearchLocation;
    results: PublicSearchResult[];
  },
): void => {
  const path = publicSearchPath({
    kind: params.kind,
    sportSlug: params.sport?.slug,
    eventType: params.eventType,
    locationSlug: params.location?.slug,
  });
  const copy = pageCopy({
    kind: params.kind,
    sportName: params.sport?.name,
    eventType: params.eventType,
    location: params.location,
  });
  if (!params.results.length) {
    return;
  }
  summaries.set(path, {
    path,
    title: copy.title,
    description: copy.description,
    resultCount: params.results.length,
    lastModified: latestDate(params.results.map((result) => result.lastModified)),
  });
};

export const listPublicSearchPageSummaries = async (): Promise<PublicSearchPageSummary[]> => {
  const [sports, organizations] = await Promise.all([
    loadSports(),
    loadSearchableOrganizations(),
  ]);
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const sportNamesById = new Map(
    sports.flatMap((entry) => entry.sportIds.map((sportId, index) => [
      sportId,
      entry.sportNames[index] ?? entry.name,
    ] as const)),
  );
  const [events, facilities] = await Promise.all([
    loadSearchableEvents(organizationIds),
    loadSearchableFacilities(organizationIds),
  ]);

  const summaries = new Map<string, PublicSearchPageSummary>();
  const locationBySlug = new Map<string, PublicSearchLocation>(
    PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS.map((location) => [location.slug, location]),
  );
  const rememberLocation = (location: PublicSearchLocation | null | undefined): string | undefined => {
    if (!location) {
      return undefined;
    }
    const existing = locationBySlug.get(location.slug);
    locationBySlug.set(location.slug, existing?.coordinates
      ? { ...location, coordinates: existing.coordinates }
      : location);
    return location.slug;
  };
  const locationKeys = new Set<string>(PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS.map((location) => location.slug));
  [
    ...events.flatMap((event) => {
      const organization = organizationsById.get(event.organizationId);
      return [rememberLocation(extractPublicSearchLocation(event.location, event.address, organization?.location, organization?.address))];
    }),
    ...organizations.map((organization) => rememberLocation(extractPublicSearchLocation(organization.location, organization.address))),
    ...facilities.flatMap((facility) => {
      const organization = organizationsById.get(facility.organizationId);
      return [rememberLocation(extractPublicSearchLocation(facility.location, facility.address, organization?.location, organization?.address))];
    }),
  ].filter((slug): slug is string => Boolean(slug)).forEach((slug) => locationKeys.add(slug));

  for (const sport of sports) {
    const sportEvents = buildEventResults({ events, organizationsById, sportNamesById, sport });
    if (sportEvents.length) {
      addSummary(summaries, { kind: 'events', sport, results: sportEvents });
    }

    const sportClubs = buildClubResults({ organizations, sport });
    if (sportClubs.length) {
      addSummary(summaries, { kind: 'clubs', sport, results: sportClubs });
    }

    const sportFacilities = buildFacilityResults({ facilities, organizationsById, sportNamesById, sport });
    if (sportFacilities.length) {
      addSummary(summaries, { kind: 'facilities', sport, results: sportFacilities });
    }

    for (const type of ['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[]) {
      const typedEvents = buildEventResults({ events, organizationsById, sportNamesById, sport, eventType: type });
      if (typedEvents.length) {
        addSummary(summaries, { kind: 'events', sport, eventType: type, results: typedEvents });
      }
    }

    for (const location of locationKeys) {
      const locationEntry = locationBySlug.get(location);
      if (!locationEntry) {
        continue;
      }
      const sportLocationEvents = buildEventResults({ events, organizationsById, sportNamesById, sport, locationSlug: location });
      if (sportLocationEvents.length) {
        addSummary(summaries, { kind: 'events', sport, location: locationEntry, results: sportLocationEvents });
      }
      const sportLocationClubs = buildClubResults({ organizations, sport, locationSlug: location });
      if (sportLocationClubs.length) {
        addSummary(summaries, { kind: 'clubs', sport, location: locationEntry, results: sportLocationClubs });
      }
      const sportLocationFacilities = buildFacilityResults({ facilities, organizationsById, sportNamesById, sport, locationSlug: location });
      if (sportLocationFacilities.length) {
        addSummary(summaries, { kind: 'facilities', sport, location: locationEntry, results: sportLocationFacilities });
      }

      for (const type of ['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[]) {
        const typedLocationEvents = buildEventResults({ events, organizationsById, sportNamesById, sport, eventType: type, locationSlug: location });
        if (typedLocationEvents.length) {
          addSummary(summaries, { kind: 'events', sport, eventType: type, location: locationEntry, results: typedLocationEvents });
        }
      }
    }
  }

  return Array.from(summaries.values())
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, PUBLIC_SITEMAP_PAGE_LIMIT);
};

export const listRegularOrganizationProfileSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => {
  const organizations = await loadSearchableOrganizations();
  return organizations
    .filter((organization) => !(organization.slug && organization.publicPageEnabled))
    .map((organization) => ({
      url: absoluteUrl(regularOrganizationPath(organization.id)),
      lastModified: organization.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.65,
    }));
};

export const listRegularPublicEventSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => {
  const organizations = await loadSearchableOrganizations();
  const regularEventOrganizationIds = organizations
    .filter((organization) => !(organization.slug && organization.publicPageEnabled))
    .map((organization) => organization.id);
  if (!regularEventOrganizationIds.length) {
    return [];
  }

  const events = await loadSearchableEvents(regularEventOrganizationIds);
  return events.map((event) => ({
    url: absoluteUrl(regularEventPath(event.id)),
    lastModified: event.updatedAt ?? event.start,
    changeFrequency: 'daily',
    priority: 0.74,
  }));
};

export const listPublicSearchSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => (
  (await listPublicSearchPageSummaries()).map((summary) => ({
    url: absoluteUrl(summary.path),
    lastModified: summary.lastModified,
    changeFrequency: 'daily',
    priority: 0.68,
  }))
);

export const createPublicSearchStructuredData = (page: PublicSearchPage) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'BracketIQ',
          item: SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: page.h1,
          item: absoluteUrl(page.canonicalPath),
        },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: page.h1,
      description: page.description,
      url: absoluteUrl(page.canonicalPath),
    },
    {
      '@type': 'ItemList',
      name: page.h1,
      itemListElement: page.results.map((result, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(result.href),
        item: {
          '@type': result.kind === 'events' ? 'Event' : result.kind === 'clubs' ? 'Organization' : 'Place',
          name: result.title,
          url: absoluteUrl(result.href),
          description: result.description ?? undefined,
          startDate: result.kind === 'events' ? result.start ?? undefined : undefined,
          location: result.location ? {
            '@type': 'Place',
            name: result.location,
          } : undefined,
          image: result.imageUrl ? [absoluteUrl(result.imageUrl)] : [absoluteUrl(FALLBACK_IMAGE_URL)],
        },
      })),
    },
  ],
});

export const getRegularOrganizationSeoData = async (organizationId: string): Promise<{
  id: string;
  name: string;
  description: string;
  canonicalPath: string;
  logoUrl: string;
  location: string | null;
  website: string | null;
  updatedAt?: Date;
  indexable: boolean;
} | null> => {
  const id = normalizeString(organizationId);
  if (!id) {
    return null;
  }
  const row = await (prisma as any).organizations.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      location: true,
      website: true,
      logoId: true,
      publicSlug: true,
      publicPageEnabled: true,
      updatedAt: true,
      status: true,
    },
  });
  if (!row) {
    return null;
  }
  const name = normalizeString(row.name) ?? 'Organization';
  const description = trimForMeta(
    normalizeString(row.description)
      ?? `View ${name}'s sports events, teams, facilities, and registration options on BracketIQ.`,
  );
  const publicSlug = normalizeString(row.publicSlug);
  const publicPageEnabled = row.publicPageEnabled === true;
  return {
    id,
    name,
    description,
    canonicalPath: publicSlug && publicPageEnabled
      ? `/o/${encodeURIComponent(publicSlug)}`
      : regularOrganizationPath(id),
    logoUrl: row.logoId
      ? `/api/files/${encodeURIComponent(String(row.logoId))}/preview?w=240&h=240`
      : `/api/avatars/initials?name=${encodeURIComponent(name)}&size=240&format=png`,
    location: normalizeString(row.location),
    website: normalizeString(row.website),
    updatedAt: toDate(row.updatedAt),
    indexable: row.status === DEFAULT_ORGANIZATION_STATUS,
  };
};

export const createRegularOrganizationStructuredData = (organization: NonNullable<Awaited<ReturnType<typeof getRegularOrganizationSeoData>>>) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${absoluteUrl(organization.canonicalPath)}#organization`,
      name: organization.name,
      url: absoluteUrl(organization.canonicalPath),
      logo: absoluteUrl(organization.logoUrl),
      description: organization.description,
      ...(organization.location ? { location: organization.location } : {}),
      ...(organization.website && /^https?:\/\//i.test(organization.website) ? { sameAs: [organization.website] } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'BracketIQ',
          item: SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: organization.name,
          item: absoluteUrl(organization.canonicalPath),
        },
      ],
    },
  ],
});

const formatEventDateForMeta = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const getRegularPublicEventSeoData = async (eventId: string): Promise<RegularPublicEventSeoData | null> => {
  const id = normalizeString(eventId);
  if (!id) {
    return null;
  }

  const event = await (prisma as any).events.findFirst({
    where: {
      id,
      archivedAt: null,
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    select: {
      id: true,
      name: true,
      description: true,
      start: true,
      end: true,
      location: true,
      address: true,
      price: true,
      imageId: true,
      eventType: true,
      sportId: true,
      organizationId: true,
      updatedAt: true,
    },
  });
  if (!event?.organizationId) {
    return null;
  }

  const organization = await (prisma as any).organizations.findUnique({
    where: { id: event.organizationId },
    select: {
      id: true,
      name: true,
      description: true,
      location: true,
      website: true,
      logoId: true,
      publicSlug: true,
      publicPageEnabled: true,
      status: true,
    },
  });
  if (!organization || organization.status !== DEFAULT_ORGANIZATION_STATUS) {
    return null;
  }

  const sport = event.sportId
    ? await (prisma as any).sports.findUnique({
      where: { id: event.sportId },
      select: { name: true },
    }).catch(() => null)
    : null;
  const eventName = normalizeString(event.name) ?? 'Event';
  const organizationName = normalizeString(organization.name) ?? 'Organization';
  const start = toIsoString(event.start);
  const date = formatEventDateForMeta(start);
  const location = normalizeString(event.location) ?? normalizeString(organization.location);
  const description = trimForMeta(
    normalizeString(event.description)
      ?? `View ${eventName}${date ? ` on ${date}` : ''}${location ? ` in ${location}` : ''}, hosted by ${organizationName} on BracketIQ.`,
  );
  const organizationLogo = organization.logoId
    ? `/api/files/${encodeURIComponent(String(organization.logoId))}/preview?w=240&h=240`
    : `/api/avatars/initials?name=${encodeURIComponent(organizationName)}&size=240&format=png`;
  const imageUrl = event.imageId
    ? `/api/files/${encodeURIComponent(String(event.imageId))}/preview?w=1200&h=675`
    : organizationLogo;
  const publicSlug = normalizeString(organization.publicSlug);
  const publicPageEnabled = organization.publicPageEnabled === true;
  const hasCanonicalPublicRegistrationPage = Boolean(publicSlug && publicPageEnabled);
  const canonicalPath = hasCanonicalPublicRegistrationPage
    ? publicEventPath(publicSlug!, id)
    : regularEventPath(id);

  return {
    event: {
      id,
      name: eventName,
      description: normalizeString(event.description),
      start,
      end: toIsoString(event.end),
      location,
      address: normalizeString(event.address),
      priceCents: typeof event.price === 'number' ? event.price : 0,
      imageUrl,
      eventType: normalizeString(event.eventType),
      sportName: normalizeString(sport?.name),
      updatedAt: toDate(event.updatedAt),
    },
    organization: {
      id: String(organization.id),
      name: organizationName,
      description: normalizeString(organization.description),
      location: normalizeString(organization.location),
      website: normalizeString(organization.website),
      logoUrl: organizationLogo,
      publicSlug,
      publicPageEnabled,
    },
    canonicalPath,
    registrationPath: publicSlug && publicPageEnabled ? publicEventPath(publicSlug, id) : null,
    title: `${eventName} | ${organizationName} on BracketIQ`,
    description,
    indexable: !hasCanonicalPublicRegistrationPage,
  };
};

export const createRegularPublicEventStructuredData = (data: RegularPublicEventSeoData) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${absoluteUrl(regularOrganizationPath(data.organization.id))}#organization`,
      name: data.organization.name,
      url: absoluteUrl(regularOrganizationPath(data.organization.id)),
      logo: absoluteUrl(data.organization.logoUrl),
      ...(data.organization.website && /^https?:\/\//i.test(data.organization.website) ? { sameAs: [data.organization.website] } : {}),
    },
    {
      '@type': 'Event',
      '@id': `${absoluteUrl(data.canonicalPath)}#event`,
      name: data.event.name,
      description: data.description,
      url: absoluteUrl(data.canonicalPath),
      startDate: data.event.start ?? undefined,
      endDate: data.event.end ?? undefined,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: [absoluteUrl(data.event.imageUrl)],
      location: {
        '@type': 'Place',
        name: data.event.location ?? data.organization.location ?? 'Event location',
        ...(data.event.address ? { address: data.event.address } : {}),
      },
      organizer: {
        '@id': `${absoluteUrl(regularOrganizationPath(data.organization.id))}#organization`,
      },
      offers: {
        '@type': 'Offer',
        url: absoluteUrl(data.registrationPath ?? data.canonicalPath),
        price: Number((data.event.priceCents / 100).toFixed(2)),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'BracketIQ',
          item: SITE_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: data.organization.name,
          item: absoluteUrl(regularOrganizationPath(data.organization.id)),
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: data.event.name,
          item: absoluteUrl(data.canonicalPath),
        },
      ],
    },
  ],
});
