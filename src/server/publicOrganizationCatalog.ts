import { prisma } from '@/lib/prisma';

export type PublicCatalogSurface = 'page' | 'widget' | 'any';
export type PublicWidgetKind = 'all' | 'events' | 'teams' | 'rentals' | 'products';

export type PublicOrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  website: string | null;
  logoUrl: string;
  sports: string[];
  brandPrimaryColor: string;
  brandAccentColor: string;
  publicHeadline: string;
  publicIntroText: string;
  publicPageEnabled: boolean;
  publicWidgetsEnabled: boolean;
};

export type PublicOrganizationEventCard = {
  id: string;
  name: string;
  description: string | null;
  start: string;
  end: string | null;
  location: string;
  eventType: string;
  sportName: string | null;
  priceCents: number;
  imageUrl: string;
  divisionLabels: string[];
  detailsUrl: string;
};

export type PublicOrganizationTeamCard = {
  id: string;
  name: string;
  sport: string | null;
  division: string | null;
  imageUrl: string;
};

export type PublicOrganizationRentalCard = {
  id: string;
  fieldId: string;
  fieldName: string;
  location: string | null;
  priceCents: number;
  start: string | null;
  end: string | null;
  detailsUrl: string;
};

export type PublicOrganizationProductCard = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  period: string;
  detailsUrl: string;
};

export type PublicOrganizationCatalog = {
  organization: PublicOrganizationSummary;
  events: PublicOrganizationEventCard[];
  teams: PublicOrganizationTeamCard[];
  rentals: PublicOrganizationRentalCard[];
  products: PublicOrganizationProductCard[];
};

const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_ACCENT_COLOR = '#f59e0b';
const FALLBACK_IMAGE_URL = '/bracketiq-shield.svg';
const PUBLIC_EVENT_STATES = ['PUBLISHED', null] as const;
const DEFAULT_LIMIT = 8;

const normalizeSlug = (value: string): string => value.trim().toLowerCase();

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const normalizeIdList = normalizeStringArray;

const normalizeLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 24);
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
};

const imageUrl = (fileId: unknown, width: number = 640, height: number = 360): string => (
  typeof fileId === 'string' && fileId.trim().length > 0
    ? `/api/files/${encodeURIComponent(fileId.trim())}/preview?w=${width}&h=${height}`
    : FALLBACK_IMAGE_URL
);

const formatEventDetailsUrl = (slug: string, eventId: string): string => (
  `/o/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`
);

const publicOrgFromRow = (row: Record<string, any>): PublicOrganizationSummary => {
  const slug = String(row.publicSlug ?? '').trim();
  const name = String(row.name ?? 'Organization').trim() || 'Organization';
  return {
    id: String(row.id),
    slug,
    name,
    description: typeof row.description === 'string' ? row.description : null,
    location: typeof row.location === 'string' ? row.location : null,
    website: typeof row.website === 'string' ? row.website : null,
    logoUrl: imageUrl(row.logoId, 240, 240),
    sports: normalizeStringArray(row.sports),
    brandPrimaryColor: typeof row.brandPrimaryColor === 'string' && row.brandPrimaryColor
      ? row.brandPrimaryColor
      : DEFAULT_PRIMARY_COLOR,
    brandAccentColor: typeof row.brandAccentColor === 'string' && row.brandAccentColor
      ? row.brandAccentColor
      : DEFAULT_ACCENT_COLOR,
    publicHeadline: typeof row.publicHeadline === 'string' && row.publicHeadline.trim()
      ? row.publicHeadline.trim()
      : `${name} on BracketIQ`,
    publicIntroText: typeof row.publicIntroText === 'string' && row.publicIntroText.trim()
      ? row.publicIntroText.trim()
      : 'Find upcoming events, teams, rentals, and products.',
    publicPageEnabled: row.publicPageEnabled === true,
    publicWidgetsEnabled: row.publicWidgetsEnabled === true,
  };
};

export const getPublicOrganizationBySlug = async (
  slugInput: string,
  options: { surface?: PublicCatalogSurface } = {},
): Promise<PublicOrganizationSummary | null> => {
  const slug = normalizeSlug(slugInput);
  if (!slug) {
    return null;
  }

  const row = await (prisma as any).organizations.findUnique({
    where: { publicSlug: slug },
  });
  if (!row) {
    return null;
  }

  const organization = publicOrgFromRow(row);
  const surface = options.surface ?? 'page';
  if (surface === 'page' && !organization.publicPageEnabled) {
    return null;
  }
  if (surface === 'widget' && !organization.publicWidgetsEnabled) {
    return null;
  }
  if (surface === 'any' && !organization.publicPageEnabled && !organization.publicWidgetsEnabled) {
    return null;
  }
  return organization;
};

const getSportsById = async (sportIds: string[]): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(sportIds.filter(Boolean)));
  if (!unique.length) {
    return new Map();
  }
  const rows = await (prisma as any).sports.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row: { id: string; name: string }) => [row.id, row.name]));
};

