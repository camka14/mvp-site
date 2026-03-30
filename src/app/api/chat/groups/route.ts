import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { isMinorAtUtcDate } from '@/server/userPrivacy';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  userIds: z.array(z.string().trim().min(1)).min(2),
  hostId: z.string().trim().min(1),
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const userId = params.get('userId') ?? session.userId;
  if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const groups = await prisma.chatGroup.findMany({
    where: { userIds: { has: userId } },
    orderBy: { updatedAt: 'desc' },
  });

  const groupIds = groups.map((group) => group.id);
  const unreadCountByGroupId = new Map<string, number>();
  const lastMessageByGroupId = new Map<string, any>();

  if (groupIds.length > 0) {
    const unreadRows = await prisma.messages.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: groupIds },
        userId: { not: session.userId },
        NOT: { readByIds: { has: session.userId } },
      },
      _count: { _all: true },
    });
    unreadRows.forEach((row) => {
      unreadCountByGroupId.set(row.chatId, row._count._all);
    });

    const latestMessages = await prisma.messages.findMany({
      where: { chatId: { in: groupIds } },
      distinct: ['chatId'],
      orderBy: [
        { chatId: 'asc' },
        { sentTime: 'desc' },
      ],
    });
    latestMessages.forEach((message) => {
      lastMessageByGroupId.set(message.chatId, withLegacyFields(message));
    });
  }

  const groupsWithUnread = groups.map((group) => ({
    ...group,
    unreadCount: unreadCountByGroupId.get(group.id) ?? 0,
    lastMessage: lastMessageByGroupId.get(group.id) ?? null,
  }));

  return NextResponse.json({ groups: withLegacyList(groupsWithUnread) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedHostId = parsed.data.hostId.trim();
  const requestedUserIds = Array.from(new Set(parsed.data.userIds.map((entry) => entry.trim()).filter(Boolean)));

  if (!requestedUserIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (normalizedHostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (requestedUserIds.length < 2) {
    return NextResponse.json(
      { error: 'Invalid input', details: { userIds: ['At least two unique users are required'] } },
      { status: 400 },
    );
  }

  const targetUserIds = requestedUserIds.filter((id) => id !== session.userId);
  if (targetUserIds.length > 0) {
    const targetUsers = await prisma.userData.findMany({
      where: { id: { in: targetUserIds } },
      select: { id: true, dateOfBirth: true },
    });
    const containsMinorTarget = targetUsers.some((user) => isMinorAtUtcDate(user.dateOfBirth));
    if (containsMinorTarget) {
      return NextResponse.json({ error: 'Messaging minor accounts is not allowed.' }, { status: 403 });
    }
  }

  const group = await prisma.chatGroup.create({
    data: {
      id: parsed.data.id,
      name: parsed.data.name ?? null,
      userIds: requestedUserIds,
      hostId: normalizedHostId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(group), { status: 201 });
}
