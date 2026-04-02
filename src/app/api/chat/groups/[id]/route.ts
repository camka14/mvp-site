import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';

export const dynamic = 'force-dynamic';

const CHAT_GROUP_MUTABLE_FIELDS = new Set<string>([
  'name',
  'userIds',
]);
const CHAT_GROUP_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'hostId',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const group = await prisma.chatGroup.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && !group.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(withLegacyFields(group), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'group',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.chatGroup.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawPayload = parsed.payload as Record<string, any>;
  const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;

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

  const canManage = session.isAdmin || existing.hostId === session.userId;
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
    for (const id of desiredSet) {
      if (!existingSet.has(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    for (const id of existingSet) {
      if (id === session.userId) continue;
      if (!desiredSet.has(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    payload.userIds = Array.from(desiredSet);
  }

  const data: Record<string, any> = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.userIds !== undefined) data.userIds = payload.userIds;

  const updated = await prisma.chatGroup.update({
    where: { id },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const existing = await prisma.chatGroup.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const canDelete = session.isAdmin || existing.hostId === session.userId;
  if (!canDelete) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [, deletedGroup] = await prisma.$transaction([
    prisma.messages.deleteMany({ where: { chatId: id } }),
    prisma.chatGroup.delete({ where: { id } }),
  ]);

  return NextResponse.json(withLegacyFields(deletedGroup), { status: 200 });
}
