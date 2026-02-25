import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';

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
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const where: any = {};
  // Event templates are not real events and should never appear in public discovery/search results.
  where.NOT = { state: 'TEMPLATE' };
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

  const normalized = events.map((event) => withLegacyEvent(event));
  return NextResponse.json({ events: normalized }, { status: 200 });
}
