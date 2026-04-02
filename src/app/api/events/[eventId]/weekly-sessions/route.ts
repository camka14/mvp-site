import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';
import {
  resolveOrCreateWeeklySessionChild,
  WeeklySessionResolutionError,
} from '@/server/events/weeklySessionResolver';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  sessionStart: z.string(),
  sessionEnd: z.string(),
  slotId: z.string().optional(),
  divisionId: z.string().optional(),
  divisionTypeId: z.string().optional(),
  divisionTypeKey: z.string().optional(),
}).strict();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const sessionStart = parseDateInput(parsed.data.sessionStart);
  const sessionEnd = parseDateInput(parsed.data.sessionEnd);
  const slotId = normalizeId(parsed.data.slotId);
  if (!(sessionStart instanceof Date) || Number.isNaN(sessionStart.getTime())) {
    return NextResponse.json({ error: 'Invalid sessionStart' }, { status: 400 });
  }
  if (!(sessionEnd instanceof Date) || Number.isNaN(sessionEnd.getTime()) || sessionEnd.getTime() <= sessionStart.getTime()) {
    return NextResponse.json({ error: 'Invalid sessionEnd' }, { status: 400 });
  }

  const parent = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (!parent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const parentEventType = String(parent.eventType ?? '').toUpperCase();
  const parentEventId = normalizeId((parent as any).parentEvent);
  if (parentEventType !== 'WEEKLY_EVENT' || parentEventId) {
    return NextResponse.json({ error: 'Weekly sessions can only be created from parent weekly events.' }, { status: 400 });
  }

  const isManager = await canManageEvent(session, parent);
  const state = String(parent.state ?? '').toUpperCase();
  if (state === 'UNPUBLISHED' && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction((tx) => (
      resolveOrCreateWeeklySessionChild(
        {
          parentEventId: eventId,
          sessionStart,
          sessionEnd,
          slotId,
        },
        tx,
      )
    ));

    return NextResponse.json(
      { event: withLegacyFields(result.event) },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof WeeklySessionResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to resolve weekly session child event', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
