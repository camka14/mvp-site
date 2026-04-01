import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

const parsePagination = (request: NextRequest): { limit: number; offset: number } => {
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(request.nextUrl.searchParams.get('offset') ?? 0);

  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.trunc(offsetRaw), 0)
    : 0;
  return { limit, offset };
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const { limit, offset } = parsePagination(req);
    const query = (req.nextUrl.searchParams.get('query') ?? '').trim();

    const where: any = {
      NOT: { state: 'TEMPLATE' },
    };
    if (query.length > 0) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' as const } },
        { location: { contains: query, mode: 'insensitive' as const } },
        { address: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ];
    }

    const [total, eventRows] = await Promise.all([
      prisma.events.count({ where }),
      prisma.events.findMany({
        where,
        orderBy: { start: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const organizationIds = Array.from(
      new Set(
        eventRows
          .map((event) => event.organizationId?.trim() ?? '')
          .filter((id) => id.length > 0),
      ),
    );
    const sportIds = Array.from(
      new Set(
        eventRows
          .map((event) => event.sportId?.trim() ?? '')
          .filter((id) => id.length > 0),
      ),
    );

    const [organizationRows, sportRows] = await Promise.all([
      organizationIds.length > 0
        ? prisma.organizations.findMany({
            where: { id: { in: organizationIds } },
            select: { id: true, name: true, logoId: true, location: true, address: true },
          })
        : Promise.resolve([]),
      sportIds.length > 0
        ? prisma.sports.findMany({
            where: { id: { in: sportIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const organizationsById = new Map(
      organizationRows.map((organization) => [
        organization.id,
        withLegacyFields({
          ...organization,
        }),
      ]),
    );
    const sportsById = new Map(
      sportRows.map((sport) => [
        sport.id,
        withLegacyFields({
          ...sport,
        }),
      ]),
    );

    const events = withLegacyList(eventRows).map((event) => ({
      ...event,
      organization: event.organizationId ? organizationsById.get(event.organizationId) ?? null : null,
      sport: event.sportId ? sportsById.get(event.sportId) ?? null : null,
    }));

    return NextResponse.json(
      {
        events,
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin events list', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
