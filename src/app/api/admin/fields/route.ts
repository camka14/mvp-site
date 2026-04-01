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

    const organizationIdMatches = query.length > 0
      ? await prisma.organizations.findMany({
          where: {
            name: { contains: query, mode: 'insensitive' as const },
          },
          select: { id: true },
          take: 200,
        })
      : [];

    const matchingOrganizationIds = organizationIdMatches.map((organization) => organization.id);

    const where: any = {};
    if (query.length > 0) {
      const queryConditions: any[] = [
        { id: { contains: query, mode: 'insensitive' as const } },
        { name: { contains: query, mode: 'insensitive' as const } },
        { location: { contains: query, mode: 'insensitive' as const } },
      ];
      if (matchingOrganizationIds.length > 0) {
        queryConditions.push({ organizationId: { in: matchingOrganizationIds } });
      }
      where.OR = queryConditions;
    }

    const [total, fieldRows] = await Promise.all([
      prisma.fields.count({ where }),
      prisma.fields.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { fieldNumber: 'asc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const organizationIds = Array.from(
      new Set(
        fieldRows
          .map((field) => field.organizationId?.trim() ?? '')
          .filter((id) => id.length > 0),
      ),
    );

    const organizationRows = organizationIds.length > 0
      ? await prisma.organizations.findMany({
          where: { id: { in: organizationIds } },
          select: { id: true, name: true },
        })
      : [];

    const organizationsById = new Map(
      organizationRows.map((organization) => [organization.id, withLegacyFields(organization)]),
    );

    const fields = withLegacyList(fieldRows).map((field) => ({
      ...field,
      organization: field.organizationId ? organizationsById.get(field.organizationId) ?? null : null,
    }));

    return NextResponse.json(
      {
        fields,
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin fields list', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
