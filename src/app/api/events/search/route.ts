import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';
import { withLegacyFields } from '@/server/legacyFormat';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import {
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import { isAuthUserSuspended } from '@/server/authState';
import { isSessionTokenCurrent } from '@/server/authSessions';
import { DEFAULT_ORGANIZATION_STATUS } from '@/lib/organizationStatus';
import { getEventTagsForEventIds, slugifyEventTagName } from '@/server/eventTags';

export const dynamic = 'force-dynamic';

const userLocationSchema = z
  .object({
    lat: z.number(),
    lng: z.number().optional(),
    long: z.number().optional(),
  })
  .refine((value) => typeof value.lng === 'number' || typeof value.long === 'number', {
    message: 'userLocation.lng or userLocation.long is required',
  });

const filterSchema = z.object({
  query: z.string().optional(),
  organizationId: z.string().optional(),
  includeWeeklyChildren: z.boolean().optional(),
  maxDistance: z.number().optional(),
  userLocation: userLocationSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  priceMax: z.number().optional(),
  eventTypes: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),
  divisions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
}).partial();

const searchSchema = z.object({
  filters: filterSchema.optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
}).partial();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray((legacy as any).divisions)) {
    (legacy as any).divisions = Array.isArray((legacy as any).divisionDetails)
      ? (legacy as any).divisionDetails
          .map((detail: any) => (typeof detail?.id === 'string' ? detail.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : [];
  }
  return legacy;
};

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const normalizeDivisionSortOrder = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const compareDivisionRowsByStoredOrder = <T extends {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
}>(left: T, right: T): number => {
  const leftOrder = normalizeDivisionSortOrder(left.sortOrder);
  const rightOrder = normalizeDivisionSortOrder(right.sortOrder);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  const nameCompare = String(left.name ?? '').localeCompare(String(right.name ?? ''));
  return nameCompare || String(left.id ?? '').localeCompare(String(right.id ?? ''));
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const RELATED_EVENT_SEARCH_LIMIT = 500;

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  )
);

const loadEventOrganizationsById = async (
  events: Array<{ organizationId?: string | null }>,
): Promise<Map<string, Record<string, unknown>>> => {
  const organizationIds = uniqueStrings(events.map((event) => event.organizationId));
  if (!organizationIds.length) {
    return new Map();
  }

  const organizations = await prisma.organizations.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      logoId: true,
    },
  });
  return new Map(organizations.map((organization) => [organization.id, organization]));
};

const resolveOrganizationSearchClauses = async (queryTerm: string): Promise<any[]> => {
  const normalized = queryTerm.trim();
  if (!normalized) {
    return [];
  }

  const containsQuery = { contains: normalized, mode: 'insensitive' as const };
  const organizations = await prisma.organizations.findMany({
    where: {
      status: DEFAULT_ORGANIZATION_STATUS,
      OR: [
        { name: containsQuery },
        { location: containsQuery },
        { address: containsQuery },
        { description: containsQuery },
      ],
    },
    select: { id: true },
    take: RELATED_EVENT_SEARCH_LIMIT,
  });

  const organizationIds = uniqueStrings(organizations.map((organization) => organization.id));

  return [
    ...(organizationIds.length > 0 ? [{ organizationId: { in: organizationIds } }] : []),
  ];
};

