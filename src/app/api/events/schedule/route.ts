import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  deleteMatchesByEvent,
  isEventFieldConflictError,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  upsertEventFromPayload,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { serializeEventLegacy, serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { SchedulerContext } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';
import {
  extractRentalCheckoutWindow,
  releaseRentalCheckoutLocks,
  type RentalCheckoutWindow,
} from '@/server/repositories/rentalCheckoutLocks';

export const dynamic = 'force-dynamic';

const SCHEDULE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

const scheduleSchema = z.object({
  eventId: z.string().optional(),
  event: z.string().optional(),
  eventDocument: z.record(z.string(), z.any()).optional(),
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

const isFixedEndValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('No fixed end date/time')
    || message.includes('No fixed end datetime scheduling')
    || message.includes('End date/time must be after start date/time');
};

const isOrganizationFieldRequirementError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Organization events require at least one saved field');
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventDocument, participantCount } = parsed.data;
    let eventId = parsed.data.eventId ?? parsed.data.event;
    const context = buildContext();
    let rentalLockWindowToRelease: RentalCheckoutWindow | null = null;

    if (eventDocument && typeof eventDocument === 'object') {
      const slotSource = Array.isArray((eventDocument as Record<string, unknown>).timeSlots)
        ? ((eventDocument as Record<string, unknown>).timeSlots as unknown[])[0]
        : null;
      const rentalWindowCandidate = extractRentalCheckoutWindow({
        event: eventDocument,
        timeSlot: slotSource,
      });
      if (rentalWindowCandidate.ok) {
        rentalLockWindowToRelease = rentalWindowCandidate.window;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (eventDocument) {
        const eventPayload = eventDocument as Record<string, unknown>;
        const payloadEventId = String(eventPayload.id ?? eventPayload.$id ?? '').trim();
        const existingEvent = payloadEventId
          ? await tx.events.findUnique({
              where: { id: payloadEventId },
              select: { id: true },
            })
          : null;
        const payloadForUpsert = !existingEvent
          ? {
              ...eventPayload,
              hostId: session.userId,
            }
          : eventPayload;
        eventId = await upsertEventFromPayload(payloadForUpsert, tx);
      }
      if (!eventId) {
        throw new Error('Missing eventId');
      }

      await acquireEventLock(tx, eventId);
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
      });
      if (!eventAccess) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, eventAccess, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const event = await loadEventWithRelations(eventId, tx);

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        return { preview: false, event, matches: Object.values(event.matches) };
      }

      const scheduled = scheduleEvent({ event, participantCount }, context);
      await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
      await deleteMatchesByEvent(eventId, tx);
      await saveMatches(eventId, scheduled.matches, tx);
      await saveEventSchedule(scheduled.event, tx);
      return scheduled;
    }, SCHEDULE_TRANSACTION_OPTIONS);

    if (rentalLockWindowToRelease && eventId) {
      const windowWithResolvedEventId = {
        ...rentalLockWindowToRelease,
        eventId,
      };
      try {
        await releaseRentalCheckoutLocks({
          client: prisma,
          window: windowWithResolvedEventId,
          userId: session.userId,
        });
      } catch (error) {
        console.warn('Failed to release rental checkout lock after successful schedule.', {
          eventId,
          fieldIds: windowWithResolvedEventId.fieldIds,
          error,
        });
      }
    }

    return NextResponse.json(
      {
        preview: typeof result.preview === 'boolean' ? result.preview : false,
        event: serializeEventLegacy(result.event),
        matches: serializeMatchesLegacy(result.matches),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (isEventFieldConflictError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          conflicts: error.conflicts.map((conflict) => ({
            fieldId: conflict.fieldId,
            parentId: conflict.parentId,
            start: conflict.start.toISOString(),
            end: conflict.end.toISOString(),
          })),
        },
        { status: 409 },
      );
    }
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isFixedEndValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid schedule window';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isOrganizationFieldRequirementError(error)) {
      const message = error instanceof Error ? error.message : 'Organization field is required';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Schedule event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
