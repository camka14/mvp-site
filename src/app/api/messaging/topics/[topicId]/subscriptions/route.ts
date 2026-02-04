import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userIds: z.array(z.string()).min(1),
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

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  const now = new Date();
  const mergedUserIds = uniqueIds([...(existing?.userIds ?? []), ...parsed.data.userIds]);

  const record = existing
    ? await prisma.chatGroup.update({
      where: { id: topicId },
      data: { userIds: mergedUserIds, updatedAt: now },
    })
    : await prisma.chatGroup.create({
      data: {
        id: topicId,
        name: null,
        userIds: mergedUserIds,
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
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  if (!existing) {
    return NextResponse.json({ topicId, topic: null }, { status: 200 });
  }

  const removeIds = new Set(parsed.data.userIds);
  const nextUserIds = (existing.userIds ?? []).filter((id) => !removeIds.has(id));

  const record = await prisma.chatGroup.update({
    where: { id: topicId },
    data: { userIds: nextUserIds, updatedAt: new Date() },
  });

  return NextResponse.json({ topicId, topic: withLegacyFields(record) }, { status: 200 });
}