const getDivisionLabelsByEventId = async (events: Array<Record<string, any>>): Promise<Map<string, string[]>> => {
  const eventIds = events.map((event) => String(event.id)).filter(Boolean);
  if (!eventIds.length) {
    return new Map();
  }
  const rows = await (prisma as any).divisions.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, id: true, key: true, name: true },
    orderBy: { name: 'asc' },
  });
  const rowsByEventId = new Map<string, Array<Record<string, string | null>>>();
  rows.forEach((row: Record<string, string | null>) => {
    const eventRows = rowsByEventId.get(String(row.eventId)) ?? [];
    eventRows.push(row);
    rowsByEventId.set(String(row.eventId), eventRows);
  });

  return new Map(events.map((event) => {
    const divisionIds = normalizeIdList(event.divisions);
    const eventRows = rowsByEventId.get(String(event.id)) ?? [];
    const labels = divisionIds.length
      ? divisionIds.map((divisionId) => {
        const normalized = divisionId.toLowerCase();
        const row = eventRows.find((candidate) => (
          String(candidate.id ?? '').toLowerCase() === normalized
          || String(candidate.key ?? '').toLowerCase() === normalized
        ));
        return row?.name || divisionId;
      })
      : eventRows.map((row) => row.name || row.key || row.id).filter(Boolean);
    return [String(event.id), Array.from(new Set(labels.filter(Boolean).map(String)))] as const;
  }));
};

export const listPublicOrganizationEvents = async (
  organization: PublicOrganizationSummary,
  options: { limit?: number } = {},
): Promise<PublicOrganizationEventCard[]> => {
  const events = await (prisma as any).events.findMany({
    where: {
      organizationId: organization.id,
      OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
      NOT: { state: 'TEMPLATE' },
    },
    orderBy: { start: 'asc' },
    take: normalizeLimit(options.limit),
  });
  const sportsById = await getSportsById(
    events.map((event: Record<string, any>) => (typeof event.sportId === 'string' ? event.sportId : '')),
  );
  const divisionLabelsByEventId = await getDivisionLabelsByEventId(events);

  return events.map((event: Record<string, any>): PublicOrganizationEventCard => ({
    id: String(event.id),
    name: String(event.name ?? 'Untitled event'),
    description: typeof event.description === 'string' ? event.description : null,
    start: toIsoString(event.start) ?? new Date().toISOString(),
    end: toIsoString(event.end),
    location: String(event.location ?? organization.location ?? 'Location TBD'),
    eventType: String(event.eventType ?? 'EVENT'),
    sportName: typeof event.sportId === 'string' ? sportsById.get(event.sportId) ?? event.sportId : null,
    priceCents: typeof event.price === 'number' ? event.price : 0,
    imageUrl: imageUrl(event.imageId),
    divisionLabels: divisionLabelsByEventId.get(String(event.id)) ?? [],
    detailsUrl: formatEventDetailsUrl(organization.slug, String(event.id)),
  }));
};

export const listPublicOrganizationTeams = async (
  organization: PublicOrganizationSummary,
  options: { limit?: number } = {},
): Promise<PublicOrganizationTeamCard[]> => {
  const rows = await (prisma as any).canonicalTeams.findMany({
    where: { organizationId: organization.id },
    orderBy: { name: 'asc' },
    take: normalizeLimit(options.limit),
  });
  return rows.map((team: Record<string, any>): PublicOrganizationTeamCard => ({
    id: String(team.id),
    name: String(team.name ?? 'Unnamed team'),
    sport: typeof team.sport === 'string' ? team.sport : null,
    division: typeof team.divisionTypeName === 'string'
      ? team.divisionTypeName
      : typeof team.division === 'string'
        ? team.division
        : null,
    imageUrl: imageUrl(team.profileImageId, 240, 240),
  }));
};

export const listPublicOrganizationRentals = async (
  organization: PublicOrganizationSummary,
  options: { limit?: number } = {},
): Promise<PublicOrganizationRentalCard[]> => {
  const fields = await (prisma as any).fields.findMany({
    where: { organizationId: organization.id },
    orderBy: [{ fieldNumber: 'asc' }, { name: 'asc' }],
  });
  const fieldBySlotId = new Map<string, Record<string, any>>();
  fields.forEach((field: Record<string, any>) => {
    normalizeIdList(field.rentalSlotIds).forEach((slotId) => fieldBySlotId.set(slotId, field));
  });
  const slotIds = Array.from(fieldBySlotId.keys());
  if (!slotIds.length) {
    return [];
  }
  const slots = await (prisma as any).timeSlots.findMany({
    where: {
      id: { in: slotIds },
      price: { not: null },
    },
    orderBy: { startDate: 'asc' },
    take: normalizeLimit(options.limit),
  });
  return slots.map((slot: Record<string, any>): PublicOrganizationRentalCard => {
    const field = fieldBySlotId.get(String(slot.id)) ?? {};
    return {
      id: String(slot.id),
      fieldId: String(field.id ?? ''),
      fieldName: String(field.name ?? `Field ${field.fieldNumber ?? ''}`).trim() || 'Rental field',
      location: typeof field.location === 'string' ? field.location : organization.location,
      priceCents: typeof slot.price === 'number' ? slot.price : 0,
      start: toIsoString(slot.startDate),
      end: toIsoString(slot.endDate),
      detailsUrl: `/o/${encodeURIComponent(organization.slug)}#rentals`,
    };
  });
};

