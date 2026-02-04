import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const schema = z.object({
  topicName: z.string().optional(),
  name: z.string().optional(),
  userIds: z.array(z.string()).optional(),
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

  const name = parsed.data.topicName ?? parsed.data.name ?? null;
  const userIds = Array.isArray(parsed.data.userIds) ? uniqueIds(parsed.data.userIds) : [];

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  const now = new Date();

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
  await requireSession(req);
  const { topicId } = await params;
  await prisma.chatGroup.deleteMany({ where: { id: topicId } });
  return NextResponse.json({ deleted: true, topicId }, { status: 200 });
}
