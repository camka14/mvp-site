import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { deleteMatchesByEvent, loadEventWithRelations, saveEventSchedule, saveMatches, upsertEventFromPayload } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string().optional(),
  event: z.record(z.string(), z.any()).optional(),
}).passthrough();

const coerceArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return undefined;
};

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
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

const isSchedulableEventType = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'LEAGUE' || normalized === 'TOURNAMENT';
};

const buildContext = (): SchedulerContext => {
  const debug = process.env.SCHEDULER_DEBUG === 'true';
  return {
    log: (message) => {
      if (debug) console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  };
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const organizationId = params.get('organizationId') || undefined;
  let hostId = params.get('hostId') || undefined;
  const sportId = params.get('sportId') || undefined;
  const eventType = params.get('eventType') || undefined;
  const state = params.get('state') || undefined;
  const limit = Number(params.get('limit') || '100');

  const normalizedState = typeof state === 'string' ? state.toUpperCase() : undefined;
  if (normalizedState === 'TEMPLATE') {
    // Event templates are private: only the host (or an admin) can list them.
    const session = await requireSession(req);
    if (!session.isAdmin) {
      if (hostId && hostId !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      hostId = session.userId;
    }
  }

  const ids = idsParam
    ? idsParam.split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;

  const where: any = {};
  // Event templates are not real events and should not appear in normal lists.
  if (!normalizedState) {
    where.NOT = { state: 'TEMPLATE' };
  }
  if (ids?.length) where.id = { in: ids };
  if (organizationId) where.organizationId = organizationId;
  if (hostId) where.hostId = hostId;
  if (sportId) where.sportId = sportId;
  if (eventType) where.eventType = eventType;
  if (state) where.state = normalizedState ?? state;

  const events = await prisma.events.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { start: 'asc' },
  });

  const normalized = events.map((row) => {
    if (!Array.isArray(row.userIds)) {
      row.userIds = coerceArray(row.userIds) ?? [];
    }
    return withLegacyEvent(row);
  });

  return NextResponse.json({ events: normalized }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data.event ?? parsed.data;
  const eventId = parsed.data.id ?? payload?.id ?? payload?.$id;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const eventPayload = {
    ...payload,
    id: eventId,
    hostId: payload?.hostId ?? session.userId,
  } as Record<string, unknown>;

  try {
    const context = buildContext();
    const event = await prisma.$transaction(async (tx) => {
      await upsertEventFromPayload(eventPayload, tx);

      const loaded = await loadEventWithRelations(eventId, tx);
      if (isSchedulableEventType(loaded.eventType)) {
        await acquireEventLock(tx, eventId);
        const scheduled = scheduleEvent({ event: loaded }, context);
        await deleteMatchesByEvent(eventId, tx);
        await saveMatches(eventId, scheduled.matches, tx);
        await saveEventSchedule(scheduled.event, tx);
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to create event');
      }
      return fresh;
    });

    return NextResponse.json({ event: withLegacyEvent(event) }, { status: 201 });
  } catch (error) {
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
