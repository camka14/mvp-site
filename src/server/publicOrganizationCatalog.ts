import { prisma } from '@/lib/prisma';
import type { Field, Organization, Product, ProductPeriod, TimeSlot } from '@/types';

export type PublicCatalogSurface = 'page' | 'widget' | 'any';
export type PublicWidgetKind = 'all' | 'events' | 'teams' | 'rentals' | 'products';
export type PublicEventDateRule = 'all' | 'upcoming' | 'today' | 'week' | 'month';

export type PublicPaginationInfo = {
  limit: number;
  page: number;
  offset: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

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
  publicCompletionRedirectUrl: string | null;
};

export type PublicOrganizationEventCard = {
  id: string;
  name: string;
  description: string | null;
  start: string;
  end: string | null;
  location: string;
  eventType: string;
  eventTypeLabel: string;
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
  eventPageInfo: PublicPaginationInfo;
  teams: PublicOrganizationTeamCard[];
  rentals: PublicOrganizationRentalCard[];
  products: PublicOrganizationProductCard[];
};

export type PublicOrganizationRentalSelectionData = {
  organization: PublicOrganizationSummary;
  rentalOrganization: Organization;
};

export type PublicOrganizationProductCheckoutData = {
  organization: PublicOrganizationSummary;
  product: Product;
};

const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_ACCENT_COLOR = '#f59e0b';
const FALLBACK_IMAGE_URL = '/bracketiq-shield.svg';
const PUBLIC_EVENT_STATES = ['PUBLISHED', null] as const;
const DEFAULT_LIMIT = 8;
const PUBLIC_EVENT_QUERY_CAP = 300;
const DEFAULT_WEEKLY_OCCURRENCE_WEEKS = 12;
export const PUBLIC_EVENT_TYPES = ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT'] as const;
const PUBLIC_EVENT_TYPE_SET = new Set<string>(PUBLIC_EVENT_TYPES);
const PUBLIC_EVENT_TYPE_LABELS: Record<string, string> = {
  EVENT: 'Event',
  TOURNAMENT: 'Tournament',
  LEAGUE: 'League',
  WEEKLY_EVENT: 'Weekly Event',
};

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

const normalizeNullableString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const normalizeProductPeriodForClient = (value: unknown): ProductPeriod => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'single' || normalized === 'single_purchase' || normalized === 'one-time' || normalized === 'one_time') {
    return 'single';
  }
  if (normalized === 'weekly') return 'week';
  if (normalized === 'monthly') return 'month';
  if (normalized === 'yearly') return 'year';
  if (normalized === 'week' || normalized === 'month' || normalized === 'year') {
    return normalized as ProductPeriod;
  }
  return 'month';
};

const toClientTimeSlot = (slot: Record<string, any>): TimeSlot => {
  const dayOfWeek = typeof slot.dayOfWeek === 'number' && slot.dayOfWeek >= 0 && slot.dayOfWeek <= 6
    ? slot.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6
    : undefined;
  const daysOfWeek = Array.isArray(slot.daysOfWeek)
    ? Array.from(new Set(slot.daysOfWeek
      .map((entry: unknown) => Number(entry))
      .filter((entry: number): entry is 0 | 1 | 2 | 3 | 4 | 5 | 6 => Number.isInteger(entry) && entry >= 0 && entry <= 6)))
    : [];
  return {
    $id: String(slot.id),
    dayOfWeek,
    daysOfWeek,
    divisions: normalizeIdList(slot.divisions),
    startTimeMinutes: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : undefined,
    endTimeMinutes: typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : undefined,
    startDate: toIsoString(slot.startDate) ?? new Date().toISOString(),
    endDate: toIsoString(slot.endDate),
    repeating: slot.repeating !== false,
    price: typeof slot.price === 'number' ? slot.price : undefined,
    requiredTemplateIds: normalizeIdList(slot.requiredTemplateIds),
    hostRequiredTemplateIds: normalizeIdList(slot.hostRequiredTemplateIds),
    scheduledFieldId: normalizeNullableString(slot.scheduledFieldId),
    scheduledFieldIds: normalizeIdList(slot.scheduledFieldIds),
  };
};