export const listPublicOrganizationProducts = async (
  organization: PublicOrganizationSummary,
  options: { limit?: number } = {},
): Promise<PublicOrganizationProductCard[]> => {
  const rows = await (prisma as any).products.findMany({
    where: {
      organizationId: organization.id,
      OR: [{ isActive: true }, { isActive: null }],
    },
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(options.limit),
  });
  return rows.map((product: Record<string, any>): PublicOrganizationProductCard => ({
    id: String(product.id),
    name: String(product.name ?? 'Product'),
    description: typeof product.description === 'string' ? product.description : null,
    priceCents: typeof product.priceCents === 'number' ? product.priceCents : 0,
    period: String(product.period ?? 'SINGLE'),
    detailsUrl: `/o/${encodeURIComponent(organization.slug)}#products`,
  }));
};

export const getPublicOrganizationCatalog = async (
  slug: string,
  options: { surface?: PublicCatalogSurface; limit?: number } = {},
): Promise<PublicOrganizationCatalog | null> => {
  const organization = await getPublicOrganizationBySlug(slug, { surface: options.surface ?? 'page' });
  if (!organization) {
    return null;
  }
  const [events, teams, rentals, products] = await Promise.all([
    listPublicOrganizationEvents(organization, { limit: options.limit }),
    listPublicOrganizationTeams(organization, { limit: options.limit }),
    listPublicOrganizationRentals(organization, { limit: options.limit }),
    listPublicOrganizationProducts(organization, { limit: options.limit }),
  ]);
  return { organization, events, teams, rentals, products };
};

export const getPublicOrganizationEventForRegistration = async (
  slug: string,
  eventId: string,
): Promise<{ organization: PublicOrganizationSummary; event: Record<string, any> } | null> => {
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'page' });
  if (!organization) {
    return null;
  }
  const event = await (prisma as any).events.findUnique({ where: { id: eventId } });
  if (!event || event.organizationId !== organization.id) {
    return null;
  }
  const eventState = String(event.state ?? '').toUpperCase();
  if (eventState && eventState !== 'PUBLISHED') {
    return null;
  }

  const [sport, divisionDetails, playoffDivisionDetails, fields, timeSlots, teams] = await Promise.all([
    typeof event.sportId === 'string'
      ? (prisma as any).sports.findUnique({ where: { id: event.sportId } })
      : Promise.resolve(null),
    (prisma as any).divisions.findMany({
      where: { eventId, kind: { not: 'PLAYOFF' } },
      orderBy: { name: 'asc' },
    }),
    (prisma as any).divisions.findMany({
      where: { eventId, kind: 'PLAYOFF' },
      orderBy: { name: 'asc' },
    }),
    normalizeIdList(event.fieldIds).length
      ? (prisma as any).fields.findMany({ where: { id: { in: normalizeIdList(event.fieldIds) } } })
      : Promise.resolve([]),
    normalizeIdList(event.timeSlotIds).length
      ? (prisma as any).timeSlots.findMany({ where: { id: { in: normalizeIdList(event.timeSlotIds) } } })
      : Promise.resolve([]),
    normalizeIdList(event.teamIds).length
      ? (prisma as any).teams.findMany({ where: { id: { in: normalizeIdList(event.teamIds) } } })
      : Promise.resolve([]),
  ]);

  return {
    organization,
    event: {
      ...event,
      $id: event.id,
      $createdAt: toIsoString(event.createdAt) ?? '',
      $updatedAt: toIsoString(event.updatedAt) ?? '',
      start: toIsoString(event.start) ?? new Date().toISOString(),
      end: toIsoString(event.end),
      state: 'PUBLISHED',
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
      officialIds: [],
      sport: sport ? { ...sport, $id: sport.id } : undefined,
      organization: {
        $id: organization.id,
        name: organization.name,
        logoId: null,
      },
      divisionDetails: divisionDetails.map((row: Record<string, any>) => ({ ...row, $id: row.id })),
      playoffDivisionDetails: playoffDivisionDetails.map((row: Record<string, any>) => ({ ...row, $id: row.id })),
      fields: fields.map((row: Record<string, any>) => ({ ...row, $id: row.id })),
      timeSlots: timeSlots.map((row: Record<string, any>) => ({ ...row, $id: row.id })),
      teams: teams.map((row: Record<string, any>) => ({
        ...row,
        $id: row.id,
        playerIds: [],
        pending: [],
        currentSize: 0,
        isFull: false,
      })),
      players: [],
      officials: [],
      assistantHosts: [],
      staffInvites: [],
    },
  };
};

