import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import { getOptionalSession, requireSession } from '@/lib/permissions';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  normalizeUserName,
  reserveGeneratedUserName,
} from '@/server/userNames';
import {
  applyUserPrivacyList,
  createVisibilityContext,
  isVisibleInGenericSearch,
  publicUserSelect,
} from '@/server/userPrivacy';

const createSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.any()),
});

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

const normalizeNameFields = (data: Record<string, unknown>) => {
  if (Object.prototype.hasOwnProperty.call(data, 'firstName')) {
    data.firstName = normalizeOptionalName(data.firstName);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'lastName')) {
    data.lastName = normalizeOptionalName(data.lastName);
  }
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
    const byId = new Map(users.map((user) => [user.id, user] as const));
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

  const filteredUsers = users.filter((user) => isVisibleInGenericSearch(user)).slice(0, 20);
  return NextResponse.json(
    { users: withLegacyList(applyUserPrivacyList(filteredUsers, visibilityContext)) },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, data } = parsed.data;
  const normalizedData: Record<string, unknown> = { ...data };
  normalizeNameFields(normalizedData);
  if (normalizedData.dateOfBirth) {
    const parsedDate = new Date(normalizedData.dateOfBirth as any);
    if (!Number.isNaN(parsedDate.getTime())) {
      normalizedData.dateOfBirth = parsedDate;
    }
  }
  const now = new Date();
  const existing = await prisma.userData.findUnique({ where: { id } });
  if (!existing) {
    const providedUserName = normalizeUserName(normalizedData.userName);
    const userName = providedUserName
      ?? await reserveGeneratedUserName(prisma, id, { excludeUserId: id, suffixSeed: id });
    const dateOfBirth = normalizedData.dateOfBirth instanceof Date
      ? normalizedData.dateOfBirth
      : new Date(0);

    if (!userName || Number.isNaN(dateOfBirth.getTime())) {
      return NextResponse.json({ error: 'Missing required user fields' }, { status: 400 });
    }

    const conflictUserId = await findUserNameConflictUserId(prisma, userName, id);
    if (conflictUserId) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }

    try {
      const record = await prisma.userData.create({
        data: { id, createdAt: now, updatedAt: now, ...normalizedData, userName, dateOfBirth },
      });
      return NextResponse.json({ user: withLegacyFields(applyNameCaseToUserFields(record)) }, { status: 201 });
    } catch (error) {
      if (isPrismaUserNameUniqueError(error)) {
        return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
      }
      throw error;
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalizedData, 'userName')) {
    const normalizedUserName = normalizeUserName(normalizedData.userName);
    if (!normalizedUserName) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
    }
    const conflictUserId = await findUserNameConflictUserId(prisma, normalizedUserName, id);
    if (conflictUserId) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    normalizedData.userName = normalizedUserName;
  }
  try {
    const record = existing
      ? await prisma.userData.update({ where: { id }, data: { ...normalizedData, updatedAt: now } })
      : null;

    return NextResponse.json(
      { user: record ? withLegacyFields(applyNameCaseToUserFields(record)) : record },
      { status: 201 },
    );
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }
}
