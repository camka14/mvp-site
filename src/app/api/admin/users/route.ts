import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
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

    const matchingAuthUserIds = query.length > 0
      ? await prisma.authUser.findMany({
          where: { email: { contains: query, mode: 'insensitive' as const } },
          select: { id: true },
          take: 500,
        })
      : [];
    const matchingEmailIds = matchingAuthUserIds.map((row) => row.id);

    const where: any = {};
    if (query.length > 0) {
      const queryConditions: any[] = [
        { id: { contains: query, mode: 'insensitive' as const } },
        { firstName: { contains: query, mode: 'insensitive' as const } },
        { lastName: { contains: query, mode: 'insensitive' as const } },
        { userName: { contains: query, mode: 'insensitive' as const } },
      ];
      if (matchingEmailIds.length > 0) {
        queryConditions.push({ id: { in: matchingEmailIds } });
      }
      where.OR = queryConditions;
    }

    const [total, userRows] = await Promise.all([
      prisma.userData.count({ where }),
      prisma.userData.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { userName: 'asc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const userIds = userRows.map((user) => user.id);
    const authRows = userIds.length > 0
      ? await prisma.authUser.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, emailVerifiedAt: true },
        })
      : [];
    const authById = new Map(authRows.map((row) => [row.id, row]));

    const users = withLegacyList(userRows.map(applyNameCaseToUserFields)).map((user) => {
      const authUser = authById.get(user.id);
      return {
        ...user,
        email: authUser?.email ?? null,
        emailVerifiedAt: authUser?.emailVerifiedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json(
      {
        users,
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin users list', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
