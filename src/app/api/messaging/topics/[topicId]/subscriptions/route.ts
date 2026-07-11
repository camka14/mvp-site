import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { registerPushDeviceTarget, unregisterPushDeviceTarget } from '@/server/pushNotifications';
import {
  getMinorChatParticipantIds,
  hasBlockingChatRelationship,
  loadChatParticipants,
  normalizeChatParticipantIds,
} from '@/server/chatSafety';
import {
  canManageChatGroup,
  getChatGroupMemberIds,
  isChatGroupMember,
  isReservedTeamChatGroupId,
  isTeamChatGroup,
} from '@/server/chatAccess';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  pushToken: z.string().optional().nullable(),
  pushTarget: z.string().optional().nullable(),
  pushPlatform: z.string().optional().nullable(),
}).passthrough();

const normalizeOptional = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const asRouteErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof Response) {
    const status = error.status || 500;
    const message = status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : 'Request failed';
    return NextResponse.json({ error: message }, { status });
  }

  console.error('Messaging subscriptions route failed', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireSession(req);
    const { topicId } = await params;
    const requestedUserId = normalizeOptional(req.nextUrl.searchParams.get('userId'));
    const pushToken = normalizeOptional(req.nextUrl.searchParams.get('pushToken'));

    if (!session.isAdmin && requestedUserId && requestedUserId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetUserId = session.isAdmin
      ? (requestedUserId ?? session.userId)
      : session.userId;
    const topic = await prisma.chatGroup.findUnique({ where: { id: topicId } });
    if (topic && !await isChatGroupMember(session, topic)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [hasAnyTargetForUser, hasTopicTargetForUser, tokenRecord] = await Promise.all([
      prisma.pushDeviceTarget.count({
        where: {
          userId: targetUserId,
        },
      }).then((count) => count > 0),
      prisma.pushDeviceTarget.count({
        where: {
          userId: targetUserId,
          pushTarget: topicId,
        },
      }).then((count) => count > 0),
      pushToken
        ? prisma.pushDeviceTarget.findUnique({
          where: {
            pushToken,
          },
        })
        : Promise.resolve(null),
    ]);

    const tokenBelongsToTargetUser = !!tokenRecord && tokenRecord.userId === targetUserId;
    const canReadTokenRecord = !!tokenRecord && (session.isAdmin || tokenBelongsToTargetUser);

    return NextResponse.json({
      topicId,
      userId: targetUserId,
      hasAnyTargetForUser,
      hasTopicTargetForUser,
      hasProvidedTokenForUser: tokenBelongsToTargetUser,
      hasProvidedTokenOnTopic: tokenBelongsToTargetUser && tokenRecord?.pushTarget === topicId,
      tokenRecordPushTarget: canReadTokenRecord ? tokenRecord?.pushTarget ?? null : null,
      tokenRecordPushPlatform: canReadTokenRecord ? tokenRecord?.pushPlatform ?? null : null,
      tokenRecordUpdatedAt: canReadTokenRecord ? tokenRecord?.updatedAt?.toISOString() ?? null : null,
      tokenRecordLastSeenAt: canReadTokenRecord ? tokenRecord?.lastSeenAt?.toISOString() ?? null : null,
    }, { status: 200 });
  } catch (error) {
    return asRouteErrorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireSession(req);
    const { topicId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const requestUserIds = normalizeChatParticipantIds(parsed.data.userIds);
    if (!requestUserIds.length) {
      return NextResponse.json({ error: 'Invalid input', details: { userIds: ['At least one user id is required'] } }, { status: 400 });
    }
    const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
    if (!existing && isReservedTeamChatGroupId(topicId)) {
      return NextResponse.json(
        { error: 'Team chat identifiers are reserved for roster-managed chats.' },
        { status: 403 },
      );
    }
    if (existing && !await isChatGroupMember(session, existing)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const existingTeamMemberIds = existing && isTeamChatGroup(existing)
      ? await getChatGroupMemberIds(existing)
      : null;
    if (existing && isTeamChatGroup(existing) && !existingTeamMemberIds) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const requestedOtherUsers = requestUserIds.filter((userId) => userId !== session.userId);
    if (existing && requestedOtherUsers.length > 0 && !canManageChatGroup(session, existing)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const now = new Date();
    const mergedUserIds = normalizeChatParticipantIds([
      ...(existingTeamMemberIds ?? existing?.userIds ?? []),
      ...requestUserIds,
    ]);
    const canCreateChatGroup = mergedUserIds.length >= 2;
    if (existing && isTeamChatGroup(existing)) {
      const existingIds = new Set(existingTeamMemberIds ?? []);
      if (requestUserIds.some((userId) => !existingIds.has(userId))) {
        return NextResponse.json({ error: 'Team chat membership is managed by the team roster.' }, { status: 403 });
      }
    }
    if (!existing && canCreateChatGroup && !session.isAdmin && !requestUserIds.includes(session.userId)) {
      return NextResponse.json({ error: 'The creator must be a topic participant.' }, { status: 403 });
    }
    if (canCreateChatGroup && !isTeamChatGroup(existing ?? { id: topicId })) {
      const users = await loadChatParticipants(prisma, mergedUserIds);
      if (users.length !== mergedUserIds.length) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      if (getMinorChatParticipantIds(users).length > 0) {
        return NextResponse.json({ error: 'Messaging minor accounts is only allowed in team chats.' }, { status: 403 });
      }
      if (hasBlockingChatRelationship(users)) {
        return NextResponse.json(
          { error: 'Chat membership is unavailable because one of these users has blocked the other.' },
          { status: 403 },
        );
      }
    }

    const shouldUpdateMembership = Boolean(
      existing
      && !isTeamChatGroup(existing)
      && canManageChatGroup(session, existing)
      && mergedUserIds.some((userId) => !(existing.userIds ?? []).includes(userId))
    );
    const record = existing
      ? shouldUpdateMembership
        ? await prisma.chatGroup.update({
        where: { id: topicId },
        data: { userIds: mergedUserIds, updatedAt: now },
      })
        : existing
      : canCreateChatGroup
        ? await prisma.chatGroup.create({
          data: {
            id: topicId,
            name: null,
            userIds: mergedUserIds,
            hostId: session.userId,
            createdAt: now,
            updatedAt: now,
          },
        })
        : null;

    const pushToken = parsed.data.pushToken?.trim();
    if (pushToken) {
      const pushUserId = session.isAdmin ? requestUserIds[0] : session.userId;
      await registerPushDeviceTarget({
        userId: pushUserId,
        pushToken,
        pushTarget: topicId,
        pushPlatform: parsed.data.pushPlatform?.trim() || null,
      }).catch((error) => {
        console.warn('Failed to register push device target', { topicId, error });
      });
    }

    return NextResponse.json({ topicId, topic: record ? withLegacyFields(record) : null }, { status: 200 });
  } catch (error) {
    return asRouteErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    const session = await requireSession(req);
    const { topicId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const requestUserIds = normalizeChatParticipantIds(parsed.data.userIds);
    if (!requestUserIds.length) {
      return NextResponse.json({ error: 'Invalid input', details: { userIds: ['At least one user id is required'] } }, { status: 400 });
    }

    const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
    if (!existing) {
      const ownIds = requestUserIds.filter((userId) => session.isAdmin || userId === session.userId);
      if (ownIds.length !== requestUserIds.length) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      await unregisterPushDeviceTarget({
        userIds: ownIds,
        pushToken: parsed.data.pushToken?.trim() || null,
        pushTarget: topicId,
      });
      return NextResponse.json({ topicId, topic: null }, { status: 200 });
    }
    if (!await isChatGroupMember(session, existing)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const canManage = canManageChatGroup(session, existing);
    if (requestUserIds.some((userId) => userId !== session.userId) && !canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const removeIds = new Set(requestUserIds);
    const nextUserIds = isTeamChatGroup(existing)
      ? existing.userIds ?? []
      : (existing.userIds ?? []).filter((id) => !removeIds.has(id));

    const record = isTeamChatGroup(existing)
      ? existing
      : await prisma.chatGroup.update({
        where: { id: topicId },
        data: { userIds: nextUserIds, updatedAt: new Date() },
      });

    await unregisterPushDeviceTarget({
      userIds: requestUserIds,
      pushToken: parsed.data.pushToken?.trim() || null,
      pushTarget: topicId,
    }).catch((error) => {
      console.warn('Failed to unregister push device target', { topicId, error });
    });

    return NextResponse.json({ topicId, topic: withLegacyFields(record) }, { status: 200 });
  } catch (error) {
    return asRouteErrorResponse(error);
  }
}
