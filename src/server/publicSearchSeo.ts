import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { buildDiscoverEventsHref, sportNameToSlug } from '@/lib/discoverFilters';
import { DEFAULT_ORGANIZATION_STATUS } from '@/lib/organizationStatus';
import { SITE_URL } from '@/lib/siteUrl';

const FALLBACK_IMAGE_URL = '/BIQ_drawing.svg';
const PUBLIC_SITEMAP_ORGANIZATION_LIMIT = 5000;
const PUBLIC_SITEMAP_EVENT_LIMIT = 45000;
const PUBLIC_EVENT_DIRECTORY_LIMIT = 12;
const PUBLIC_EVENT_STATES = ['PUBLISHED', null] as const;

type PublicSeoOrganization = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  location?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  publicHeadline?: string | null;
  publicIntroText?: string | null;
};

type PublicSeoEvent = {
  id?: string | null;
  $id?: string | null;
  name?: string | null;
  description?: string | null;
  start?: string | Date | null;
  end?: string | Date | null;
  location?: string | null;
  address?: string | null;
  price?: number | null;
  imageId?: string | null;
  eventType?: string | null;
  $createdAt?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type PublicEventSeoData = {
  organization: PublicSeoOrganization;
  event: PublicSeoEvent;
};

export type PublicEventSportSummary = {
  name: string;
  slug: string;
  sportIds: string[];
  eventCount: number;
  latestUpdatedAt?: Date;
  directoryPath: string;
  discoverHref: string;
};

export type PublicEventDirectoryEvent = {
  id: string;
  name: string;
  start: string | null;
  location: string | null;
  priceCents: number;
  organizationName: string;
  organizationSlug: string;
  eventPath: string;
};

export type PublicEventSportDirectory = {
  sport: PublicEventSportSummary;
  events: PublicEventDirectoryEvent[];
};

const normalizeSlug = (value: string): string => value.trim().toLowerCase();

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

const trimForMeta = (value: string, maxLength = 155): string => {
  const normalized = normalizeString(value) ?? '';
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const truncated = normalized.slice(0, maxLength - 1).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 90 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}...`;
};

const filePreviewUrl = (fileId: unknown, width: number, height: number): string | null => {
  const normalized = normalizeString(fileId);
  if (!normalized) {
    return null;
  }
  return `/api/files/${encodeURIComponent(normalized)}/preview?w=${width}&h=${height}`;
};

const publicEventId = (event: PublicSeoEvent): string => (
  normalizeString(event.id) ?? normalizeString(event.$id) ?? 'event'
);

const publicEventName = (event: PublicSeoEvent): string => (
  normalizeString(event.name) ?? 'Event'
);

export const absoluteUrl = (pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${path}`;
};

export const publicOrganizationPath = (slug: string): string => (
  `/o/${encodeURIComponent(slug)}`
);

export const publicEventPath = (slug: string, eventId: string): string => (
  `${publicOrganizationPath(slug)}/events/${encodeURIComponent(eventId)}`
);

export const publicEventDirectoryPath = (): string => '/find-events';

export const publicEventSportDirectoryPath = (sportSlug: string): string => (
  `${publicEventDirectoryPath()}/${encodeURIComponent(sportSlug)}`
);

export const createPublicOrganizationMetaDescription = (organization: PublicSeoOrganization): string => {
  const provided = normalizeString(organization.publicIntroText)
    ?? normalizeString(organization.description);
  if (provided) {
    return trimForMeta(provided);
  }

  return trimForMeta(
    `Find events, teams, rentals, and registration options for ${organization.name} on BracketIQ.`,
  );
};

