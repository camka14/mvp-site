import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { sendPushToUsers } from '@/server/pushNotifications';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().optional(),
  body: z.string(),
  userIds: z.array(z.string()).optional(),
  senderId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const session = await requireSession(req);
  const { topicId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const senderId = parsed.data.senderId?.trim() || session.userId;
  if (!session.isAdmin && senderId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const explicitRecipientIds = uniqueIds((parsed.data.userIds ?? []).map((id) => id.trim()).filter(Boolean));
  let recipientIds = explicitRecipientIds;

  if (!recipientIds.length) {
    const topic = await prisma.chatGroup.findUnique({
      where: { id: topicId },
      select: { userIds: true },
    });
    recipientIds = uniqueIds((topic?.userIds ?? []).map((id) => id.trim()).filter(Boolean));
  }

  const recipients = recipientIds.filter((userId) => userId !== senderId);
  const delivery = await sendPushToUsers({
    userIds: recipients,
    title: parsed.data.title?.trim() || 'Notification',
    body: parsed.data.body.trim(),
    data: {
      topicId,
      senderId,
      ...parsed.data.data,
    },
  });

  return NextResponse.json({
    ok: true,
    topicId,
    recipientUserIds: recipients,
    delivery,
  }, { status: 200 });
}
