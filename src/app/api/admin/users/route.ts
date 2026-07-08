import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

const USER_SORT_FIELDS = ['name', 'username', 'email', 'status', 'dateJoined', 'lastSeen'] as const;
type UserSortField = (typeof USER_SORT_FIELDS)[number];
type SortDirection = 'asc' | 'desc';

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

const parseSort = (request: NextRequest): { field: UserSortField; direction: SortDirection } => {
  const rawField = request.nextUrl.searchParams.get('sort');
  const field = USER_SORT_FIELDS.includes(rawField as UserSortField)
    ? rawField as UserSortField
    : 'lastSeen';
  const rawDirection = request.nextUrl.searchParams.get('direction');
  const direction: SortDirection = rawDirection === 'asc' ? 'asc' : 'desc';
  return { field, direction };
};

const isAuthBackedSort = (field: UserSortField): boolean => (
  field === 'email' || field === 'status' || field === 'dateJoined' || field === 'lastSeen'
);

const userOrderByForSort = ({ field, direction }: { field: UserSortField; direction: SortDirection }) => {
  if (field === 'name') {
    return [{ lastName: direction }, { firstName: direction }, { userName: 'asc' as const }];
  }
  if (field === 'username') {
    return [{ userName: direction }, { lastName: 'asc' as const }, { firstName: 'asc' as const }];
  }
  return [{ updatedAt: 'desc' as const }, { userName: 'asc' as const }];
};

const compareNullableValues = (
  left: string | number | Date | null | undefined,
  right: string | number | Date | null | undefined,
  direction: SortDirection,
): number => {
  const leftMissing = left == null || left === '';
  const rightMissing = right == null || right === '';
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const leftValue = left instanceof Date ? left.getTime() : typeof left === 'string' ? left.toLowerCase() : left;
  const rightValue = right instanceof Date ? right.getTime() : typeof right === 'string' ? right.toLowerCase() : right;
  const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  return direction === 'asc' ? result : -result;
};

const authSortValue = (
  field: UserSortField,
  authUser: {
    email?: string | null;
    disabledAt?: Date | null;
    createdAt?: Date | null;
    lastLogin?: Date | null;
  } | undefined,
  profile: { createdAt?: Date | null },
) => {
  if (field === 'email') return authUser?.email ?? null;
  if (field === 'status') return authUser?.disabledAt ? 1 : 0;
  if (field === 'dateJoined') return authUser?.createdAt ?? profile.createdAt ?? null;
  if (field === 'lastSeen') return authUser?.lastLogin ?? null;
  return null;
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const { limit, offset } = parsePagination(req);
    const sort = parseSort(req);
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

    let total = 0;
    let userRows: Awaited<ReturnType<typeof prisma.userData.findMany>> = [];
    let authRows: Array<{
      id: string;
      email: string;
      emailVerifiedAt: Date | null;
      disabledAt: Date | null;
      disabledByUserId: string | null;
      disabledReason: string | null;
      createdAt: Date | null;
      lastLogin: Date | null;
    }> = [];

    if (isAuthBackedSort(sort.field)) {
      const matchingProfiles = await prisma.userData.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          userName: true,
          firstName: true,
          lastName: true,
        },
      });
      total = matchingProfiles.length;
      const profileIds = matchingProfiles.map((profile) => profile.id);
      authRows = profileIds.length > 0
        ? await prisma.authUser.findMany({
            where: { id: { in: profileIds } },
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              disabledAt: true,
              disabledByUserId: true,
              disabledReason: true,
              createdAt: true,
              lastLogin: true,
            },
          })
        : [];
      const authByProfileId = new Map(authRows.map((row) => [row.id, row]));
      const sortedProfiles = [...matchingProfiles].sort((left, right) => {
        const authCompare = compareNullableValues(
          authSortValue(sort.field, authByProfileId.get(left.id), left),
          authSortValue(sort.field, authByProfileId.get(right.id), right),
          sort.direction,
        );
        if (authCompare !== 0) return authCompare;
        return compareNullableValues(left.userName, right.userName, 'asc')
          || compareNullableValues(left.id, right.id, 'asc');
      });
      const pageIds = sortedProfiles.slice(offset, offset + limit).map((profile) => profile.id);
      userRows = pageIds.length > 0
        ? await prisma.userData.findMany({ where: { id: { in: pageIds } } })
        : [];
      const orderById = new Map(pageIds.map((id, index) => [id, index]));
      userRows.sort((left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0));
    } else {
      [total, userRows] = await Promise.all([
        prisma.userData.count({ where }),
        prisma.userData.findMany({
          where,
          orderBy: userOrderByForSort(sort) as any,
          skip: offset,
          take: limit,
        }),
      ]);

      const userIds = userRows.map((user) => user.id);
      authRows = userIds.length > 0
        ? await prisma.authUser.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              disabledAt: true,
              disabledByUserId: true,
              disabledReason: true,
              createdAt: true,
              lastLogin: true,
            },
          })
        : [];
    }
    const authById = new Map(authRows.map((row) => [row.id, row]));

    const users = withLegacyList(userRows.map(applyNameCaseToUserFields)).map((user) => {
      const authUser = authById.get(user.id);
      return {
        ...user,
        email: authUser?.email ?? null,
        emailVerifiedAt: authUser?.emailVerifiedAt?.toISOString() ?? null,
        disabledAt: authUser?.disabledAt?.toISOString() ?? null,
        disabledByUserId: authUser?.disabledByUserId ?? null,
        disabledReason: authUser?.disabledReason ?? null,
        dateJoined: authUser?.createdAt?.toISOString() ?? (user.createdAt instanceof Date ? user.createdAt.toISOString() : null),
        lastSeenAt: authUser?.lastLogin?.toISOString() ?? null,
      };
    });

    return NextResponse.json(
      {
        users,
        total,
        limit,
        offset,
        sort: sort.field,
        direction: sort.direction,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin users list', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
