import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadEventWithRelations, saveMatches, saveTeamRecords } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { applyMatchUpdates, finalizeMatch } from '@/server/scheduler/updateMatch';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { SchedulerContext } from '@/server/scheduler/types';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  team1Points: z.array(z.number()).optional(),
  team2Points: z.array(z.number()).optional(),
  setResults: z.array(z.number()).optional(),
  team1Id: z.string().nullable().optional(),
  team2Id: z.string().nullable().optional(),
  refereeId: z.string().nullable().optional(),
  teamRefereeId: z.string().nullable().optional(),
  fieldId: z.string().nullable().optional(),
  previousLeftId: z.string().nullable().optional(),
  previousRightId: z.string().nullable().optional(),
  winnerNextMatchId: z.string().nullable().optional(),
  loserNextMatchId: z.string().nullable().optional(),
  side: z.string().nullable().optional(),
  refereeCheckedIn: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
  finalize: z.boolean().optional(),
  time: z.string().optional(),
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId, matchId } = await params;
    const context = buildContext();

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const event = await loadEventWithRelations(eventId, tx);

      if (!session.isAdmin && session.userId !== event.hostId) {
        throw new Response('Forbidden', { status: 403 });
      }

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        throw new Response('Unsupported event type', { status: 400 });
      }

      const targetMatch = event.matches[matchId];
      if (!targetMatch) {
        throw new Response('Match not found', { status: 404 });
      }

      applyMatchUpdates(event, targetMatch, parsed.data);

      if (parsed.data.finalize) {
        const currentTime = parsed.data.time ? new Date(parsed.data.time) : new Date();
        if (Number.isNaN(currentTime.getTime())) {
          throw new Response('Invalid time', { status: 400 });
        }
        finalizeMatch(event, targetMatch, context, currentTime);
      }

      await saveMatches(eventId, Object.values(event.matches), tx);
      await saveTeamRecords(Object.values(event.teams), tx);

      return targetMatch;
    });

    return NextResponse.json({ match: serializeMatchesLegacy([result])[0] }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Match update failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string; matchId: string }> }) {
  try {
    const session = await requireSession(req);
    const { eventId, matchId } = await params;
    const event = await prisma.events.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (!session.isAdmin && event.hostId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.matches.delete({ where: { id: matchId } });
    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Match delete failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
