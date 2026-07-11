import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { sendPushToUsers } from '@/server/pushNotifications';
import { hasBlockingChatRelationship, loadChatParticipants } from '@/server/chatSafety';
import {
  getChatGroupMemberIds,
  isChatGroupMember,
  isTeamChatGroup,
} from '@/server/chatAccess';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().trim().min(1).max(2000),
  userIds: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();

const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const session = await requireSession(req);
  const { topicId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const senderId = session.userId;

  const explicitRecipientIds = uniqueIds((parsed.data.userIds ?? []).map((id) => id.trim()).filter(Boolean));
  let recipientIds = explicitRecipientIds;

  const topic = await prisma.chatGroup.findUnique({
    where: { id: topicId },
    select: { id: true, userIds: true, mutedUserIds: true, hostId: true, teamId: true },
  });
  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }
  if (!await isChatGroupMember(session, topic)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const topicUserIds = await getChatGroupMemberIds(topic);
  if (!topicUserIds) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (explicitRecipientIds.some((recipientId) => !topicUserIds.includes(recipientId))) {
    return NextResponse.json({ error: 'Recipients must belong to the topic.' }, { status: 403 });
  }
  const mutedUserIds = new Set(uniqueIds((topic?.mutedUserIds ?? []).map((id) => id.trim()).filter(Boolean)));

  if (!recipientIds.length) {
    recipientIds = topicUserIds;
  }

  const recipients = recipientIds.filter((userId) => userId !== senderId && !mutedUserIds.has(userId));
  if (!isTeamChatGroup(topic) && recipients.length > 0) {
    const participants = await loadChatParticipants(prisma, [senderId, ...recipients]);
    const requestedParticipantIds = new Set([senderId, ...recipients]);
    const returnedParticipantIds = new Set(participants.map((participant) => participant.id));
    if ([...requestedParticipantIds].some((participantId) => !returnedParticipantIds.has(participantId))) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (hasBlockingChatRelationship(participants)) {
      return NextResponse.json(
        { error: 'Message delivery is unavailable because a participant has blocked the sender.' },
        { status: 403 },
      );
    }
  }
  const callerData = parsed.data.data ?? {};
  if (JSON.stringify(callerData).length > 16_384) {
    return NextResponse.json({ error: 'Message data is too large.' }, { status: 413 });
  }
  const { topicId: _ignoredTopicId, senderId: _ignoredSenderId, ...safeData } = callerData;
  const delivery = await sendPushToUsers({
    userIds: recipients,
    notificationType: 'chatMessages',
    title: parsed.data.title?.trim() || 'Notification',
    body: parsed.data.body.trim(),
    data: {
      ...safeData,
      topicId,
      senderId,
    },
  });

  return NextResponse.json({
    ok: true,
    topicId,
    recipientUserIds: recipients,
    delivery,
  }, { status: 200 });
}
