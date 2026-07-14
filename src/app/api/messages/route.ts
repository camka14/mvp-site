import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  ensureUserHasAcceptedChatTerms,
  getChatGroupMemberIds,
  isChatGroupMember,
} from '@/server/chatAccess';
import { handleRouteError } from '@/server/http/routeErrors';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.string().trim().min(1).max(128),
  body: z.string().trim().min(1).max(2_000),
  userId: z.string().trim().min(1).max(128).optional(),
  chatId: z.string().trim().min(1).max(128),
  sentTime: z.string().optional(),
  readByIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  attachmentUrls: z.array(z.string().trim().min(1).max(2_048)).max(10).optional(),
}).strict();

const normalizeManagedAttachmentUrls = (
  req: NextRequest,
  values: string[] | undefined,
): string[] | null => {
  const normalized = Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
  for (const value of normalized) {
    let url: URL;
    try {
      url = new URL(value, req.nextUrl.origin);
    } catch {
      return null;
    }
    if (url.origin !== req.nextUrl.origin || !/^\/api\/files\/[^/]+(?:\/preview)?$/.test(url.pathname)) {
      return null;
    }
  }
  return normalized;
};

const normalizeIds = (value: string[] | null | undefined): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
);

const hasBlockingRelationship = (
  senderId: string,
  users: Array<{ id: string; blockedUserIds?: string[] | null }>,
): boolean => {
  const sender = users.find((user) => user.id === senderId);
  if (!sender) {
    return false;
  }

  const senderBlocked = new Set(normalizeIds(sender.blockedUserIds));
  return users.some((user) => (
    user.id !== senderId
    && (
      senderBlocked.has(user.id)
      || normalizeIds(user.blockedUserIds).includes(senderId)
    )
  ));
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.chatMessage, session.userId);
    if (rateLimited) {
      return rateLimited;
    }
    if (!session.isAdmin) {
      await ensureUserHasAcceptedChatTerms(session.userId);
    }
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    if (!session.isAdmin && parsed.data.userId && parsed.data.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const senderId = session.isAdmin
      ? parsed.data.userId ?? session.userId
      : session.userId;
    const attachmentUrls = normalizeManagedAttachmentUrls(req, parsed.data.attachmentUrls);
    if (!attachmentUrls) {
      return NextResponse.json({ error: 'Attachments must reference a BracketIQ file.' }, { status: 400 });
    }

    const sentTime = new Date();
    const group = await prisma.chatGroup.findUnique({
      where: { id: parsed.data.chatId },
      select: { id: true, teamId: true, hostId: true, userIds: true, archivedAt: true },
    });
    if (!group) {
      return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
    }
    if (!session.isAdmin && group.archivedAt) {
      return NextResponse.json({ error: 'Chat is no longer available.' }, { status: 400 });
    }
    if (!await isChatGroupMember(session, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!session.isAdmin) {
      const memberIds = await getChatGroupMemberIds(group);
      if (!memberIds) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const participants = await prisma.userData.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, blockedUserIds: true },
      });
      if (hasBlockingRelationship(senderId, participants)) {
        return NextResponse.json(
          { error: 'Messaging is unavailable because one of the chat participants has blocked the other.' },
          { status: 403 },
        );
      }
    }

    const message = await prisma.messages.create({
      data: {
        id: parsed.data.id,
        body: parsed.data.body,
        userId: senderId,
        chatId: parsed.data.chatId,
        sentTime,
        readByIds: [senderId],
        attachmentUrls,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create message');
  }
}
