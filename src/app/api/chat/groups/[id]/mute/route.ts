import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const muteSchema = z.object({
  muted: z.boolean(),
}).passthrough();

const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const group = await prisma.chatGroup.findUnique({
    where: { id },
    select: { userIds: true, mutedUserIds: true },
  });

  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && !group.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const muted = (group.mutedUserIds ?? []).includes(session.userId);
  return NextResponse.json({ chatId: id, userId: session.userId, muted }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = muteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const group = await prisma.chatGroup.findUnique({
    where: { id },
    select: { userIds: true, mutedUserIds: true },
  });

  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && !group.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const nextMutedUserIds = new Set(uniqueIds((group.mutedUserIds ?? []).map((entry) => entry.trim())));
  if (parsed.data.muted) {
    nextMutedUserIds.add(session.userId);
  } else {
    nextMutedUserIds.delete(session.userId);
  }

  const updated = await prisma.chatGroup.update({
    where: { id },
    data: {
      mutedUserIds: Array.from(nextMutedUserIds),
      updatedAt: new Date(),
    },
    select: { mutedUserIds: true },
  });

  const muted = (updated.mutedUserIds ?? []).includes(session.userId);
  return NextResponse.json({ chatId: id, userId: session.userId, muted }, { status: 200 });
}