const formatEventDateForSearch = (value: unknown): string | null => {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const createPublicEventMetaDescription = ({
  organization,
  event,
}: PublicEventSeoData): string => {
  const provided = normalizeString(event.description);
  if (provided) {
    return trimForMeta(provided);
  }

  const date = formatEventDateForSearch(event.start);
  const location = normalizeString(event.location ?? organization.location);
  const detailParts = [date, location].filter(Boolean).join(' at ');
  const eventName = publicEventName(event);
  return trimForMeta(
    `Register for ${eventName} with ${organization.name}${detailParts ? ` on ${detailParts}` : ''}. View event details and registration options on BracketIQ.`,
  );
};

export const createPublicEventDirectoryMetaDescription = (): string => (
  'Find sports events hosted through BracketIQ by sport, then open matching event results in Discover.'
);

export const createPublicEventSportMetaDescription = (sportName: string): string => (
  trimForMeta(
    `Find ${sportName} events hosted through BracketIQ. Open Discover with ${sportName} selected to browse matching local events, leagues, and tournaments.`,
  )
);

const organizationLogoUrl = (organization: PublicSeoOrganization): string => (
  absoluteUrl(normalizeString(organization.logoUrl) ?? FALLBACK_IMAGE_URL)
);

const eventImageUrls = (organization: PublicSeoOrganization, event: PublicSeoEvent): string[] => {
  const eventImage = filePreviewUrl(event.imageId, 1200, 675);
  if (eventImage) {
    return [absoluteUrl(eventImage)];
  }
  return [organizationLogoUrl(organization)];
};

const organizationNode = (organization: PublicSeoOrganization) => {
  const orgUrl = absoluteUrl(publicOrganizationPath(organization.slug));
  const website = normalizeString(organization.website);

  return {
    '@type': 'Organization',
    '@id': `${orgUrl}#organization`,
    name: organization.name,
    url: orgUrl,
    logo: organizationLogoUrl(organization),
    ...(website && /^https?:\/\//i.test(website) ? { sameAs: [website] } : {}),
  };
};

const breadcrumbNode = (
  items: Array<{ name: string; url: string }>,
) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

export const createPublicOrganizationStructuredData = ({
  organization,
  events,
}: {
  organization: PublicSeoOrganization;
  events: PublicSeoEvent[];
}) => {
  const orgUrl = absoluteUrl(publicOrganizationPath(organization.slug));
  const graph: unknown[] = [
    organizationNode(organization),
    breadcrumbNode([
      { name: 'BracketIQ', url: SITE_URL },
      { name: organization.name, url: orgUrl },
    ]),
  ];

  if (events.length > 0) {
    graph.push({
      '@type': 'ItemList',
      name: `${organization.name} events`,
      itemListElement: events.slice(0, 8).map((event, index) => {
        const eventName = publicEventName(event);
        const url = absoluteUrl(publicEventPath(organization.slug, publicEventId(event)));
        return {
          '@type': 'ListItem',
          position: index + 1,
          url,
          item: {
            '@type': 'Event',
            name: eventName,
            url,
            startDate: toIsoString(event.start) ?? undefined,
          },
        };
      }),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
};

export const createPublicEventStructuredData = ({
  organization,
  event,
}: PublicEventSeoData) => {
  const orgUrl = absoluteUrl(publicOrganizationPath(organization.slug));
  const eventName = publicEventName(event);
  const eventUrl = absoluteUrl(publicEventPath(organization.slug, publicEventId(event)));
  const locationName = normalizeString(event.location) ?? normalizeString(organization.location) ?? 'Event location';
  const address = normalizeString(event.address) ?? normalizeString(event.location) ?? normalizeString(organization.location);
  const priceCents = typeof event.price === 'number' && Number.isFinite(event.price) ? event.price : null;
  const validFrom = toIsoString(event.$createdAt ?? event.createdAt) ?? toIsoString(event.start);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(organization),
      {
        '@type': 'Event',
        '@id': `${eventUrl}#event`,
        name: eventName,
        description: createPublicEventMetaDescription({ organization, event }),
        url: eventUrl,
        startDate: toIsoString(event.start) ?? undefined,
        endDate: toIsoString(event.end) ?? undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        image: eventImageUrls(organization, event),
        location: {
          '@type': 'Place',
          name: locationName,
          ...(address ? { address } : {}),
        },
        organizer: {
          '@id': `${orgUrl}#organization`,
        },
        offers: {
          '@type': 'Offer',
          url: eventUrl,
          price: priceCents === null ? 0 : Number((priceCents / 100).toFixed(2)),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          ...(validFrom ? { validFrom } : {}),
        },
      },
      breadcrumbNode([
        { name: 'BracketIQ', url: SITE_URL },
        { name: organization.name, url: orgUrl },
        { name: eventName, url: eventUrl },
      ]),
    ],
  };
};

export const createPublicEventDirectoryStructuredData = (
  sports: PublicEventSportSummary[],
) => {
  const directoryUrl = absoluteUrl(publicEventDirectoryPath());

  return {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbNode([
        { name: 'BracketIQ', url: SITE_URL },
        { name: 'Find events', url: directoryUrl },
      ]),
      {
        '@type': 'CollectionPage',
        name: 'Find sports events on BracketIQ',
        url: directoryUrl,
      },
      {
        '@type': 'ItemList',
        name: 'Sports events on BracketIQ',
        itemListElement: sports.slice(0, 24).map((sport, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `${sport.name} events`,
          url: absoluteUrl(sport.directoryPath),
        })),
      },
    ],
  };
};

export const createPublicEventSportStructuredData = ({
  sport,
  events,
}: PublicEventSportDirectory) => {
  const sportUrl = absoluteUrl(sport.directoryPath);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbNode([
        { name: 'BracketIQ', url: SITE_URL },
        { name: 'Find events', url: absoluteUrl(publicEventDirectoryPath()) },
        { name: `${sport.name} events`, url: sportUrl },
      ]),
      {
        '@type': 'CollectionPage',
        name: `${sport.name} events on BracketIQ`,
        description: createPublicEventSportMetaDescription(sport.name),
        url: sportUrl,
      },
      {
        '@type': 'ItemList',
        name: `${sport.name} events`,
        itemListElement: events.map((event, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(event.eventPath),
          item: {
            '@type': 'Event',
            name: event.name,
            url: absoluteUrl(event.eventPath),
            startDate: event.start ?? undefined,
            location: event.location
              ? {
                  '@type': 'Place',
                  name: event.location,
                }
              : undefined,
          },
        })),
      },
    ],
  };
};

