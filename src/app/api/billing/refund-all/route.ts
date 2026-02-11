import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  eventId: z.string(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await prisma.events.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && event.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const refundUserIds = new Set<string>();
  for (const id of event.userIds ?? []) refundUserIds.add(id);
  for (const id of event.freeAgentIds ?? []) refundUserIds.add(id);

  if (event.teamIds?.length) {
    const teams = await prisma.volleyBallTeams.findMany({
      where: { id: { in: event.teamIds } },
      select: { captainId: true },
    });
    for (const team of teams) refundUserIds.add(team.captainId);
  }

  // Host doesn't need a refund request for their own event deletion.
  refundUserIds.delete(event.hostId);

  const targets = Array.from(refundUserIds).filter((id) => typeof id === 'string' && id.trim().length > 0);
  if (!targets.length) {
    return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
  }

  // Avoid creating duplicate refund requests for the same event/user pair.
  const existing = await prisma.refundRequests.findMany({
    where: {
      eventId: event.id,
      userId: { in: targets },
    },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((row) => row.userId));
  const toCreate = targets.filter((id) => !existingSet.has(id));

  if (toCreate.length) {
    await prisma.refundRequests.createMany({
      data: toCreate.map((userId) => ({
        id: crypto.randomUUID(),
        eventId: event.id,
        userId,
        hostId: event.hostId,
        organizationId: event.organizationId,
        reason: 'event_deleted_by_host',
        status: 'WAITING',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
  }

  return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
}

