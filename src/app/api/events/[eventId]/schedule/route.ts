import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  deleteMatchesByEvent,
  upsertEventFromPayload,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { rescheduleEventMatchesPreservingLocks } from '@/server/scheduler/reschedulePreservingLocks';
import { serializeEventLegacy, serializeMatchesLegacy } from '@/server/scheduler/serialize';
import {
  applyLeagueDivisionPlayoffReassignment,
  normalizeLeaguePlayoffPlacementMappings,
} from '@/server/scheduler/standings';
import { League, SchedulerContext } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const SCHEDULE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

const scheduleSchema = z.object({
  participantCount: z.number().int().positive().optional(),
  eventDocument: z.record(z.string(), z.any()).optional(),
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

const isLeagueEvent = (event: { eventType?: unknown }): event is League => (
  typeof event.eventType === 'string' && event.eventType.toUpperCase() === 'LEAGUE'
);

const applyConfirmedLeaguePlayoffReassignments = (
  league: League,
  context: SchedulerContext,
): {
  affectedPlayoffDivisionIds: string[];
  teamIdsByPlayoffDivision: Record<string, string[]>;
} => {
  const affectedPlayoffDivisionIds = new Set<string>();
  const teamIdsByPlayoffDivision: Record<string, string[]> = {};

  for (const division of league.divisions) {
    if (!division.standingsConfirmedAt) {
      continue;
    }
    const reassignment = applyLeagueDivisionPlayoffReassignment(
      league,
      division.id,
      context,
    );
    reassignment.affectedPlayoffDivisionIds.forEach((playoffDivisionId) => {
      affectedPlayoffDivisionIds.add(playoffDivisionId);
    });
    Object.entries(reassignment.teamIdsByPlayoffDivision).forEach(([playoffDivisionId, teamIds]) => {
      teamIdsByPlayoffDivision[playoffDivisionId] = teamIds;
    });
  }

  return {
    affectedPlayoffDivisionIds: Array.from(affectedPlayoffDivisionIds),
    teamIdsByPlayoffDivision,
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

      let event = await loadEventWithRelations(eventId, tx);

      if (parsed.data.eventDocument) {
        const eventDocument = {
          ...parsed.data.eventDocument,
          id: eventId,
          $id: eventId,
        };
        await upsertEventFromPayload(eventDocument, tx);
        event = await loadEventWithRelations(eventId, tx);
      }

      if (!['LEAGUE', 'TOURNAMENT'].includes(event.eventType)) {
        return { preview: false, event, matches: Object.values(event.matches), warnings: [] };
      }

      if (isLeagueEvent(event) && event.singleDivision) {
        const changedLeagueDivisionIds = normalizeLeaguePlayoffPlacementMappings(event);
        if (changedLeagueDivisionIds.length) {
          const now = new Date();
          const playoffMappingByDivisionId = new Map(
            event.divisions.map((division) => [division.id, [...(division.playoffPlacementDivisionIds ?? [])] as string[]]),
          );
          await Promise.all(
            changedLeagueDivisionIds.map((divisionId) =>
              tx.divisions.update({
                where: { id: divisionId },
                data: {
                  playoffPlacementDivisionIds: playoffMappingByDivisionId.get(divisionId) ?? [],
                  updatedAt: now,
                } as any,
              }),
            ),
          );
        }
      }

      const existingMatches = Object.values(event.matches);
      const hasExistingMatches = existingMatches.length > 0;
      const scheduled = (() => {
        if (hasExistingMatches) {
          try {
            return rescheduleEventMatchesPreservingLocks(event);
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : 'Unable to reschedule while preserving existing matches.';
            throw new ScheduleError(message);
          }
        }
        return scheduleEvent({ event, participantCount: parsed.data.participantCount }, context);
      })();

      if (isLeagueEvent(scheduled.event) && scheduled.event.singleDivision) {
        let reassignment;
        try {
          reassignment = applyConfirmedLeaguePlayoffReassignments(scheduled.event, context);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : 'Unable to assign league standings to playoff brackets.';
          throw new ScheduleError(message);
        }
        if (reassignment.affectedPlayoffDivisionIds.length) {
          const now = new Date();
          await Promise.all(
            reassignment.affectedPlayoffDivisionIds.map((playoffDivisionId) =>
              tx.divisions.update({
                where: { id: playoffDivisionId },
                data: {
                  teamIds: reassignment.teamIdsByPlayoffDivision[playoffDivisionId] ?? [],
                  updatedAt: now,
                } as any,
              }),
            ),
          );
        }
      }

      await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
      if (!hasExistingMatches) {
        await deleteMatchesByEvent(eventId, tx);
      }
      await saveMatches(eventId, scheduled.matches, tx);
      await saveEventSchedule(scheduled.event, tx);
      return {
        preview: false,
        ...scheduled,
        warnings: Array.isArray((scheduled as { warnings?: unknown[] }).warnings)
          ? (scheduled as { warnings: unknown[] }).warnings
          : [],
      };
    }, SCHEDULE_TRANSACTION_OPTIONS);

    return NextResponse.json(
      {
        preview: typeof result.preview === 'boolean' ? result.preview : false,
        event: serializeEventLegacy(result.event),
        matches: serializeMatchesLegacy(result.matches),
        warnings: Array.isArray((result as { warnings?: unknown[] }).warnings)
          ? (result as { warnings: unknown[] }).warnings
          : [],
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isFixedEndValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid schedule window';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Schedule event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
