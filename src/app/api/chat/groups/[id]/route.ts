import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  group: z.record(z.string(), z.any()).optional(),
  name: z.string().nullable().optional(),
  userIds: z.array(z.string()).optional(),
}).passthrough();

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
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.chatGroup.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rawPayload = (parsed.data.group ?? parsed.data ?? {}) as Record<string, any>;
  const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;

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

