import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';
import { withLegacyFields } from '@/server/legacyFormat';
import { extractDivisionTokenFromId, inferDivisionDetails } from '@/lib/divisionTypes';

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
  maxDistance: z.number().optional(),
  userLocation: userLocationSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  priceMax: z.number().optional(),
  eventTypes: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),
  divisions: z.array(z.string()).optional(),
}).partial();

const searchSchema = z.object({
  filters: filterSchema.optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
}).partial();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
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

const getDivisionDetailsForEvents = async (
  events: Array<{ id: string; divisions: unknown; sportId?: string | null }>,
): Promise<Map<string, Array<Record<string, unknown>>>> => {
  const normalizedDivisionsByEventId = new Map<string, string[]>();
  const eventIds = events
    .map((event) => {
      const normalizedDivisions = normalizeDivisionKeys(event.divisions);
      normalizedDivisionsByEventId.set(event.id, normalizedDivisions);
      return normalizedDivisions.length > 0 ? event.id : null;
    })
    .filter((eventId): eventId is string => Boolean(eventId));

  const detailsByEventId = new Map<string, Array<Record<string, unknown>>>();
  if (!eventIds.length) {
    return detailsByEventId;
  }

  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId: { in: eventIds },
    },
    select: {
      eventId: true,
      id: true,
      key: true,
      name: true,
      sportId: true,
      maxParticipants: true,
      divisionTypeId: true,
      divisionTypeName: true,
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
    const normalizedDivisions = normalizedDivisionsByEventId.get(event.id) ?? [];
    if (!normalizedDivisions.length) {
      detailsByEventId.set(event.id, []);
      return;
    }

    const eventRows = rowsByEventId.get(event.id) ?? [];
    const rowsById = new Map<string, (typeof eventRows)[number]>();
    const rowsByKey = new Map<string, (typeof eventRows)[number]>();
    eventRows.forEach((row) => {
      const rowId = normalizeDivisionKey(row.id);
      if (rowId) {
        rowsById.set(rowId, row);
        const token = extractDivisionTokenFromId(rowId);
        if (token) {
          rowsByKey.set(token, row);
        }
      }
      const rowKey = normalizeDivisionKey(row.key);
      if (rowKey) {
        rowsByKey.set(rowKey, row);
      }
    });

    const details = normalizedDivisions.map((divisionId) => {
      const row = rowsById.get(divisionId)
        ?? rowsByKey.get(divisionId)
        ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
        ?? null;
      const inferred = inferDivisionDetails({
        identifier: row?.key ?? row?.id ?? divisionId,
        sportInput: row?.sportId ?? event.sportId ?? undefined,
        fallbackName: row?.name ?? undefined,
      });

      return {
        id: row?.id ?? divisionId,
        key: row?.key ?? inferred.token,
        name: row?.name ?? inferred.defaultName,
        divisionTypeId: row?.divisionTypeId ?? inferred.divisionTypeId,
        divisionTypeName: row?.divisionTypeName ?? inferred.divisionTypeName,
        ratingType: row?.ratingType ?? inferred.ratingType,
        gender: row?.gender ?? inferred.gender,
        sportId: row?.sportId ?? event.sportId ?? null,
        maxParticipants: typeof row?.maxParticipants === 'number' ? row.maxParticipants : null,
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

const resolveSessionContext = (
  req: NextRequest,
): { userId: string; isAdmin: boolean } | null => {
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
  return {
    userId,
    isAdmin: Boolean(session.isAdmin),
  };
};

const buildDiscoverVisibilityClause = (
  sessionUserId: string | null,
  isAdmin: boolean,
) => {
  const visibilityOr: any[] = [
    { state: 'PUBLISHED' },
    { state: null },
  ];

  if (isAdmin) {
    visibilityOr.push({ state: 'UNPUBLISHED' });
  } else if (sessionUserId) {
    visibilityOr.push({
      state: 'UNPUBLISHED',
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
  const session = resolveSessionContext(req);
  const sessionUserId = session?.userId ?? null;
  const isAdmin = session?.isAdmin === true;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const where: any = {};
  const visibilityClause = buildDiscoverVisibilityClause(sessionUserId, isAdmin);
  where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...visibilityClause.AND];
  if (filters.eventTypes?.length) {
    where.eventType = { in: filters.eventTypes };
  }
  if (typeof filters.priceMax === 'number') {
    where.price = { lte: filters.priceMax };
  }
  if (filters.divisions?.length) {
    where.divisions = { hasSome: filters.divisions };
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
        return NextResponse.json({ events: [] }, { status: 200 });
      }
      where.sportId = { in: sportIds };
    }
  }
  const parsedDateFrom = typeof filters.dateFrom === 'string' ? new Date(filters.dateFrom) : null;
  const hasExplicitDateFrom = Boolean(parsedDateFrom && !Number.isNaN(parsedDateFrom.getTime()));
  if (hasExplicitDateFrom) {
    where.start = { ...(where.start ?? {}), gte: parsedDateFrom as Date };
  } else if (!hasQuery) {
    // Feed/list mode defaults to upcoming events; search-query mode is intentionally broader.
    where.start = { ...(where.start ?? {}), gte: startOfToday };
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    if (!Number.isNaN(end.getTime())) {
      where.end = { ...(where.end ?? {}), lte: end };
    }
  }
  if (hasQuery) {
    where.OR = [
      { name: { contains: queryTerm, mode: 'insensitive' } },
      { description: { contains: queryTerm, mode: 'insensitive' } },
      { location: { contains: queryTerm, mode: 'insensitive' } },
    ];
  }

  const userLocation = filters.userLocation;
  const hasDistanceFilter = Boolean(userLocation && typeof filters.maxDistance === 'number');
  const candidateTake = hasDistanceFilter
    ? undefined
    : hasQuery
      ? Math.min(Math.max((offset + limit) * 5, 50), 500)
      : limit;
  let events = await prisma.events.findMany({
    where,
    orderBy: { start: 'asc' },
    ...(hasDistanceFilter ? {} : { take: candidateTake, skip: hasQuery ? 0 : offset }),
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
    events = events.slice(offset, offset + limit);
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
      .slice(offset, offset + limit);
  }

  const eventsWithAttendees = await withEventAttendeeCounts(events);

  const divisionDetailsByEventId = await getDivisionDetailsForEvents(
    eventsWithAttendees.map((event) => ({
      id: event.id,
      divisions: event.divisions,
      sportId: event.sportId,
    })),
  );

  const normalized = eventsWithAttendees.map((event) => withLegacyEvent({
    ...event,
    divisionDetails: divisionDetailsByEventId.get(event.id) ?? [],
  }));
  return NextResponse.json({ events: normalized }, { status: 200 });
}
