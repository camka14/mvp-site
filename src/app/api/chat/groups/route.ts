import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { handleRouteError } from '@/server/http/routeErrors';
import {
  getMinorChatParticipantIds,
  hasBlockingChatRelationship,
  loadChatParticipants,
  normalizeChatParticipantIds,
} from '@/server/chatSafety';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional(),
  userIds: z.array(z.string().trim().min(1)).min(2),
  hostId: z.string().trim().min(1),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const params = req.nextUrl.searchParams;
    const userId = params.get('userId') ?? session.userId;
    if (!session.isAdmin && userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const groups = await prisma.chatGroup.findMany({
      where: {
        userIds: { has: userId },
        archivedAt: null,
      },
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
          removedAt: null,
          NOT: { readByIds: { has: session.userId } },
        },
        _count: { _all: true },
      });
      unreadRows.forEach((row) => {
        unreadCountByGroupId.set(row.chatId, row._count._all);
      });

      const latestMessages = await prisma.messages.findMany({
        where: {
          chatId: { in: groupIds },
          removedAt: null,
        },
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
  } catch (error) {
    return handleRouteError(error, 'Failed to load chat groups');
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const normalizedHostId = parsed.data.hostId.trim();
    const requestedUserIds = normalizeChatParticipantIds(parsed.data.userIds);

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

    const requestedUsers = await loadChatParticipants(prisma, requestedUserIds);
    if (requestedUsers.length !== requestedUserIds.length) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (getMinorChatParticipantIds(requestedUsers).length > 0) {
      return NextResponse.json({ error: 'Messaging minor accounts is only allowed in team chats.' }, { status: 403 });
    }
    if (hasBlockingChatRelationship(requestedUsers)) {
      return NextResponse.json(
        { error: 'Chat creation is unavailable because one of these users has blocked the other.' },
        { status: 403 },
      );
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
  } catch (error) {
    return handleRouteError(error, 'Failed to create chat group');
  }
}
