import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { findDollarPrefixedFields } from '@/server/requestParsing';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { handleRouteError } from '@/server/http/routeErrors';
import { archiveChatGroup } from '@/server/moderation';
import {
  getRetainedDirectMessagePair,
  getMinorChatParticipantIds,
  hasBlockingChatRelationship,
} from '@/server/chatSafety';
import { canManageChatGroup, isChatGroupMember, isTeamChatGroup } from '@/server/chatAccess';

export const dynamic = 'force-dynamic';

const CHAT_GROUP_MUTABLE_FIELDS = new Set<string>([
  'name',
  'userIds',
]);
const CHAT_GROUP_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  'hostId',
  'createdAt',
  'updatedAt',
  'directUserIdA',
  'directUserIdB',
]);

const normalizeIds = (value: unknown): string[] => (
  Array.from(
    new Set(
      Array.isArray(value)
        ? value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
        : [],
    ),
  )
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;

    const group = await prisma.chatGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!await isChatGroupMember(session, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (group.archivedAt && !session.isAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [unreadCount, lastMessage] = await Promise.all([
      prisma.messages.count({
        where: {
          chatId: id,
          userId: { not: session.userId },
          removedAt: null,
          NOT: { readByIds: { has: session.userId } },
        },
      }),
      prisma.messages.findFirst({
        where: {
          chatId: id,
          removedAt: null,
        },
        orderBy: [
          { sentTime: 'desc' },
          { id: 'desc' },
        ],
      }),
    ]);

    return NextResponse.json(withLegacyFields({
      ...group,
      unreadCount,
      lastMessage: lastMessage ? withLegacyFields(lastMessage) : null,
    }), { status: 200 });
  } catch (error) {
    return handleRouteError(error, 'Failed to load chat group');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = parseStrictEnvelope({
      body,
      envelopeKey: 'group',
    });
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
    }
    const obsoleteFields = findDollarPrefixedFields(parsed.payload);
    if (obsoleteFields.length) {
      return NextResponse.json(
        { error: 'Dollar-prefixed fields are not supported.', fields: obsoleteFields },
        { status: 400 },
      );
    }

    const { id } = await params;
    const existing = await prisma.chatGroup.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.archivedAt && !session.isAdmin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (isTeamChatGroup(existing) && !session.isAdmin) {
      return NextResponse.json(
        { error: 'Team chat membership is managed by the team roster.' },
        { status: 403 },
      );
    }

    const rawPayload = parsed.payload as Record<string, any>;
    const payload = { ...rawPayload };

    const unknownPayloadKeys = findUnknownKeys(payload, [
      ...CHAT_GROUP_MUTABLE_FIELDS,
      ...CHAT_GROUP_IMMUTABLE_FIELDS,
    ]);
    if (unknownPayloadKeys.length) {
      return NextResponse.json(
        { error: 'Unknown chat group patch fields.', unknownKeys: unknownPayloadKeys },
        { status: 400 },
      );
    }
    const immutableKeys = findPresentKeys(payload, CHAT_GROUP_IMMUTABLE_FIELDS);
    if (immutableKeys.length && !session.isAdmin) {
      return NextResponse.json(
        { error: 'Immutable chat group fields cannot be updated.', fields: immutableKeys },
        { status: 403 },
      );
    }

    // Never allow callers to override server-managed fields.
    delete payload.id;
    delete payload.hostId;
    delete payload.createdAt;
    delete payload.updatedAt;

    const canManage = canManageChatGroup(session, existing);
    if (!canManage) {
      // Non-host members can only remove themselves from the group.
      if (payload.name !== undefined) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (!Array.isArray(payload.userIds)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const existingSet = new Set(existing.userIds);
      const desiredSet = new Set(payload.userIds.filter((v: unknown) => typeof v === 'string' && v.trim().length > 0));

      // Must be a member to leave.
      if (!existingSet.has(session.userId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Must remove self, and cannot add or remove anyone else.
      if (desiredSet.has(session.userId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      for (const memberId of desiredSet) {
        if (!existingSet.has(memberId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      for (const memberId of existingSet) {
        if (memberId === session.userId) continue;
        if (!desiredSet.has(memberId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      payload.userIds = Array.from(desiredSet);
    }

    const data: Record<string, any> = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.userIds !== undefined) {
      const normalizedUserIds = normalizeIds(payload.userIds);
      const requestedUsers = normalizedUserIds.length > 0
        ? await prisma.userData.findMany({
            where: { id: { in: normalizedUserIds } },
            select: { id: true, dateOfBirth: true, blockedUserIds: true },
          })
        : [];
      if (requestedUsers.length !== normalizedUserIds.length) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }
      if (!isTeamChatGroup(existing) && getMinorChatParticipantIds(requestedUsers).length > 0) {
        return NextResponse.json(
          { error: 'Messaging minor accounts is only allowed in team chats.' },
          { status: 403 },
        );
      }
      if (hasBlockingChatRelationship(requestedUsers)) {
        return NextResponse.json(
          { error: 'Chat membership update is unavailable because one of these users has blocked the other.' },
          { status: 403 },
        );
      }
      data.userIds = normalizedUserIds;
      data.hostId = normalizedUserIds.includes(existing.hostId)
        ? existing.hostId
        : normalizedUserIds[0] ?? existing.hostId;
      const retainedDirectPair = getRetainedDirectMessagePair(existing, normalizedUserIds);
      data.directUserIdA = retainedDirectPair?.directUserIdA ?? null;
      data.directUserIdB = retainedDirectPair?.directUserIdB ?? null;
    }

    if (Array.isArray(data.userIds) && data.userIds.length < 2) {
      const archived = await archiveChatGroup(prisma, id, {
        actorUserId: session.userId,
        reason: 'CHAT_GROUP_MEMBER_COUNT_BELOW_MINIMUM',
        userIds: data.userIds,
        hostId: data.hostId,
      });
      return NextResponse.json(withLegacyFields(archived), { status: 200 });
    }

    const updated = await prisma.chatGroup.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(withLegacyFields(updated), { status: 200 });
  } catch (error) {
    return handleRouteError(error, 'Failed to update chat group');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;

    const existing = await prisma.chatGroup.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (isTeamChatGroup(existing) && !session.isAdmin) {
      return NextResponse.json(
        { error: 'Team chat membership is managed by the team roster.' },
        { status: 403 },
      );
    }
    const canDelete = canManageChatGroup(session, existing);
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deletedGroup = await archiveChatGroup(prisma, id, {
      actorUserId: session.userId,
      reason: 'CHAT_GROUP_ARCHIVED_BY_USER',
      userIds: existing.userIds,
      hostId: existing.hostId,
    });

    return NextResponse.json(withLegacyFields(deletedGroup), { status: 200 });
  } catch (error) {
    return handleRouteError(error, 'Failed to delete chat group');
  }
}
