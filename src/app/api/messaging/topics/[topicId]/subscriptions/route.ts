import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { registerPushDeviceTarget, unregisterPushDeviceTarget } from '@/server/pushNotifications';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  pushToken: z.string().optional().nullable(),
  pushTarget: z.string().optional().nullable(),
  pushPlatform: z.string().optional().nullable(),
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
  const requestUserIds = uniqueIds(parsed.data.userIds.map((id) => id.trim()).filter(Boolean));
  if (!requestUserIds.length) {
    return NextResponse.json({ error: 'Invalid input', details: { userIds: ['At least one user id is required'] } }, { status: 400 });
  }

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  const now = new Date();
  const mergedUserIds = uniqueIds([...(existing?.userIds ?? []), ...requestUserIds]);

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

  const pushToken = parsed.data.pushToken?.trim();
  if (pushToken) {
    const pushUserId = session.isAdmin ? requestUserIds[0] : session.userId;
    await registerPushDeviceTarget({
      userId: pushUserId,
      pushToken,
      pushTarget: parsed.data.pushTarget?.trim() || topicId,
      pushPlatform: parsed.data.pushPlatform?.trim() || null,
    }).catch((error) => {
      console.warn('Failed to register push device target', { topicId, error });
    });
  }

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
  const requestUserIds = uniqueIds(parsed.data.userIds.map((id) => id.trim()).filter(Boolean));
  if (!requestUserIds.length) {
    return NextResponse.json({ error: 'Invalid input', details: { userIds: ['At least one user id is required'] } }, { status: 400 });
  }

  const existing = await prisma.chatGroup.findUnique({ where: { id: topicId } });
  if (!existing) {
    return NextResponse.json({ topicId, topic: null }, { status: 200 });
  }

  const removeIds = new Set(requestUserIds);
  const nextUserIds = (existing.userIds ?? []).filter((id) => !removeIds.has(id));

  const record = await prisma.chatGroup.update({
    where: { id: topicId },
    data: { userIds: nextUserIds, updatedAt: new Date() },
  });

  await unregisterPushDeviceTarget({
    userIds: requestUserIds,
    pushToken: parsed.data.pushToken?.trim() || null,
    pushTarget: parsed.data.pushTarget?.trim() || topicId,
  }).catch((error) => {
    console.warn('Failed to unregister push device target', { topicId, error });
  });

  return NextResponse.json({ topicId, topic: withLegacyFields(record) }, { status: 200 });
}
