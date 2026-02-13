import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { deleteMatchesByEvent, loadEventWithRelations, saveEventSchedule, saveMatches } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';

export const dynamic = 'force-dynamic';

const EVENT_UPDATE_FIELDS = new Set([
  'name',
  'start',
  'end',
  'description',
  'divisions',
  'winnerSetCount',
  'loserSetCount',
  'doubleElimination',
  'location',
  'rating',
  'teamSizeLimit',
  'maxParticipants',
  'minAge',
  'maxAge',
  'hostId',
  'price',
  'singleDivision',
  'waitListIds',
  'freeAgentIds',
  'cancellationRefundHours',
  'teamSignup',
  'prize',
  'registrationCutoffHours',
  'seedColor',
  'imageId',
  'fieldCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'coordinates',
  'gamesPerOpponent',
  'includePlayoffs',
  'playoffTeamCount',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'restTimeMinutes',
  'state',
  'pointsToVictory',
  'sportId',
  'timeSlotIds',
  'fieldIds',
  'teamIds',
  'userIds',
  'registrationIds',
  'leagueScoringConfigId',
  'organizationId',
  'autoCancellation',
  'eventType',
  'fieldType',
  'doTeamsRef',
  'refereeIds',
  'allowPaymentPlans',
  'installmentCount',
  'installmentDueDates',
  'installmentAmounts',
  'allowTeamSplitDefault',
  'requiredTemplateIds',
]);

const updateSchema = z.object({
  event: z.record(z.string(), z.any()).optional(),
}).passthrough();

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

const ORDER_SENSITIVE_ARRAYS = new Set([
  'pointsToVictory',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
]);

const normalizeStringArray = (value: unknown, key?: string): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const mapped = value.map((item) => String(item)).filter(Boolean);
  if (key && ORDER_SENSITIVE_ARRAYS.has(key)) {
    return mapped;
  }
  return mapped.sort();
};

const arraysEqual = (left: string[] | null, right: string[] | null): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const hasScheduleImpact = (existing: any, payload: Record<string, any>): boolean => {
  const scheduleFields = [
    'eventType',
    'start',
    'end',
    'divisions',
    'fieldIds',
    'timeSlotIds',
    'fieldCount',
    'gamesPerOpponent',
    'includePlayoffs',
    'playoffTeamCount',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
    'setsPerMatch',
    'restTimeMinutes',
    'pointsToVictory',
    'winnerSetCount',
    'loserSetCount',
    'doubleElimination',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'teamIds',
    'userIds',
    'maxParticipants',
    'teamSizeLimit',
    'singleDivision',
  ];

  return scheduleFields.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      return false;
    }

    const nextValue = payload[key];
    const prevValue = (existing as Record<string, any>)[key];

    if (key === 'start' || key === 'end') {
      const nextTime = nextValue instanceof Date ? nextValue.getTime() : parseDateInput(nextValue)?.getTime();
      const prevTime = prevValue instanceof Date ? prevValue.getTime() : parseDateInput(prevValue)?.getTime();
      return nextTime !== prevTime;
    }

    if (Array.isArray(nextValue) || Array.isArray(prevValue)) {
      return !arraysEqual(normalizeStringArray(nextValue, key), normalizeStringArray(prevValue, key));
    }

    if (key === 'eventType') {
      const nextType = typeof nextValue === 'string' ? nextValue.toUpperCase() : nextValue;
      const prevType = typeof prevValue === 'string' ? prevValue.toUpperCase() : prevValue;
      return nextType !== prevType;
    }

    return nextValue !== prevValue;
  });
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (event.state === 'TEMPLATE') {
    const session = await requireSession(_req);
    if (!session.isAdmin && session.userId !== event.hostId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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

  try {
    const context = buildContext();
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.events.findUnique({ where: { id: eventId } });
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      if (!session.isAdmin && existing.hostId !== session.userId) {
        throw new Response('Forbidden', { status: 403 });
      }

      const rawPayload = (parsed.data.event ?? parsed.data ?? {}) as Record<string, any>;
      const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;

      // Never allow callers to override the URL id or server-managed timestamps.
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;

      // Drop relationship objects that Prisma doesn't accept on `events.update`.
      delete payload.players;
      delete payload.referees;
      delete payload.teams;
      delete payload.fields;
      delete payload.matches;
      delete payload.timeSlots;
      delete payload.leagueConfig;

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

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!EVENT_UPDATE_FIELDS.has(key)) continue;
        data[key] = value;
      }

      const shouldSchedule = hasScheduleImpact(existing, data);
      const updatedEvent = await tx.events.update({
        where: { id: eventId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      const nextEventType = (data.eventType ?? existing.eventType ?? updatedEvent.eventType) as string | null;
      if (shouldSchedule && isSchedulableEventType(nextEventType)) {
        await acquireEventLock(tx, eventId);
        const loaded = await loadEventWithRelations(eventId, tx);
        if (isSchedulableEventType(loaded.eventType)) {
          const scheduled = scheduleEvent({ event: loaded }, context);
          await deleteMatchesByEvent(eventId, tx);
          await saveMatches(eventId, scheduled.matches, tx);
          await saveEventSchedule(scheduled.event, tx);
        }
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to update event');
      }
      return fresh;
    });

    return NextResponse.json(withLegacyEvent(updated), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
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
