import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { acquireEventLock } from '@/server/repositories/locks';
import { loadEventWithRelations, saveMatches } from '@/server/repositories/events';
import { applyLeagueDivisionPlayoffReassignment, getLeagueDivisionById } from '@/server/scheduler/standings';
import {
  buildDivisionStandingsResponse,
  getDivisionValidation,
  toLeagueEvent,
} from '../shared';

export const dynamic = 'force-dynamic';

const confirmSchema = z.object({
  divisionId: z.string().min(1),
  applyReassignment: z.boolean().optional(),
});

const buildValidationMessage = (messages: string[]): string => (
  messages.length === 1 ? messages[0] : messages.join(' ')
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = confirmSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const applyReassignment = parsed.data.applyReassignment !== false;
    const { eventId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          hostId: true,
          assistantHostIds: true,
          organizationId: true,
        },
      });
      if (!eventAccess) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, eventAccess, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const loaded = await loadEventWithRelations(eventId, tx);
      const league = toLeagueEvent(loaded);
      if (!league) {
        throw new Response('Standings are only available for leagues', { status: 400 });
      }

      const division = getLeagueDivisionById(league, parsed.data.divisionId);
      if (!division) {
        throw new Response('League division not found', { status: 404 });
      }

      const validation = getDivisionValidation(league, division);
      const validationErrors = [...validation.mappingErrors, ...validation.capacityErrors];
      if (validationErrors.length) {
        throw new Response(buildValidationMessage(validationErrors), { status: 400 });
      }

      const confirmedAt = new Date();
      await tx.divisions.update({
        where: { id: division.id },
        data: {
          standingsConfirmedAt: confirmedAt,
          standingsConfirmedBy: session.userId,
          updatedAt: confirmedAt,
        } as any,
      });

      division.standingsConfirmedAt = confirmedAt;
      division.standingsConfirmedBy = session.userId;

      let reassignedPlayoffDivisionIds: string[] = [];
      let seededTeamIds: string[] = [];
      let teamIdsByPlayoffDivision: Record<string, string[]> = {};
      if (applyReassignment) {
        const reassignment = applyLeagueDivisionPlayoffReassignment(
          league,
          division.id,
        );
        reassignedPlayoffDivisionIds = reassignment.affectedPlayoffDivisionIds;
        seededTeamIds = reassignment.seededTeamIds;
        teamIdsByPlayoffDivision = reassignment.teamIdsByPlayoffDivision;

        if (reassignedPlayoffDivisionIds.length) {
          const now = new Date();
          await Promise.all(
            reassignedPlayoffDivisionIds.map((playoffDivisionId) =>
              tx.divisions.update({
                where: { id: playoffDivisionId },
                data: {
                  teamIds: teamIdsByPlayoffDivision[playoffDivisionId] ?? [],
                  updatedAt: now,
                } as any,
              }),
            ),
          );
          await saveMatches(eventId, Object.values(league.matches), tx);
        }
      }

      return {
        division: buildDivisionStandingsResponse(league, division.id),
        applyReassignment,
        reassignedPlayoffDivisionIds,
        seededTeamIds,
        teamIdsByPlayoffDivision,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to confirm standings', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