export const getPublicEventSeoData = async (
  slugInput: string,
  eventId: string,
): Promise<PublicEventSeoData | null> => {
  const slug = normalizeSlug(slugInput);
  if (!slug || !eventId.trim()) {
    return null;
  }

  const organization = await (prisma as any).organizations.findFirst({
    where: {
      publicSlug: slug,
      publicPageEnabled: true,
    },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      description: true,
      location: true,
      website: true,
      logoId: true,
      publicHeadline: true,
      publicIntroText: true,
    },
  });
  if (!organization?.publicSlug) {
    return null;
  }

  const event = await (prisma as any).events.findFirst({
    where: {
      id: eventId,
      organizationId: organization.id,
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
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!event) {
    return null;
  }

  return {
    organization: {
      id: String(organization.id),
      slug: String(organization.publicSlug),
      name: normalizeString(organization.name) ?? 'Organization',
      description: normalizeString(organization.description),
      location: normalizeString(organization.location),
      website: normalizeString(organization.website),
      logoUrl: filePreviewUrl(organization.logoId, 240, 240) ?? FALLBACK_IMAGE_URL,
      publicHeadline: normalizeString(organization.publicHeadline),
      publicIntroText: normalizeString(organization.publicIntroText),
    },
    event: {
      id: String(event.id),
      name: normalizeString(event.name) ?? 'Event',
      description: normalizeString(event.description),
      start: toIsoString(event.start),
      end: toIsoString(event.end),
      location: normalizeString(event.location),
      address: normalizeString(event.address),
      price: typeof event.price === 'number' ? event.price : null,
      imageId: normalizeString(event.imageId),
      eventType: normalizeString(event.eventType),
      createdAt: toIsoString(event.createdAt),
      updatedAt: toIsoString(event.updatedAt),
    },
  };
};

const getPublicOrganizationRows = async (
  limit = PUBLIC_SITEMAP_ORGANIZATION_LIMIT,
): Promise<Array<{ id: string; slug: string; name?: string; updatedAt?: Date }>> => {
  const organizations: Array<Record<string, unknown>> = await (prisma as any).organizations.findMany({
    where: {
      publicPageEnabled: true,
      publicSlug: { not: null },
      status: DEFAULT_ORGANIZATION_STATUS,
    },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      updatedAt: true,
    },
    orderBy: [
      { updatedAt: 'desc' },
      { id: 'asc' },
    ],
    take: limit,
  });

  return organizations.flatMap((organization: Record<string, unknown>) => {
    const id = normalizeString(organization.id);
    const slug = normalizeString(organization.publicSlug);
    if (!id || !slug) {
      return [];
    }

    const row: { id: string; slug: string; name?: string; updatedAt?: Date } = { id, slug };
    const name = normalizeString(organization.name);
    const updatedAt = toDate(organization.updatedAt);
    if (name) {
      row.name = name;
    }
    if (updatedAt) {
      row.updatedAt = updatedAt;
    }
    return [row];
  });
};

