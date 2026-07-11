import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  getMinorChatParticipantIds,
  hasBlockingChatRelationship,
  loadChatParticipants,
  normalizeChatParticipantIds,
} from '@/server/chatSafety';
import { canManageChatGroup, isReservedTeamChatGroupId, isTeamChatGroup } from '@/server/chatAccess';

export const dynamic = 'force-dynamic';

const schema = z.object({
  topicName: z.string().optional(),
  name: z.string().optional(),
  userIds: z.array(z.string()).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const session = await requireSession(req);
  const { topicId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const name = parsed.data.topicName ?? parsed.data.name ?? null;
  const userIds = Array.isArray(parsed.data.userIds) ? normalizeChatParticipantIds(parsed.data.userIds) : [];

  if (isReservedTeamChatGroupId(topicId)) {
    return NextResponse.json(
      { error: 'Team chat identifiers are reserved for roster-managed chats.' },
      { status: 403 },
    );
  }

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  if (existing && (!canManageChatGroup(session, existing) || isTeamChatGroup(existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!existing && !session.isAdmin && !userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'The creator must be a topic participant.' }, { status: 403 });
  }
  const canCreateChatGroup = userIds.length >= 2;
  if (userIds.length > 0 && (existing || canCreateChatGroup) && !existing?.teamId) {
    const users = await loadChatParticipants(prisma, userIds);
    if (users.length !== userIds.length) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (getMinorChatParticipantIds(users).length > 0) {
      return NextResponse.json({ error: 'Messaging minor accounts is only allowed in team chats.' }, { status: 403 });
    }
    if (hasBlockingChatRelationship(users)) {
      return NextResponse.json(
        { error: 'Chat creation is unavailable because one of these users has blocked the other.' },
        { status: 403 },
      );
    }
  }

  const now = new Date();

  if (!existing && !canCreateChatGroup) {
    return NextResponse.json({ topicId, topic: null }, { status: 200 });
  }

  const record = existing
    ? await prisma.chatGroup.update({
      where: { id: topicId },
      data: {
        name: name ?? existing.name,
        userIds: userIds.length ? userIds : existing.userIds,
        updatedAt: now,
      },
    })
    : await prisma.chatGroup.create({
      data: {
        id: topicId,
        name,
        userIds,
        hostId: session.userId,
        createdAt: now,
        updatedAt: now,
      },
    });

  return NextResponse.json({ topicId, topic: withLegacyFields(record) }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const session = await requireSession(req);
  const { topicId } = await params;
  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  if (!existing) {
    return NextResponse.json({ deleted: false, topicId }, { status: 200 });
  }
  if (!canManageChatGroup(session, existing) || isTeamChatGroup(existing)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.chatGroup.deleteMany({ where: { id: topicId } });
  return NextResponse.json({ deleted: true, topicId }, { status: 200 });
}
