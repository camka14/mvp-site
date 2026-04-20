import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';
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
      OR: [
        { verificationStatus: 'ACTION_REQUIRED' },
        { verificationReviewStatus: { in: ['OPEN', 'IN_PROGRESS'] } },
      ],
    };

    if (query.length > 0) {
      where.AND = [
        { OR: where.OR },
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { location: { contains: query, mode: 'insensitive' as const } },
            { address: { contains: query, mode: 'insensitive' as const } },
            { description: { contains: query, mode: 'insensitive' as const } },
          ],
        },
      ];
      delete where.OR;
    }

    const [total, organizationRows] = await Promise.all([
      prisma.organizations.count({ where }),
      prisma.organizations.findMany({
        where,
        orderBy: [
          { verificationReviewUpdatedAt: 'desc' },
          { updatedAt: 'desc' },
          { name: 'asc' },
        ],
        skip: offset,
        take: limit,
      }),
    ]);

    return NextResponse.json(
      {
        organizations: withLegacyList(organizationRows),
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin organization verification queue', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