export const listPublicEventSportSummaries = async (): Promise<PublicEventSportSummary[]> => {
  const publicOrganizations = await getPublicOrganizationRows();
  if (publicOrganizations.length === 0) {
    return [];
  }

  const events: Array<Record<string, unknown>> = await (prisma as any).events.findMany({
    where: {
      organizationId: { in: publicOrganizations.map((organization) => organization.id) },
      sportId: { not: null },
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    select: {
      sportId: true,
      updatedAt: true,
      start: true,
    },
    orderBy: [
      { start: 'asc' },
      { id: 'asc' },
    ],
    take: PUBLIC_SITEMAP_EVENT_LIMIT,
  });

  const sportIds = Array.from(new Set(
    events
      .map((event) => normalizeString(event.sportId))
      .filter((sportId): sportId is string => Boolean(sportId)),
  ));

  if (sportIds.length === 0) {
    return [];
  }

  const sports: Array<Record<string, unknown>> = await (prisma as any).sports.findMany({
    where: {
      id: { in: sportIds },
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    orderBy: [
      { name: 'asc' },
      { id: 'asc' },
    ],
  });
  const sportEntries = sports.flatMap((sport): Array<readonly [string, { id: string; name: string; updatedAt?: Date }]> => {
    const id = normalizeString(sport.id);
    const name = normalizeString(sport.name);
    if (!id || !name) {
      return [];
    }

    const row: { id: string; name: string; updatedAt?: Date } = { id, name };
    const updatedAt = toDate(sport.updatedAt);
    if (updatedAt) {
      row.updatedAt = updatedAt;
    }
    return [[id, row] as const];
  });
  const sportById = new Map(sportEntries);

  const summaries = new Map<string, PublicEventSportSummary>();
  events.forEach((event) => {
    const sportId = normalizeString(event.sportId);
    const sport = sportId ? sportById.get(sportId) : null;
    if (!sport) {
      return;
    }
    const slug = sportNameToSlug(sport.name);
    if (!slug) {
      return;
    }
    const existing = summaries.get(slug) ?? {
      name: sport.name,
      slug,
      sportIds: [],
      eventCount: 0,
      latestUpdatedAt: sport.updatedAt,
      directoryPath: publicEventSportDirectoryPath(slug),
      discoverHref: buildDiscoverEventsHref({ sports: [sport.name] }),
    };

    if (!existing.sportIds.includes(sport.id)) {
      existing.sportIds.push(sport.id);
    }
    existing.eventCount += 1;

    const eventDate = toDate(event.updatedAt) ?? toDate(event.start);
    if (eventDate && (!existing.latestUpdatedAt || eventDate > existing.latestUpdatedAt)) {
      existing.latestUpdatedAt = eventDate;
    }
    summaries.set(slug, existing);
  });

  return Array.from(summaries.values()).sort((left, right) => (
    left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)
  ));
};

export const getPublicEventSportDirectory = async (
  sportSlugInput: string,
  limit = PUBLIC_EVENT_DIRECTORY_LIMIT,
): Promise<PublicEventSportDirectory | null> => {
  const sportSlug = normalizeSlug(sportSlugInput);
  if (!sportSlug) {
    return null;
  }

  const sport = (await listPublicEventSportSummaries()).find((entry) => entry.slug === sportSlug);
  if (!sport) {
    return null;
  }

  const publicOrganizations = await getPublicOrganizationRows();
  const organizationById = new Map(publicOrganizations.map((organization) => [organization.id, organization]));
  const events: Array<Record<string, unknown>> = await (prisma as any).events.findMany({
    where: {
      organizationId: { in: publicOrganizations.map((organization) => organization.id) },
      sportId: { in: sport.sportIds },
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    select: {
      id: true,
      name: true,
      start: true,
      location: true,
      price: true,
      organizationId: true,
    },
    orderBy: [
      { start: 'asc' },
      { id: 'asc' },
    ],
    take: limit,
  });

  return {
    sport,
    events: events.flatMap((event): PublicEventDirectoryEvent[] => {
      const eventId = normalizeString(event.id);
      const organizationId = normalizeString(event.organizationId);
      const organization = organizationId ? organizationById.get(organizationId) : null;
      if (!eventId || !organization) {
        return [];
      }

      return [{
        id: eventId,
        name: normalizeString(event.name) ?? 'Event',
        start: toIsoString(event.start),
        location: normalizeString(event.location),
        priceCents: typeof event.price === 'number' ? event.price : 0,
        organizationName: organization.name ?? 'Organization',
        organizationSlug: organization.slug,
        eventPath: publicEventPath(organization.slug, eventId),
      }];
    }),
  };
};

export const listPublicSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => {
  const publicOrganizations = await getPublicOrganizationRows();
  if (publicOrganizations.length === 0) {
    return [];
  }

  const slugByOrganizationId = new Map(
    publicOrganizations.map((organization) => [organization.id, organization.slug]),
  );
  const events: Array<Record<string, unknown>> = await (prisma as any).events.findMany({
    where: {
      organizationId: { in: publicOrganizations.map((organization) => organization.id) },
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    select: {
      id: true,
      organizationId: true,
      updatedAt: true,
      start: true,
    },
    orderBy: [
      { start: 'asc' },
      { id: 'asc' },
    ],
    take: PUBLIC_SITEMAP_EVENT_LIMIT,
  });

  const organizationEntries: MetadataRoute.Sitemap = publicOrganizations.map((organization) => ({
    url: absoluteUrl(publicOrganizationPath(organization.slug)),
    lastModified: organization.updatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const eventEntries: MetadataRoute.Sitemap = events
    .flatMap((event: Record<string, unknown>): MetadataRoute.Sitemap => {
      const eventId = normalizeString(event.id);
      const organizationId = normalizeString(event.organizationId);
      const slug = organizationId ? slugByOrganizationId.get(organizationId) : null;
      if (!eventId || !slug) {
        return [];
      }
      return [
        {
          url: absoluteUrl(publicEventPath(slug, eventId)),
          lastModified: toDate(event.updatedAt) ?? toDate(event.start),
          changeFrequency: 'daily',
          priority: 0.75,
        },
      ];
    });

  const sportEntries: MetadataRoute.Sitemap = (await listPublicEventSportSummaries()).map((sport) => ({
    url: absoluteUrl(sport.directoryPath),
    lastModified: sport.latestUpdatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...organizationEntries, ...eventEntries, ...sportEntries];
};
