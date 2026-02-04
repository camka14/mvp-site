import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadEventWithRelations, saveEventSchedule, saveMatches, deleteMatchesByEvent } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { serializeEventAppwrite, serializeMatchesAppwrite } from '@/server/scheduler/serialize';
import { SchedulerContext } from '@/server/scheduler/types';

export const dynamic = 'force-dynamic';

const scheduleSchema = z.object({
  participantCount: z.number().int().positive().optional(),
});

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = scheduleSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId } = await params;
    const context = buildContext();

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const event = await loadEventWithRelations(eventId, tx);

      if (!session.isAdmin && session.userId !== event.hostId) {
        throw new Response('Forbidden', { status: 403 });
      }

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        return { preview: false, event, matches: Object.values(event.matches) };
      }

      const scheduled = scheduleEvent({ event, participantCount: parsed.data.participantCount }, context);
      await deleteMatchesByEvent(eventId, tx);
      await saveMatches(eventId, scheduled.matches, tx);
      await saveEventSchedule(scheduled.event, tx);
      return scheduled;
    });

    return NextResponse.json(
      {
        preview: typeof result.preview === 'boolean' ? result.preview : false,
        event: serializeEventAppwrite(result.event),
        matches: serializeMatchesAppwrite(result.matches),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Schedule event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