const getDivisionDetailsForEvents = async (
  events: Array<{ id: string; sportId?: string | null }>,
): Promise<Map<string, Array<Record<string, unknown>>>> => {
  const eventIds = events.map((event) => event.id).filter(Boolean);

  const detailsByEventId = new Map<string, Array<Record<string, unknown>>>();
  if (!eventIds.length) {
    return detailsByEventId;
  }

  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId: { in: eventIds },
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      eventId: true,
      id: true,
      key: true,
      name: true,
      sortOrder: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      divisionTypeId: true,
      ratingType: true,
      gender: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const rowsByEventId = new Map<string, Array<(typeof rows)[number]>>();
  rows.forEach((row) => {
    if (!row.eventId) return;
    const existing = rowsByEventId.get(row.eventId) ?? [];
    existing.push(row);
    rowsByEventId.set(row.eventId, existing);
  });

  events.forEach((event) => {
    const eventRows = [...(rowsByEventId.get(event.id) ?? [])].sort(compareDivisionRowsByStoredOrder);
    const details = eventRows.map((row) => {
      const inferred = inferDivisionDetails({
        identifier: row.key ?? row.id,
        sportInput: row.sportId ?? event.sportId ?? undefined,
        fallbackName: row.name ?? undefined,
      });
      const divisionTypeId = row.divisionTypeId ?? inferred.divisionTypeId;
      const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
      const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
      const divisionTypeName = deriveDivisionTypeDisplayName({
        sportInput: row.sportId ?? event.sportId ?? undefined,
        gender,
        ratingType,
        divisionTypeId,
      });

      return {
        id: row.id,
        key: row.key ?? inferred.token,
        name: cleanDivisionDisplayName(row.name, inferred.defaultName),
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        sportId: row.sportId ?? event.sportId ?? null,
        price: typeof row.price === 'number' ? row.price : null,
        maxParticipants: typeof row.maxParticipants === 'number' ? row.maxParticipants : null,
      };
    });

    detailsByEventId.set(event.id, details);
  });

  return detailsByEventId;
};

const normalizeQuery = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const eventNameRank = (value: string | null | undefined, query: string): number => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return 5;
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.split(/\s+/).some((segment) => segment.startsWith(query))) return 2;
  if (normalized.includes(query)) return 3;
  return 4;
};

const eventSecondaryRank = (value: string | null | undefined, query: string): number => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return 2;
  if (normalized.includes(query)) return 0;
  return 1;
};

const eventRelevanceScore = (
  event: { name?: string | null; location?: string | null; description?: string | null },
  query: string,
): [number, number, number] => {
  const primary = eventNameRank(event.name, query);
  const location = eventSecondaryRank(event.location, query);
  const description = eventSecondaryRank(event.description, query);
  return [primary, location, description];
};

const haversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const fallbackAttendeeCount = (event: { teamSignup?: boolean | null; teamIds?: unknown; userIds?: unknown }): number => {
  if (event.teamSignup) {
    return normalizeIds(event.teamIds).length;
  }
  return normalizeIds(event.userIds).length;
};

const getComparableTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
  }
  return Number.MAX_SAFE_INTEGER;
};

const resolveSessionContext = async (
  req: NextRequest,
): Promise<{ userId: string; isAdmin: boolean; hiddenEventIds: string[] } | null> => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }
  const session = verifySessionToken(token);
  if (!session) {
    return null;
  }
  const userId = typeof session.userId === 'string' ? session.userId.trim() : '';
  if (!userId) {
    return null;
  }

  const [authUser, user] = await Promise.all([
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { disabledAt: true, sessionVersion: true },
    }),
    prisma.userData.findUnique({
      where: { id: userId },
      select: { hiddenEventIds: true },
    }),
  ]);
  if (!authUser || isAuthUserSuspended(authUser) || !isSessionTokenCurrent(session, authUser.sessionVersion)) {
    return null;
  }

  return {
    userId,
    isAdmin: Boolean(session.isAdmin),
    hiddenEventIds: user?.hiddenEventIds ?? [],
  };
};

const MANAGER_DISCOVER_EVENT_STATES = ['UNPUBLISHED'] as const;

