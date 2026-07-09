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

export type PublicSearchKind = 'events' | 'clubs' | 'facilities';
export type PublicSearchEventType = 'events' | 'leagues' | 'tournaments' | 'weekly-events';

export type PublicSearchLocation = {
  slug: string;
  label: string;
  city?: string;
  state?: string;
};

export type PublicSearchPageSummary = {
  path: string;
  title: string;
  description: string;
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
  updatedAt?: Date;
};

type SearchableEvent = {
  id: string;
  name: string;
  description: string | null;
  start?: Date;
  location: string | null;
  address: string | null;
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
  updatedAt?: Date;
  sportIds: string[];
};

type SportEntry = {
  id: string;
  name: string;
  slug: string;
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
  { slug: 'seattle-wa', label: 'Seattle, WA', city: 'Seattle', state: 'WA' },
  { slug: 'spokane-wa', label: 'Spokane, WA', city: 'Spokane', state: 'WA' },
  { slug: 'tacoma-wa', label: 'Tacoma, WA', city: 'Tacoma', state: 'WA' },
  { slug: 'vancouver-wa', label: 'Vancouver, WA', city: 'Vancouver', state: 'WA' },
  { slug: 'bellevue-wa', label: 'Bellevue, WA', city: 'Bellevue', state: 'WA' },
  { slug: 'kent-wa', label: 'Kent, WA', city: 'Kent', state: 'WA' },
  { slug: 'everett-wa', label: 'Everett, WA', city: 'Everett', state: 'WA' },
  { slug: 'renton-wa', label: 'Renton, WA', city: 'Renton', state: 'WA' },
  { slug: 'yakima-wa', label: 'Yakima, WA', city: 'Yakima', state: 'WA' },
  { slug: 'federal-way-wa', label: 'Federal Way, WA', city: 'Federal Way', state: 'WA' },
  { slug: 'spokane-valley-wa', label: 'Spokane Valley, WA', city: 'Spokane Valley', state: 'WA' },
  { slug: 'kirkland-wa', label: 'Kirkland, WA', city: 'Kirkland', state: 'WA' },
  { slug: 'bellingham-wa', label: 'Bellingham, WA', city: 'Bellingham', state: 'WA' },
  { slug: 'kennewick-wa', label: 'Kennewick, WA', city: 'Kennewick', state: 'WA' },
  { slug: 'auburn-wa', label: 'Auburn, WA', city: 'Auburn', state: 'WA' },
  { slug: 'pasco-wa', label: 'Pasco, WA', city: 'Pasco', state: 'WA' },
  { slug: 'marysville-wa', label: 'Marysville, WA', city: 'Marysville', state: 'WA' },
  { slug: 'redmond-wa', label: 'Redmond, WA', city: 'Redmond', state: 'WA' },
  { slug: 'sammamish-wa', label: 'Sammamish, WA', city: 'Sammamish', state: 'WA' },
  { slug: 'lakewood-wa', label: 'Lakewood, WA', city: 'Lakewood', state: 'WA' },
  { slug: 'portland-or', label: 'Portland, OR', city: 'Portland', state: 'OR' },
  { slug: 'eugene-or', label: 'Eugene, OR', city: 'Eugene', state: 'OR' },
  { slug: 'salem-or', label: 'Salem, OR', city: 'Salem', state: 'OR' },
  { slug: 'gresham-or', label: 'Gresham, OR', city: 'Gresham', state: 'OR' },
  { slug: 'hillsboro-or', label: 'Hillsboro, OR', city: 'Hillsboro', state: 'OR' },
  { slug: 'bend-or', label: 'Bend, OR', city: 'Bend', state: 'OR' },
  { slug: 'beaverton-or', label: 'Beaverton, OR', city: 'Beaverton', state: 'OR' },
  { slug: 'medford-or', label: 'Medford, OR', city: 'Medford', state: 'OR' },
  { slug: 'springfield-or', label: 'Springfield, OR', city: 'Springfield', state: 'OR' },
  { slug: 'corvallis-or', label: 'Corvallis, OR', city: 'Corvallis', state: 'OR' },
  { slug: 'albany-or', label: 'Albany, OR', city: 'Albany', state: 'OR' },
  { slug: 'tigard-or', label: 'Tigard, OR', city: 'Tigard', state: 'OR' },
  { slug: 'lake-oswego-or', label: 'Lake Oswego, OR', city: 'Lake Oswego', state: 'OR' },
  { slug: 'keizer-or', label: 'Keizer, OR', city: 'Keizer', state: 'OR' },
  { slug: 'grants-pass-or', label: 'Grants Pass, OR', city: 'Grants Pass', state: 'OR' },
  { slug: 'oregon-city-or', label: 'Oregon City, OR', city: 'Oregon City', state: 'OR' },
  { slug: 'mcminnville-or', label: 'McMinnville, OR', city: 'McMinnville', state: 'OR' },
  { slug: 'redmond-or', label: 'Redmond, OR', city: 'Redmond', state: 'OR' },
];

