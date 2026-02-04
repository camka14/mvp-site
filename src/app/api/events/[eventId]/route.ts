import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  event: z.record(z.string(), z.any()).optional(),
}).passthrough();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (legacy.playerIds === undefined && Array.isArray(legacy.userIds)) {
    (legacy as any).playerIds = legacy.userIds;
  }
  if (!Array.isArray(legacy.waitListIds)) {
    (legacy as any).waitListIds = [];
  }
  if (!Array.isArray(legacy.freeAgentIds)) {
    (legacy as any).freeAgentIds = [];
  }
  if (!Array.isArray(legacy.refereeIds)) {
    (legacy as any).refereeIds = [];
  }
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
  }
  return legacy;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyEvent(event), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const existing = await prisma.events.findUnique({ where: { id: eventId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && existing.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = parsed.data.event ?? parsed.data ?? {};
  if ('playerIds' in payload && !('userIds' in payload)) {
    payload.userIds = payload.playerIds;
  }

  if (payload.installmentDueDates) {
    payload.installmentDueDates = Array.isArray(payload.installmentDueDates)
      ? payload.installmentDueDates.map((value: unknown) => parseDateInput(value)).filter(Boolean)
      : payload.installmentDueDates;
  }

  if (payload.start) {
    const parsedStart = parseDateInput(payload.start);
    if (parsedStart) payload.start = parsedStart;
  }

  if (payload.end) {
    const parsedEnd = parseDateInput(payload.end);
    if (parsedEnd) payload.end = parsedEnd;
  }

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: {
      ...payload,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyEvent(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && event.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.events.delete({ where: { id: eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
