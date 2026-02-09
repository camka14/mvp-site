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
  fieldType: z.string().optional(),
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

  const where: any = {};
  // Event templates are not real events and should never appear in public discovery/search results.
  where.NOT = { state: 'TEMPLATE' };
  if (filters.eventTypes?.length) {
    where.eventType = { in: filters.eventTypes };
  }
  if (filters.fieldType) {
    where.fieldType = filters.fieldType;
  }
  if (typeof filters.priceMax === 'number') {
    where.price = { lte: filters.priceMax };
  }
  if (filters.divisions?.length) {
    where.divisions = { hasSome: filters.divisions };
  }
  if (filters.dateFrom) {
    const start = new Date(filters.dateFrom);
    if (!Number.isNaN(start.getTime())) {
      where.start = { ...(where.start ?? {}), gte: start };
    }
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    if (!Number.isNaN(end.getTime())) {
      where.end = { ...(where.end ?? {}), lte: end };
    }
  }
  if (filters.query) {
    where.OR = [
      { name: { contains: filters.query, mode: 'insensitive' } },
      { description: { contains: filters.query, mode: 'insensitive' } },
      { location: { contains: filters.query, mode: 'insensitive' } },
    ];
  }

  let events = await prisma.events.findMany({
    where,
    orderBy: { start: 'asc' },
    take: limit,
    skip: offset,
  });

  if (filters.userLocation && typeof filters.maxDistance === 'number') {
    const { lat, lng, long } = filters.userLocation;
    const lon = typeof long === 'number' ? long : lng;
    if (typeof lon !== 'number') {
      return NextResponse.json({ error: 'Invalid input', details: { userLocation: 'Missing longitude' } }, { status: 400 });
    }
    events = events.filter((event) => {
      const coords = event.coordinates as any;
      if (!Array.isArray(coords) || coords.length < 2) return true;
      const [lng, latitude] = coords;
      if (typeof lng !== 'number' || typeof latitude !== 'number') return true;
      return haversineMiles(lat, lon, latitude, lng) <= (filters.maxDistance as number);
    });
  }

  const normalized = events.map((event) => withLegacyEvent(event));
  return NextResponse.json({ events: normalized }, { status: 200 });
}