const CURATED_LOCATION_BY_SLUG = new Map(
  PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS.map((location) => [location.slug, location]),
);

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

const facilityHref = (facility: SearchableFacility): string => (
  `${regularOrganizationPath(facility.organizationId)}/facilities`
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

const loadSports = async (): Promise<SportEntry[]> => {
  const rows: Array<Record<string, unknown>> = await (prisma as any).sports.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return rows.flatMap((row): SportEntry[] => {
    const id = normalizeString(row.id);
    const name = normalizeString(row.name);
    const slug = name ? sportNameToSlug(name) : '';
    return id && name && slug ? [{ id, name, slug }] : [];
  });
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
      location: true,
      address: true,
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
      location: normalizeString(row.location),
      address: normalizeString(row.address),
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
      updatedAt: toDate(row.updatedAt),
      sportIds: Array.from(sportIdsByFacilityId.get(id) ?? []),
    }];
  });
};

const parseEventSportAndType = (
  segment: string | undefined,
  sports: SportEntry[],
): { sport?: SportEntry; eventType?: PublicSearchEventType } => {
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
  sports: SportEntry[];
}): { sport?: SportEntry; eventType?: PublicSearchEventType; locationSlug?: string } => {
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
  } : undefined;
  return {
    sport,
    locationSlug: second || undefined,
  };
};

const resultMatchesLocation = (
  locationSlugInput: string | undefined,
  ...locationValues: Array<unknown>
): boolean => {
  if (!locationSlugInput) {
    return true;
  }
  return extractPublicSearchLocation(...locationValues)?.slug === locationSlugInput;
};

const organizationMatchesSport = (organization: SearchableOrganization, sportName: string | undefined): boolean => {
  if (!sportName) {
    return true;
  }
  const normalizedSport = sportName.trim().toLowerCase();
  return organization.sports.some((sport) => sport.trim().toLowerCase() === normalizedSport);
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
    ? trimForMeta(`Find ${subject}${locationText} hosted through BracketIQ. Browse real public listings and open filtered Discover results for local events, leagues, and tournaments.`)
    : trimForMeta(`Find ${subject}${locationText} on BracketIQ. Browse public organization profiles and local sports listings.`);
  return { title, h1, description };
};

