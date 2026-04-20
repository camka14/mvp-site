import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';
import { ensureUserHasAcceptedChatTerms } from '@/server/chatAccess';

export const dynamic = 'force-dynamic';

const schema = z.object({
  id: z.string(),
  body: z.string(),
  userId: z.string(),
  chatId: z.string(),
  sentTime: z.string().optional(),
  readByIds: z.array(z.string()).optional(),
  attachmentUrls: z.array(z.string()).optional(),
}).passthrough();

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
  const session = await requireSession(req);
  if (!session.isAdmin) {
    await ensureUserHasAcceptedChatTerms(session.userId);
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!session.isAdmin && parsed.data.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sentTime = parseDateInput(parsed.data.sentTime) ?? new Date();
  const group = await prisma.chatGroup.findUnique({
    where: { id: parsed.data.chatId },
    select: { id: true, userIds: true, archivedAt: true },
  });
  if (!group) {
    return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
  }
  if (!session.isAdmin && group.archivedAt) {
    return NextResponse.json({ error: 'Chat is no longer available.' }, { status: 400 });
  }
  if (!session.isAdmin && !group.userIds.includes(parsed.data.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!session.isAdmin) {
    const participants = await prisma.userData.findMany({
      where: { id: { in: group.userIds } },
      select: { id: true, blockedUserIds: true },
    });
    if (hasBlockingRelationship(parsed.data.userId, participants)) {
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
      userId: parsed.data.userId,
      chatId: parsed.data.chatId,
      sentTime,
      readByIds: parsed.data.readByIds ?? [],
      attachmentUrls: parsed.data.attachmentUrls ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(message), { status: 201 });
}