const toClientField = (
  field: Record<string, any>,
  rentalSlotsById: Map<string, TimeSlot>,
  organizationLocation: string | null,
): Field => {
  const rentalSlotIds = normalizeIdList(field.rentalSlotIds)
    .filter((slotId) => rentalSlotsById.has(slotId));
  const fieldNumber = normalizeNumber(field.fieldNumber, 0);
  return {
    $id: String(field.id),
    name: normalizeNullableString(field.name) ?? (fieldNumber ? `Field ${fieldNumber}` : 'Field'),
    location: normalizeNullableString(field.location) ?? organizationLocation ?? '',
    lat: normalizeNumber(field.lat),
    long: normalizeNumber(field.long),
    fieldNumber,
    heading: typeof field.heading === 'number' ? field.heading : undefined,
    inUse: typeof field.inUse === 'boolean' ? field.inUse : undefined,
    rentalSlotIds,
    rentalSlots: rentalSlotIds.map((slotId) => rentalSlotsById.get(slotId)).filter((slot): slot is TimeSlot => Boolean(slot)),
  };
};

const normalizeCoordinates = (value: unknown): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const first = Number(value[0]);
  const second = Number(value[1]);
  return Number.isFinite(first) && Number.isFinite(second) ? [first, second] : undefined;
};

const normalizeLimit = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(Number(value)), 1), 24);
};

const normalizePage = (value?: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(Math.trunc(Number(value)), 1);
};

export const normalizePublicEventTypes = (value: unknown): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return Array.from(new Set(
    rawValues
      .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
      .filter((entry) => PUBLIC_EVENT_TYPE_SET.has(entry)),
  ));
};

export const formatPublicEventTypeLabel = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (PUBLIC_EVENT_TYPE_LABELS[normalized]) {
    return PUBLIC_EVENT_TYPE_LABELS[normalized];
  }
  return normalized
    ? normalized
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
    : 'Event';
};

const getStartOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};

const getTomorrow = (date: Date): Date => new Date(
  date.getFullYear(),
  date.getMonth(),
  date.getDate() + 1,
  0,
  0,
  0,
  0,
);

const normalizeDateBoundary = (value: unknown, edge: 'start' | 'end'): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return edge === 'start'
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1, 0, 0, 0, 0);
  }
  if (typeof value === 'string' && value.trim()) {
    const [year, month, day] = value.trim().split('-').map(Number);
    if (
      Number.isInteger(year)
      && Number.isInteger(month)
      && Number.isInteger(day)
      && year > 0
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= 31
    ) {
      return edge === 'start'
        ? new Date(year, month - 1, day, 0, 0, 0, 0)
        : new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return edge === 'start'
        ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0)
        : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1, 0, 0, 0, 0);
    }
  }
  return null;
};

const getPublicEventDateWindow = (
  dateRule?: PublicEventDateRule,
  dateFrom?: Date | string | null,
  dateTo?: Date | string | null,
): PublicEventDateWindow => {
  const from = normalizeDateBoundary(dateFrom, 'start');
  const to = normalizeDateBoundary(dateTo, 'end');
  if (from || to) {
    return {
      start: from,
      end: to,
      hasFilter: true,
    };
  }
  if (dateRule === 'today') {
    const startOfToday = getStartOfToday();
    return {
      start: startOfToday,
      end: getTomorrow(startOfToday),
      hasFilter: true,
    };
  }
  if (dateRule === 'week') {
    const startOfToday = getStartOfToday();
    return {
      start: startOfToday,
      end: new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + 7, 0, 0, 0, 0),
      hasFilter: true,
    };
  }
  if (dateRule === 'month') {
    const startOfToday = getStartOfToday();
    return {
      start: startOfToday,
      end: new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, startOfToday.getDate(), 0, 0, 0, 0),
      hasFilter: true,
    };
  }
  if (dateRule === 'upcoming') {
    return {
      start: getStartOfToday(),
      end: null,
      hasFilter: true,
    };
  }
  return { start: null, end: null, hasFilter: false };
};

