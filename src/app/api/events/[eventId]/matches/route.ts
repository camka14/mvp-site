import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';
import { canManageEvent } from '@/server/accessControl';
import { loadEventWithRelations, saveMatches, saveTeamRecords } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { applyMatchUpdates } from '@/server/scheduler/updateMatch';
import { serializeMatchesLegacy } from '@/server/scheduler/serialize';

export const dynamic = 'force-dynamic';

const bulkMatchUpdateSchema = z.object({
  id: z.string().optional(),
  $id: z.string().optional(),
  locked: z.boolean().optional(),
  matchId: z.number().int().nullable().optional(),
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
  start: z.string().optional(),
  end: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
  losersBracket: z.boolean().optional(),
}).passthrough();

const bulkUpdateSchema = z.object({
  matches: z.array(bulkMatchUpdateSchema).min(1),
});

const resolveMatchId = (entry: z.infer<typeof bulkMatchUpdateSchema>): string | null => {
  if (typeof entry.id === 'string' && entry.id.trim().length > 0) {
    return entry.id.trim();
  }
  if (typeof entry.$id === 'string' && entry.$id.trim().length > 0) {
    return entry.$id.trim();
  }
  return null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const matches = await prisma.matches.findMany({
    where: { eventId },
    orderBy: { start: 'asc' },
  });
  return NextResponse.json({ matches: withLegacyList(matches) }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = bulkUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  try {
    const updatedMatches = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);

      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
      });
      if (!eventAccess) {
        throw new Response('Event not found', { status: 404 });
      }
      if (!(await canManageEvent(session, eventAccess, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const event = await loadEventWithRelations(eventId, tx);
      const touchedIds: string[] = [];

      for (const entry of parsed.data.matches) {
        const matchId = resolveMatchId(entry);
        if (!matchId) {
          throw new Response('Each match update must include an id.', { status: 400 });
        }

        const target = event.matches[matchId];
        if (!target) {
          throw new Response(`Match ${matchId} not found.`, { status: 404 });
        }

        applyMatchUpdates(event, target, {
          locked: entry.locked,
          team1Points: entry.team1Points,
          team2Points: entry.team2Points,
          setResults: entry.setResults,
          team1Id: entry.team1Id,
          team2Id: entry.team2Id,
          refereeId: entry.refereeId,
          teamRefereeId: entry.teamRefereeId,
          fieldId: entry.fieldId,
          previousLeftId: entry.previousLeftId,
          previousRightId: entry.previousRightId,
          winnerNextMatchId: entry.winnerNextMatchId,
          loserNextMatchId: entry.loserNextMatchId,
          side: entry.side,
          refereeCheckedIn: entry.refereeCheckedIn,
          matchId: entry.matchId ?? undefined,
        });

        if (Object.prototype.hasOwnProperty.call(entry, 'start')) {
          const parsedStart = parseDateInput(entry.start);
          if (!parsedStart) {
            throw new Response(`Invalid start value for match ${matchId}.`, { status: 400 });
          }
          target.start = parsedStart;
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'end')) {
          if (entry.end == null) {
            (target as unknown as { end: Date | null }).end = null;
          } else {
            const parsedEnd = parseDateInput(entry.end);
            if (!parsedEnd) {
              throw new Response(`Invalid end value for match ${matchId}.`, { status: 400 });
            }
            target.end = parsedEnd;
          }
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'division')) {
          const divisionId = typeof entry.division === 'string' && entry.division.trim().length > 0
            ? entry.division.trim()
            : null;
          if (!divisionId) {
            (target as unknown as { division: typeof target.division | null }).division = null;
          } else {
            const division = event.divisions.find((candidate) => candidate.id === divisionId);
            if (!division) {
              throw new Response(`Division ${divisionId} not found for match ${matchId}.`, { status: 400 });
            }
            target.division = division;
          }
        }

        if (Object.prototype.hasOwnProperty.call(entry, 'losersBracket')) {
          target.losersBracket = Boolean(entry.losersBracket);
        }

        touchedIds.push(matchId);
      }

      await saveMatches(eventId, Object.values(event.matches), tx);
      await saveTeamRecords(Object.values(event.teams), tx);
      return touchedIds
        .map((id) => event.matches[id])
        .filter((match): match is NonNullable<typeof match> => Boolean(match));
    });

    return NextResponse.json({ matches: serializeMatchesLegacy(updatedMatches) }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Bulk match update failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.matches.deleteMany({ where: { eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