const buildEventResults = ({
  events,
  organizationsById,
  sportsById,
  sport,
  eventType,
  locationSlug,
}: {
  events: SearchableEvent[];
  organizationsById: Map<string, SearchableOrganization>;
  sportsById: Map<string, SportEntry>;
  sport?: SportEntry;
  eventType?: PublicSearchEventType;
  locationSlug?: string;
}): PublicSearchResult[] => {
  const dbEventType = eventType ? EVENT_TYPE_TO_DB[eventType] : undefined;
  return events
    .filter((event) => !sport || event.sportId === sport.id)
    .filter((event) => !dbEventType || event.eventType === dbEventType)
    .filter((event) => {
      const organization = organizationsById.get(event.organizationId);
      return organization && resultMatchesLocation(locationSlug, event.location, event.address, organization.location, organization.address);
    })
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((event) => {
      const organization = organizationsById.get(event.organizationId)!;
      const eventSport = event.sportId ? sportsById.get(event.sportId) : undefined;
      return {
        id: event.id,
        kind: 'events' as const,
        title: event.name,
        description: event.description,
        href: eventHref(event, organization),
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        sportName: eventSport?.name ?? null,
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
  sport?: SportEntry;
  locationSlug?: string;
}): PublicSearchResult[] => (
  organizations
    .filter((organization) => organizationMatchesSport(organization, sport?.name))
    .filter((organization) => resultMatchesLocation(locationSlug, organization.location, organization.address))
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((organization) => ({
      id: organization.id,
      kind: 'clubs' as const,
      title: organization.name,
      description: organization.description,
      href: regularOrganizationPath(organization.id),
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
  sportsById,
  sport,
  locationSlug,
}: {
  facilities: SearchableFacility[];
  organizationsById: Map<string, SearchableOrganization>;
  sportsById: Map<string, SportEntry>;
  sport?: SportEntry;
  locationSlug?: string;
}): PublicSearchResult[] => (
  facilities
    .filter((facility) => !sport || facility.sportIds.includes(sport.id))
    .filter((facility) => {
      const organization = organizationsById.get(facility.organizationId);
      return organization && resultMatchesLocation(locationSlug, facility.location, facility.address, organization.location, organization.address);
    })
    .slice(0, PUBLIC_RESULT_LIMIT)
    .map((facility) => {
      const organization = organizationsById.get(facility.organizationId)!;
      const facilitySports = facility.sportIds.map((sportId) => sportsById.get(sportId)?.name).filter(Boolean);
      return {
        id: facility.id,
        kind: 'facilities' as const,
        title: facility.name,
        description: facilitySports.length ? `${facilitySports.join(', ')} facility operated by ${organization.name}.` : `Facility operated by ${organization.name}.`,
        href: facilityHref(facility),
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

const relatedPagesFor = (page: PublicSearchPage): PublicSearchPageSummary[] => {
  const related: PublicSearchPageSummary[] = [];
  if (page.kind !== 'events' && page.sportSlug) {
    const path = publicSearchPath({
      kind: 'events',
      sportSlug: page.sportSlug,
      locationSlug: page.location?.slug,
    });
    related.push({
      path,
      title: `${page.sportName} events${page.location ? ` near ${page.location.label}` : ''}`,
      description: `Browse ${page.sportName} events on BracketIQ.`,
      lastModified: page.lastModified,
    });
  }
  if (page.kind === 'events' && page.sportSlug) {
    related.push({
      path: publicSearchPath({ kind: 'clubs', sportSlug: page.sportSlug, locationSlug: page.location?.slug }),
      title: `${page.sportName} clubs${page.location ? ` near ${page.location.label}` : ''}`,
      description: `Browse ${page.sportName} clubs on BracketIQ.`,
      lastModified: page.lastModified,
    });
  }
  return related;
};

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
  } : undefined;
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const sportsById = new Map(sports.map((entry) => [entry.id, entry]));

  let results: PublicSearchResult[] = [];
  if (kind === 'events') {
    const events = await loadSearchableEvents(organizationIds);
    results = buildEventResults({ events, organizationsById, sportsById, sport, eventType, locationSlug });
  } else if (kind === 'clubs') {
    results = buildClubResults({ organizations, sport, locationSlug });
  } else {
    const facilities = await loadSearchableFacilities(organizationIds);
    results = buildFacilityResults({ facilities, organizationsById, sportsById, sport, locationSlug });
  }

  const curatedLocation = locationSlug ? CURATED_LOCATION_BY_SLUG.get(locationSlug) : undefined;
  const isCuratedSportLocationPage = Boolean(sportFromCatalog && curatedLocation && locationSlug);

  if ((sportSlug || locationSlug || eventType) && results.length === 0 && !isCuratedSportLocationPage) {
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
      query: resolvedLocation?.label,
      sports: sport?.name ? [sport.name] : [],
    }),
    results,
    relatedPages: [],
    lastModified,
  };
  page.relatedPages = relatedPagesFor(page);
  return page;
};

const addSummary = (
  summaries: Map<string, PublicSearchPageSummary>,
  params: {
    kind: PublicSearchKind;
    sport?: SportEntry;
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
  const existing = summaries.get(path);
  if (existing && params.results.length === 0) {
    return;
  }
  summaries.set(path, {
    path,
    title: copy.title,
    description: copy.description,
    lastModified: latestDate(params.results.map((result) => result.lastModified)) ?? existing?.lastModified,
  });
};

export const listPublicSearchPageSummaries = async (): Promise<PublicSearchPageSummary[]> => {
  const [sports, organizations] = await Promise.all([
    loadSports(),
    loadSearchableOrganizations(),
  ]);
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const sportsById = new Map(sports.map((sport) => [sport.id, sport]));
  const [events, facilities] = await Promise.all([
    loadSearchableEvents(organizationIds),
    loadSearchableFacilities(organizationIds),
  ]);

  const summaries = new Map<string, PublicSearchPageSummary>();
  const locationBySlug = new Map<string, PublicSearchLocation>();
  const rememberLocation = (location: PublicSearchLocation | null | undefined): string | undefined => {
    if (!location) {
      return undefined;
    }
    locationBySlug.set(location.slug, location);
    return location.slug;
  };
  const locationKeys = new Set<string>();
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
    const sportEvents = buildEventResults({ events, organizationsById, sportsById, sport });
    if (sportEvents.length) {
      addSummary(summaries, { kind: 'events', sport, results: sportEvents });
    }

    const sportClubs = buildClubResults({ organizations, sport });
    if (sportClubs.length) {
      addSummary(summaries, { kind: 'clubs', sport, results: sportClubs });
    }

    const sportFacilities = buildFacilityResults({ facilities, organizationsById, sportsById, sport });
    if (sportFacilities.length) {
      addSummary(summaries, { kind: 'facilities', sport, results: sportFacilities });
    }

    for (const type of ['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[]) {
      const typedEvents = buildEventResults({ events, organizationsById, sportsById, sport, eventType: type });
      if (typedEvents.length) {
        addSummary(summaries, { kind: 'events', sport, eventType: type, results: typedEvents });
      }
    }

    for (const location of locationKeys) {
      const locationEntry = locationBySlug.get(location);
      if (!locationEntry) {
        continue;
      }
      const sportLocationEvents = buildEventResults({ events, organizationsById, sportsById, sport, locationSlug: location });
      if (sportLocationEvents.length) {
        addSummary(summaries, { kind: 'events', sport, location: locationEntry, results: sportLocationEvents });
      }
      const sportLocationClubs = buildClubResults({ organizations, sport, locationSlug: location });
      if (sportLocationClubs.length) {
        addSummary(summaries, { kind: 'clubs', sport, location: locationEntry, results: sportLocationClubs });
      }
      const sportLocationFacilities = buildFacilityResults({ facilities, organizationsById, sportsById, sport, locationSlug: location });
      if (sportLocationFacilities.length) {
        addSummary(summaries, { kind: 'facilities', sport, location: locationEntry, results: sportLocationFacilities });
      }

      for (const type of ['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[]) {
        const typedLocationEvents = buildEventResults({ events, organizationsById, sportsById, sport, eventType: type, locationSlug: location });
        if (typedLocationEvents.length) {
          addSummary(summaries, { kind: 'events', sport, eventType: type, location: locationEntry, results: typedLocationEvents });
        }
      }
    }
  }

  for (const sport of sports) {
    for (const location of PACIFIC_NORTHWEST_MAJOR_SEARCH_LOCATIONS) {
      addSummary(summaries, { kind: 'events', sport, location, results: [] });
      addSummary(summaries, { kind: 'clubs', sport, location, results: [] });
      addSummary(summaries, { kind: 'facilities', sport, location, results: [] });
      for (const type of ['leagues', 'tournaments', 'weekly-events'] as PublicSearchEventType[]) {
        addSummary(summaries, { kind: 'events', sport, eventType: type, location, results: [] });
      }
    }
  }

  return Array.from(summaries.values())
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, PUBLIC_SITEMAP_PAGE_LIMIT);
};

export const listRegularOrganizationProfileSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => {
  const organizations = await loadSearchableOrganizations();
  return organizations.map((organization) => ({
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
  return {
    id,
    name,
    description,
    canonicalPath: regularOrganizationPath(id),
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