const getNonWeeklyDateWhere = (window: PublicEventDateWindow): Record<string, unknown> | null => {
  if (!window.hasFilter) {
    return null;
  }
  return {
    start: {
      ...(window.start ? { gte: window.start } : {}),
      ...(window.end ? { lt: window.end } : {}),
    },
  };
};

const getWeeklyParentDateWhere = (window: PublicEventDateWindow): Record<string, unknown> | null => {
  if (!window.hasFilter) {
    return null;
  }
  return {
    eventType: 'WEEKLY_EVENT',
    parentEvent: null,
    ...(window.end ? { start: { lt: window.end } } : {}),
    ...(window.start
      ? {
        OR: [
          { end: null },
          { end: { gte: window.start } },
        ],
      }
      : {}),
  };
};

const getPublicEventDateWhere = (window: PublicEventDateWindow): Record<string, unknown> | null => {
  if (!window.hasFilter) {
    return null;
  }
  const nonWeeklyDateWhere = getNonWeeklyDateWhere(window);
  const weeklyParentDateWhere = getWeeklyParentDateWhere(window);
  return {
    OR: [
      ...(weeklyParentDateWhere ? [weeklyParentDateWhere] : []),
      {
        OR: [
          { eventType: null },
          { eventType: { not: 'WEEKLY_EVENT' } },
          { eventType: 'WEEKLY_EVENT', parentEvent: { not: null } },
        ],
        ...(nonWeeklyDateWhere ?? {}),
      },
    ],
  };
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

const formatEventOccurrenceDetailsUrl = (
  slug: string,
  eventId: string,
  slotId: string,
  occurrenceDate: string,
): string => {
  const params = new URLSearchParams({ slotId, occurrenceDate });
  return `${formatEventDetailsUrl(slug, eventId)}?${params.toString()}`;
};

const toLocalIsoDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const addDays = (value: Date, days: number): Date => {
  const copy = new Date(value.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
};

const startOfDay = (value: Date): Date => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const resolveWeeklyExpansionWindow = (window: PublicEventDateWindow): { start: Date; end: Date } => {
  const start = startOfDay(window.start ?? getStartOfToday());
  const end = window.end
    ? startOfDay(window.end)
    : new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + (DEFAULT_WEEKLY_OCCURRENCE_WEEKS * 7),
      0,
      0,
      0,
      0,
    );
  return end.getTime() > start.getTime()
    ? { start, end }
    : { start, end: addDays(start, 1) };
};

const normalizeSlotWeekdays = (slot: Record<string, any>): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((entry: unknown) => Number(entry))
        .filter((entry: number) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((left, right) => left - right);
};

const normalizeSlotId = (slot: Record<string, any>): string | null => {
  const id = typeof slot.$id === 'string' ? slot.$id : typeof slot.id === 'string' ? slot.id : '';
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
};

const buildWeeklyOccurrenceCards = (
  organization: PublicOrganizationSummary,
  parentCard: PublicOrganizationEventCard,
  parentRow: Record<string, any>,
  slots: Array<Record<string, any>>,
  window: PublicEventDateWindow,
): PublicOrganizationEventCard[] => {
  const eventType = String(parentRow.eventType ?? '').trim().toUpperCase();
  const parentEventId = typeof parentRow.parentEvent === 'string' ? parentRow.parentEvent.trim() : '';
  if (eventType !== 'WEEKLY_EVENT' || parentEventId || !slots.length) {
    return [];
  }

  const expansionWindow = resolveWeeklyExpansionWindow(window);
  const eventStart = startOfDay(new Date(parentCard.start));
  const eventEnd = parentCard.end ? startOfDay(new Date(parentCard.end)) : null;
  const occurrences: PublicOrganizationEventCard[] = [];

  slots.forEach((slot) => {
    const slotId = normalizeSlotId(slot);
    const rawSlotStart = toIsoString(slot.startDate);
    const slotStart = rawSlotStart ? startOfDay(new Date(rawSlotStart)) : null;
    if (!slotId || !slotStart) {
      return;
    }

    const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
    const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
    const weekdays = normalizeSlotWeekdays(slot);
    if (!weekdays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return;
    }

    const rawSlotEnd = toIsoString(slot.endDate);
    const slotEnd = rawSlotEnd ? startOfDay(new Date(rawSlotEnd)) : null;
    const searchStart = startOfDay(new Date(Math.max(
      expansionWindow.start.getTime(),
      slotStart.getTime(),
      Number.isNaN(eventStart.getTime()) ? expansionWindow.start.getTime() : eventStart.getTime(),
    )));
    const searchEndCandidates = [
      expansionWindow.end.getTime(),
      ...(slotEnd ? [addDays(slotEnd, 1).getTime()] : []),
      ...(eventEnd ? [addDays(eventEnd, 1).getTime()] : []),
    ];
    const searchEnd = startOfDay(new Date(Math.min(...searchEndCandidates)));
    if (searchEnd.getTime() <= searchStart.getTime()) {
      return;
    }

    for (
      let occurrence = new Date(searchStart.getTime());
      occurrence.getTime() < searchEnd.getTime() && occurrences.length < DEFAULT_WEEKLY_OCCURRENCE_WEEKS * 7;
      occurrence = addDays(occurrence, 1)
    ) {
      if (!weekdays.includes(toMondayIndex(occurrence))) {
        continue;
      }

      const occurrenceStart = new Date(occurrence.getTime());
      occurrenceStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      const occurrenceEnd = new Date(occurrence.getTime());
      occurrenceEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
      const occurrenceDate = toLocalIsoDate(occurrence);
      occurrences.push({
        ...parentCard,
        id: `${parentCard.id}:${slotId}:${occurrenceDate}`,
        start: occurrenceStart.toISOString(),
        end: occurrenceEnd.toISOString(),
        detailsUrl: formatEventOccurrenceDetailsUrl(
          organization.slug,
          String(parentRow.id),
          slotId,
          occurrenceDate,
        ),
      });
    }
  });

  return occurrences.sort((left, right) => (
    left.start.localeCompare(right.start)
    || left.id.localeCompare(right.id)
  ));
};

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
    publicCompletionRedirectUrl: typeof row.publicCompletionRedirectUrl === 'string' && row.publicCompletionRedirectUrl.trim()
      ? row.publicCompletionRedirectUrl.trim()
      : null,
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

type PublicOrganizationEventListOptions = {
  limit?: number;
  eventTypes?: string[];
  dateRule?: PublicEventDateRule;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  includeChildWeeklyEvents?: boolean;
};

type PublicEventDateWindow = {
  start: Date | null;
  end: Date | null;
  hasFilter: boolean;
};

const buildPublicOrganizationEventWhere = (
  organization: PublicOrganizationSummary,
  options: PublicOrganizationEventListOptions,
): Record<string, unknown> => {
  const eventTypes = normalizePublicEventTypes(options.eventTypes);
  const dateWhere = getPublicEventDateWhere(
    getPublicEventDateWindow(options.dateRule, options.dateFrom, options.dateTo),
  );
  const andFilters = [
    dateWhere,
    options.includeChildWeeklyEvents === false ? { eventType: { not: 'WEEKLY_EVENT' } } : null,
  ].filter((filter): filter is Record<string, unknown> => Boolean(filter));
  return {
    organizationId: organization.id,
    OR: PUBLIC_EVENT_STATES.map((state) => ({ state })),
    NOT: { state: 'TEMPLATE' },
    ...(eventTypes.length ? { eventType: { in: eventTypes } } : {}),
    ...(andFilters.length ? { AND: andFilters } : {}),
  };
};

const mapPublicOrganizationEventCards = async (
  organization: PublicOrganizationSummary,
  events: Array<Record<string, any>>,
): Promise<PublicOrganizationEventCard[]> => {
  const sportsById = await getSportsById(
    events.map((event: Record<string, any>) => (typeof event.sportId === 'string' ? event.sportId : '')),
  );
  const divisionLabelsByEventId = await getDivisionLabelsByEventId(events);

  return events.map((event: Record<string, any>): PublicOrganizationEventCard => {
    const eventType = String(event.eventType ?? 'EVENT').trim().toUpperCase();
    return {
      id: String(event.id),
      name: String(event.name ?? 'Untitled event'),
      description: typeof event.description === 'string' ? event.description : null,
      start: toIsoString(event.start) ?? new Date().toISOString(),
      end: toIsoString(event.end),
      location: String(event.location ?? organization.location ?? 'Location TBD'),
      eventType,
      eventTypeLabel: formatPublicEventTypeLabel(eventType),
      sportName: typeof event.sportId === 'string' ? sportsById.get(event.sportId) ?? event.sportId : null,
      priceCents: typeof event.price === 'number' ? event.price : 0,
      imageUrl: imageUrl(event.imageId),
      divisionLabels: divisionLabelsByEventId.get(String(event.id)) ?? [],
      detailsUrl: formatEventDetailsUrl(organization.slug, String(event.id)),
    };
  });
};

const getWeeklyParentSlotRowsByEventId = async (
  events: Array<Record<string, any>>,
): Promise<Map<string, Array<Record<string, any>>>> => {
  const slotIds = Array.from(new Set(
    events
      .filter((event) => {
        const eventType = String(event.eventType ?? '').trim().toUpperCase();
        const parentEventId = typeof event.parentEvent === 'string' ? event.parentEvent.trim() : '';
        return eventType === 'WEEKLY_EVENT' && !parentEventId;
      })
      .flatMap((event) => normalizeIdList(event.timeSlotIds)),
  ));

  if (!slotIds.length) {
    return new Map();
  }

  const rows = await (prisma as any).timeSlots.findMany({
    where: { id: { in: slotIds } },
  });
  const slotById = new Map(rows.map((slot: Record<string, any>) => [String(slot.id), slot]));
  const slotsByEventId = new Map<string, Array<Record<string, any>>>();
  events.forEach((event) => {
    const eventId = String(event.id);
    const slots = normalizeIdList(event.timeSlotIds)
      .map((slotId) => slotById.get(slotId))
      .filter((slot): slot is Record<string, any> => Boolean(slot));
    if (slots.length) {
      slotsByEventId.set(eventId, slots);
    }
  });
  return slotsByEventId;
};

const mapAndExpandPublicOrganizationEventCards = async (
  organization: PublicOrganizationSummary,
  events: Array<Record<string, any>>,
  options: PublicOrganizationEventListOptions,
  dateWindow: PublicEventDateWindow,
): Promise<PublicOrganizationEventCard[]> => {
  const cards = await mapPublicOrganizationEventCards(organization, events);
  if (options.includeChildWeeklyEvents === false) {
    return cards.sort((left, right) => left.start.localeCompare(right.start) || left.id.localeCompare(right.id));
  }

  const slotsByEventId = await getWeeklyParentSlotRowsByEventId(events);
  const cardByEventId = new Map(cards.map((card) => [card.id, card]));
  const generatedOccurrenceKeys = new Set<string>();
  const expanded: PublicOrganizationEventCard[] = [];

  events.forEach((event) => {
    const eventId = String(event.id);
    const eventType = String(event.eventType ?? '').trim().toUpperCase();
    const parentEventId = typeof event.parentEvent === 'string' ? event.parentEvent.trim() : '';
    const card = cardByEventId.get(eventId);
    if (!card) {
      return;
    }

    if (eventType === 'WEEKLY_EVENT' && !parentEventId) {
      const occurrenceCards = buildWeeklyOccurrenceCards(
        organization,
        card,
        event,
        slotsByEventId.get(eventId) ?? [],
        dateWindow,
      );
      if (occurrenceCards.length) {
        occurrenceCards.forEach((occurrenceCard) => {
          const occurrenceKey = `${eventId}:${occurrenceCard.start}:${occurrenceCard.end ?? ''}`;
          generatedOccurrenceKeys.add(occurrenceKey);
          expanded.push(occurrenceCard);
        });
        return;
      }
    }

    if (eventType === 'WEEKLY_EVENT' && parentEventId) {
      const occurrenceKey = `${parentEventId}:${card.start}:${card.end ?? ''}`;
      if (generatedOccurrenceKeys.has(occurrenceKey)) {
        return;
      }
    }

    expanded.push(card);
  });

  return expanded.sort((left, right) => left.start.localeCompare(right.start) || left.id.localeCompare(right.id));
};

export const listPublicOrganizationEvents = async (
  organization: PublicOrganizationSummary,
  options: PublicOrganizationEventListOptions = {},
): Promise<PublicOrganizationEventCard[]> => {
  const limit = normalizeLimit(options.limit);
  const dateWindow = getPublicEventDateWindow(options.dateRule, options.dateFrom, options.dateTo);
  const events = await (prisma as any).events.findMany({
    where: buildPublicOrganizationEventWhere(organization, options),
    orderBy: { start: 'asc' },
    take: Math.max(PUBLIC_EVENT_QUERY_CAP, limit),
  });

  const cards = await mapAndExpandPublicOrganizationEventCards(organization, events, options, dateWindow);
  return cards.slice(0, limit);
};

export const listPublicOrganizationEventPage = async (
  organization: PublicOrganizationSummary,
  options: PublicOrganizationEventListOptions & { page?: number } = {},
): Promise<{ events: PublicOrganizationEventCard[]; pageInfo: PublicPaginationInfo }> => {
  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const dateWindow = getPublicEventDateWindow(options.dateRule, options.dateFrom, options.dateTo);
  const rows = await (prisma as any).events.findMany({
    where: buildPublicOrganizationEventWhere(organization, options),
    orderBy: { start: 'asc' },
    take: Math.max(PUBLIC_EVENT_QUERY_CAP, offset + limit + 1),
  });
  const expandedRows = await mapAndExpandPublicOrganizationEventCards(organization, rows, options, dateWindow);
  const pageRows = expandedRows.slice(offset, offset + limit + 1);
  const hasNext = pageRows.length > limit;
  const events = pageRows.slice(0, limit);

  return {
    events,
    pageInfo: {
      limit,
      page,
      offset,
      hasPrevious: page > 1,
      hasNext,
    },
  };
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
      detailsUrl: `/o/${encodeURIComponent(organization.slug)}/rentals`,
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
    detailsUrl: `/o/${encodeURIComponent(organization.slug)}/products/${encodeURIComponent(String(product.id))}`,
  }));
};