const buildDiscoverVisibilityClause = (
  sessionUserId: string | null,
  isAdmin: boolean,
) => {
  const visibilityOr: any[] = [
    { state: 'PUBLISHED' },
    { state: null },
  ];

  if (isAdmin) {
    visibilityOr.push({ state: { in: [...MANAGER_DISCOVER_EVENT_STATES] } });
  } else if (sessionUserId) {
    visibilityOr.push({
      state: { in: [...MANAGER_DISCOVER_EVENT_STATES] },
      OR: [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ],
    });
  }

  return {
    AND: [
      { NOT: { state: 'TEMPLATE' } },
      { OR: visibilityOr },
    ],
  };
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = searchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const filters = parsed.data.filters ?? {};
  const limit = parsed.data.limit ?? 50;
  const offset = parsed.data.offset ?? 0;
  const queryTerm = (filters.query ?? '').trim();
  const normalizedQuery = normalizeQuery(queryTerm);
  const hasQuery = normalizedQuery.length > 0;
  const session = await resolveSessionContext(req);
  const sessionUserId = session?.userId ?? null;
  const isAdmin = session?.isAdmin === true;
  const hiddenEventIds = session?.hiddenEventIds ?? [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const where: any = { archivedAt: null };
  const visibilityClause = buildDiscoverVisibilityClause(sessionUserId, isAdmin);
  where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...visibilityClause.AND];
  if (hiddenEventIds.length > 0) {
    where.AND.push({ id: { notIn: hiddenEventIds } });
  }
  if (filters.includeWeeklyChildren !== true) {
    where.AND.push({
      OR: [
        { eventType: null },
        { eventType: { not: 'WEEKLY_EVENT' } },
        { eventType: 'WEEKLY_EVENT', parentEvent: null },
      ],
    });
  }
  if (filters.eventTypes?.length) {
    where.eventType = { in: filters.eventTypes };
  }
  if (typeof filters.priceMax === 'number') {
    where.price = { lte: filters.priceMax };
  }
  if (filters.divisions?.length) {
    const divisionFilters = normalizeDivisionKeys(filters.divisions);
    if (divisionFilters.length) {
      const matchingDivisionRows = await prisma.divisions.findMany({
        where: {
          OR: [
            { id: { in: divisionFilters } },
            { key: { in: divisionFilters } },
          ],
        },
        select: { eventId: true },
      });
      const matchingEventIds = uniqueStrings(matchingDivisionRows.map((row) => row.eventId));
      if (!matchingEventIds.length) {
        return NextResponse.json({ events: [], pagination: { hasMore: false, nextOffset: offset } }, { status: 200 });
      }
      where.AND.push({ id: { in: matchingEventIds } });
    }
  }
  if (filters.tags?.length) {
    const tagFilters = Array.from(
      new Set(
        filters.tags
          .map((tag) => String(tag).trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    const tagSlugs = tagFilters.map(slugifyEventTagName);
    if (tagSlugs.length) {
      const matchingTags = await prisma.eventTags.findMany({
        where: {
          OR: [
            { id: { in: tagFilters } },
            { slug: { in: tagSlugs } },
            ...tagFilters.map((tag) => ({ name: { equals: tag, mode: 'insensitive' as const } })),
          ],
        },
        select: { id: true },
      });
      const matchingTagIds = uniqueStrings(matchingTags.map((tag) => tag.id));
      if (!matchingTagIds.length) {
        return NextResponse.json({ events: [], pagination: { hasMore: false, nextOffset: offset } }, { status: 200 });
      }
      const matchingAssignments = await prisma.eventTagAssignments.findMany({
        where: { tagId: { in: matchingTagIds } },
        select: { eventId: true },
      });
      const matchingEventIds = uniqueStrings(matchingAssignments.map((assignment) => assignment.eventId));
      if (!matchingEventIds.length) {
        return NextResponse.json({ events: [], pagination: { hasMore: false, nextOffset: offset } }, { status: 200 });
      }
      where.AND.push({ id: { in: matchingEventIds } });
    }
  }
  if (filters.sports?.length) {
    const normalizedSports = Array.from(
      new Set(
        filters.sports
          .map((sport) => String(sport).trim())
          .filter((sport) => sport.length > 0),
      ),
    );

    if (normalizedSports.length > 0) {
      const matchingSports = await prisma.sports.findMany({
        where: {
          OR: normalizedSports.map((sportName) => ({
            name: { equals: sportName, mode: 'insensitive' as const },
          })),
        },
        select: { id: true },
      });

      const sportIds = matchingSports.map((sport) => sport.id);
      if (!sportIds.length) {
        return NextResponse.json({ events: [], pagination: { hasMore: false, nextOffset: offset } }, { status: 200 });
      }
      where.sportId = { in: sportIds };
    }
  }
  const parsedDateFrom = typeof filters.dateFrom === 'string' ? new Date(filters.dateFrom) : null;
  const hasExplicitDateFrom = Boolean(parsedDateFrom && !Number.isNaN(parsedDateFrom.getTime()));
  const effectiveDateFrom = hasExplicitDateFrom
    ? (parsedDateFrom as Date)
    : startOfToday;
  if (effectiveDateFrom) {
    where.AND.push({
      OR: [
        {
          eventType: 'WEEKLY_EVENT',
          OR: [
            { end: null },
            { end: { gte: effectiveDateFrom } },
          ],
        },
        {
          eventType: { not: 'WEEKLY_EVENT' },
          start: { gte: effectiveDateFrom },
        },
        {
          eventType: null,
          start: { gte: effectiveDateFrom },
        },
      ],
    });
  }
  const parsedDateTo = typeof filters.dateTo === 'string' ? new Date(filters.dateTo) : null;
  if (parsedDateTo && !Number.isNaN(parsedDateTo.getTime())) {
    where.AND.push({
      OR: [
        {
          eventType: 'WEEKLY_EVENT',
          OR: [
            { end: null },
            { end: { lte: parsedDateTo } },
          ],
        },
        {
          eventType: { not: 'WEEKLY_EVENT' },
          end: { lte: parsedDateTo },
        },
        {
          eventType: null,
          end: { lte: parsedDateTo },
        },
      ],
    });
  }
  if (hasQuery) {
    const organizationSearchClauses = await resolveOrganizationSearchClauses(queryTerm);
    where.OR = [
      { name: { contains: queryTerm, mode: 'insensitive' } },
      { description: { contains: queryTerm, mode: 'insensitive' } },
      { location: { contains: queryTerm, mode: 'insensitive' } },
      { address: { contains: queryTerm, mode: 'insensitive' } },
      { sourceUrl: { contains: queryTerm, mode: 'insensitive' } },
      { organizerName: { contains: queryTerm, mode: 'insensitive' } },
      { scheduleText: { contains: queryTerm, mode: 'insensitive' } },
      { priceText: { contains: queryTerm, mode: 'insensitive' } },
      { statusText: { contains: queryTerm, mode: 'insensitive' } },
      ...organizationSearchClauses,
    ];
  }
  const organizationId = typeof filters.organizationId === 'string' ? filters.organizationId.trim() : '';
  if (organizationId.length > 0) {
    where.organizationId = organizationId;
  }

  const userLocation = filters.userLocation;
  const hasDistanceFilter = Boolean(userLocation && typeof filters.maxDistance === 'number');
  const candidateTake = hasDistanceFilter
    ? undefined
    : hasQuery
      ? Math.min(Math.max((offset + limit + 1) * 5, 50), 500)
      : offset + limit + 1;
  let events = await prisma.events.findMany({
    where,
    orderBy: { start: 'asc' },
    ...(hasDistanceFilter ? {} : { take: candidateTake, skip: 0 }),
  });

  if (userLocation && typeof filters.maxDistance === 'number') {
    const { lat, lng, long } = userLocation;
    const lon = typeof long === 'number' ? long : lng;
    if (typeof lon !== 'number') {
      return NextResponse.json({ error: 'Invalid input', details: { userLocation: 'Missing longitude' } }, { status: 400 });
    }
    const maxDistanceMiles = filters.maxDistance * 0.621371;
    events = events.filter((event) => {
      const coords = event.coordinates as any;
      if (!Array.isArray(coords) || coords.length < 2) return true;
      const [lng, latitude] = coords;
      if (typeof lng !== 'number' || typeof latitude !== 'number') return true;
      return haversineMiles(lat, lon, latitude, lng) <= maxDistanceMiles;
    });
  } else if (hasQuery) {
    events = events
      .sort((left, right) => {
        const leftScore = eventRelevanceScore(left, normalizedQuery);
        const rightScore = eventRelevanceScore(right, normalizedQuery);
        if (leftScore[0] !== rightScore[0]) return leftScore[0] - rightScore[0];
        if (leftScore[1] !== rightScore[1]) return leftScore[1] - rightScore[1];
        if (leftScore[2] !== rightScore[2]) return leftScore[2] - rightScore[2];
        return (left.name ?? '').localeCompare(right.name ?? '');
      })
  }

  const sortedCandidateEvents = hasQuery
    ? events.sort((left, right) => {
        const leftScore = eventRelevanceScore(left, normalizedQuery);
        const rightScore = eventRelevanceScore(right, normalizedQuery);
        if (leftScore[0] !== rightScore[0]) return leftScore[0] - rightScore[0];
        if (leftScore[1] !== rightScore[1]) return leftScore[1] - rightScore[1];
        if (leftScore[2] !== rightScore[2]) return leftScore[2] - rightScore[2];
        return (left.name ?? '').localeCompare(right.name ?? '');
      })
    : events.sort((left, right) => (
        getComparableTime((left as any).start) - getComparableTime((right as any).start)
      ));
  const pageRows = sortedCandidateEvents.slice(offset, offset + limit + 1);
  const hasMore = pageRows.length > limit;
  const pageEvents = pageRows.slice(0, limit);

  const eventsWithAttendees = await withEventAttendeeCounts(pageEvents).catch((error) => {
    console.error('Failed to enrich attendee counts for event search', error);
    return pageEvents.map((event) => ({
      ...event,
      attendees: fallbackAttendeeCount(event),
    }));
  });
  const eventsWithParticipants = await withDerivedEventParticipantIds(eventsWithAttendees, prisma);
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(
    eventsWithParticipants.map((event) => event.id),
    prisma,
  );

  const divisionDetailsByEventId = await getDivisionDetailsForEvents(
    eventsWithParticipants.map((event) => ({
      id: event.id,
      sportId: event.sportId,
    })),
  ).catch((error) => {
    console.error('Failed to enrich division details for event search', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });

  const tagsByEventId = await getEventTagsForEventIds(
    eventsWithParticipants.map((event) => event.id),
    prisma,
  ).catch((error) => {
    console.error('Failed to enrich event tags for event search', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });
  const organizationsById = await loadEventOrganizationsById(eventsWithParticipants).catch((error) => {
    console.error('Failed to enrich event organizations for event search', error);
    return new Map<string, Record<string, unknown>>();
  });

  const normalized = eventsWithParticipants.map((event) => {
    const divisionDetails = divisionDetailsByEventId.get(event.id) ?? [];
    const organizationId = typeof event.organizationId === 'string' ? event.organizationId : '';
    return withLegacyEvent({
      ...event,
      organization: organizationId ? organizationsById.get(organizationId) ?? null : null,
      officialIds: officialIdsByEventId.get(event.id) ?? [],
      divisions: divisionDetails.map((division) => division.id).filter((id): id is string => typeof id === 'string'),
      divisionDetails,
      tags: tagsByEventId.get(event.id) ?? [],
    });
  });
  return NextResponse.json({
    events: normalized,
    pagination: {
      hasMore,
      nextOffset: offset + normalized.length,
    },
  }, { status: 200 });
}
