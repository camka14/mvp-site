import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';
import {
  applyUserPrivacyList,
  createVisibilityContext,
  isVisibleInGenericSearch,
  publicUserSelect,
} from '@/server/userPrivacy';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

const searchSchema = z.object({
  query: z.string().min(1),
});

const parseIdsParam = (raw: string | null): string[] => {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const parseContextIdParam = (raw: string | null): string | null => {
  if (!raw) return null;
  const normalized = raw.trim();
  return normalized.length ? normalized : null;
};

const isExcludedSearchEmail = (value: string | null | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized?.endsWith('@test.com'));
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ids = parseIdsParam(params.get('ids'));
  const session = await getOptionalSession(req);
  const visibilityContext = await createVisibilityContext(prisma, {
    viewerId: session?.userId,
    isAdmin: session?.isAdmin,
    teamId: parseContextIdParam(params.get('teamId')),
    eventId: parseContextIdParam(params.get('eventId')),
  });

  if (ids.length > 0) {
    const users = await prisma.userData.findMany({
      where: { id: { in: ids } },
      select: publicUserSelect,
      take: Math.min(ids.length, 200),
    });
    const usersWithDerivedTeamIds = await withDerivedCanonicalTeamIds(users, prisma);
    const byId = new Map(usersWithDerivedTeamIds.map((user) => [user.id, user] as const));
    const orderedUsers = ids
      .map((id) => byId.get(id))
      .filter((user): user is NonNullable<typeof user> => Boolean(user));
    return NextResponse.json(
      { users: withLegacyList(applyUserPrivacyList(orderedUsers, visibilityContext)) },
      { status: 200 },
    );
  }

  const query = params.get('query') ?? '';
  const parsed = searchSchema.safeParse({ query });
  if (!parsed.success) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const term = parsed.data.query;
  const users = await prisma.userData.findMany({
    where: {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { userName: { contains: term, mode: 'insensitive' } },
      ],
    },
    select: publicUserSelect,
    take: 100,
    orderBy: { userName: 'asc' },
  });

  const usersWithDerivedTeamIds = await withDerivedCanonicalTeamIds(users, prisma);
  const candidateUserIds = usersWithDerivedTeamIds.map((user) => user.id).filter(Boolean);
  const [sensitiveEmails, authEmails] = candidateUserIds.length
    ? await Promise.all([
      prisma.sensitiveUserData.findMany({
        where: { userId: { in: candidateUserIds } },
        select: { userId: true, email: true },
      }),
      prisma.authUser.findMany({
        where: { id: { in: candidateUserIds } },
        select: { id: true, email: true },
      }),
    ])
    : [[], []] as const;
  const excludedEmailUserIds = new Set<string>();
  sensitiveEmails.forEach((row) => {
    if (isExcludedSearchEmail(row.email)) excludedEmailUserIds.add(row.userId);
  });
  authEmails.forEach((row) => {
    if (isExcludedSearchEmail(row.email)) excludedEmailUserIds.add(row.id);
  });
  const filteredUsers = usersWithDerivedTeamIds
    .filter((user) => isVisibleInGenericSearch(user, visibilityContext) && !excludedEmailUserIds.has(user.id))
    .slice(0, 20);
  return NextResponse.json(
    { users: withLegacyList(applyUserPrivacyList(filteredUsers, visibilityContext)) },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  return NextResponse.json(
    { error: 'This legacy endpoint has been removed. Use PATCH /api/users/:id or an authorized scoped invitation flow.' },
    { status: 410 },
  );
}