export const getPublicOrganizationRentalSelectionData = async (
  slugInput: string,
): Promise<PublicOrganizationRentalSelectionData | null> => {
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
  if (!organization.publicPageEnabled) {
    return null;
  }

  const fieldRows = await (prisma as any).fields.findMany({
    where: { organizationId: organization.id },
    orderBy: [{ fieldNumber: 'asc' }, { name: 'asc' }],
  });
  const slotIds = Array.from(new Set(fieldRows.flatMap((field: Record<string, any>) => normalizeIdList(field.rentalSlotIds))));
  const slotRows = slotIds.length
    ? await (prisma as any).timeSlots.findMany({
        where: {
          id: { in: slotIds },
          price: { not: null },
        },
        orderBy: { startDate: 'asc' },
      })
    : [];
  const rentalSlotsById = new Map<string, TimeSlot>(
    slotRows.map((slot: Record<string, any>) => [String(slot.id), toClientTimeSlot(slot)]),
  );
  const fields = fieldRows
    .map((field: Record<string, any>) => toClientField(field, rentalSlotsById, organization.location))
    .filter((field: Field) => (field.rentalSlots ?? []).length > 0);

  return {
    organization,
    rentalOrganization: {
      $id: organization.id,
      name: organization.name,
      description: organization.description ?? undefined,
      website: organization.website ?? undefined,
      sports: organization.sports,
      location: organization.location ?? undefined,
      address: normalizeNullableString(row.address),
      coordinates: normalizeCoordinates(row.coordinates),
      hasStripeAccount: typeof row.hasStripeAccount === 'boolean' ? row.hasStripeAccount : undefined,
      verificationStatus: row.verificationStatus,
      publicSlug: organization.slug,
      publicPageEnabled: organization.publicPageEnabled,
      publicWidgetsEnabled: organization.publicWidgetsEnabled,
      brandPrimaryColor: organization.brandPrimaryColor,
      brandAccentColor: organization.brandAccentColor,
      publicHeadline: organization.publicHeadline,
      publicIntroText: organization.publicIntroText,
      embedAllowedDomains: normalizeIdList(row.embedAllowedDomains),
      publicCompletionRedirectUrl: organization.publicCompletionRedirectUrl,
      fields,
      events: [],
      teams: [],
      products: [],
    },
  };
};

export const getPublicOrganizationProductForCheckout = async (
  slug: string,
  productId: string,
): Promise<PublicOrganizationProductCheckoutData | null> => {
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'page' });
  if (!organization) {
    return null;
  }
  const product = await (prisma as any).products.findFirst({
    where: {
      id: productId,
      organizationId: organization.id,
      OR: [{ isActive: true }, { isActive: null }],
    },
  });
  if (!product) {
    return null;
  }
  const period = normalizeProductPeriodForClient(product.period);
  return {
    organization,
    product: {
      $id: String(product.id),
      organizationId: String(product.organizationId),
      name: String(product.name ?? 'Product'),
      description: normalizeNullableString(product.description),
      priceCents: normalizeNumber(product.priceCents),
      period,
      productType: product.productType,
      taxCategory: product.taxCategory,
      createdBy: normalizeNullableString(product.createdBy),
      isActive: product.isActive !== false,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
      $createdAt: toIsoString(product.createdAt) ?? undefined,
    },
  };
};

export const getPublicOrganizationCatalog = async (
  slug: string,
  options: {
    surface?: PublicCatalogSurface;
    limit?: number;
    eventPage?: number;
    eventTypes?: string[];
    dateRule?: PublicEventDateRule;
    dateFrom?: Date | string | null;
    dateTo?: Date | string | null;
    includeChildWeeklyEvents?: boolean;
  } = {},
): Promise<PublicOrganizationCatalog | null> => {
  const organization = await getPublicOrganizationBySlug(slug, { surface: options.surface ?? 'page' });
  if (!organization) {
    return null;
  }
  const [eventPage, teams, rentals, products] = await Promise.all([
    listPublicOrganizationEventPage(organization, {
      limit: options.limit,
      page: options.eventPage,
      eventTypes: options.eventTypes,
      dateRule: options.dateRule,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      includeChildWeeklyEvents: options.includeChildWeeklyEvents,
    }),
    listPublicOrganizationTeams(organization, { limit: options.limit }),
    listPublicOrganizationRentals(organization, { limit: options.limit }),
    listPublicOrganizationProducts(organization, { limit: options.limit }),
  ]);
  return { organization, events: eventPage.events, eventPageInfo: eventPage.pageInfo, teams, rentals, products };
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

