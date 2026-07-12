import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { assertCanViewEventSchedule } from '@/server/eventVisibility';
import { acquireEventLock } from '@/server/repositories/locks';
import { loadEventWithRelations } from '@/server/repositories/events';
import { getLeagueDivisionById } from '@/server/scheduler/standings';
import {
  applyPointsOverrideUpdates,
  buildDivisionStandingsResponse,
  toStandingsEvent,
} from './shared';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  divisionId: z.string().min(1),
  pointsOverrides: z.array(z.object({
    teamId: z.string().trim().min(1),
    points: z.number().int().min(-9999).max(9999).nullable(),
  })).default([]),
}).superRefine((value, ctx) => {
  const seenTeamIds = new Set<string>();
  value.pointsOverrides.forEach((override, index) => {
    if (seenTeamIds.has(override.teamId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pointsOverrides', index, 'teamId'],
        message: 'Each team may only appear once.',
      });
      return;
    }
    seenTeamIds.add(override.teamId);
  });
});

const getDivisionIdFromRequest = (req: NextRequest): string | null => {
  const divisionId = req.nextUrl.searchParams.get('divisionId');
  if (!divisionId) {
    return null;
  }
  const normalized = divisionId.trim();
  return normalized.length > 0 ? normalized : null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const divisionId = getDivisionIdFromRequest(req);
    if (!divisionId) {
      return NextResponse.json({ error: 'divisionId is required' }, { status: 400 });
    }

    const eventAccess = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        state: true,
        archivedAt: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });

    if (!eventAccess) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await assertCanViewEventSchedule(req, eventAccess);

    const loaded = await loadEventWithRelations(eventId);
    const standingsEvent = toStandingsEvent(loaded);
    if (!standingsEvent) {
      return NextResponse.json({ error: 'Standings are only available for leagues or tournament pool play' }, { status: 400 });
    }

    if (!getLeagueDivisionById(standingsEvent, divisionId)) {
      return NextResponse.json({ error: 'Division not found' }, { status: 404 });
    }

    return NextResponse.json({
      division: buildDivisionStandingsResponse(standingsEvent, divisionId),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to load standings', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

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
      const standingsEvent = toStandingsEvent(loaded);
      if (!standingsEvent) {
        throw new Response('Standings are only available for leagues or tournament pool play', { status: 400 });
      }

      const division = getLeagueDivisionById(standingsEvent, parsed.data.divisionId);
      if (!division) {
        throw new Response('Division not found', { status: 404 });
      }

      const currentStandings = buildDivisionStandingsResponse(standingsEvent, division.id);
      const divisionTeamIds = new Set(currentStandings.standings.map((row) => row.teamId));
      const invalidTeamOverride = parsed.data.pointsOverrides.find((override) => !divisionTeamIds.has(override.teamId));
      if (invalidTeamOverride) {
        throw new Response(`Team is not part of the selected division: ${invalidTeamOverride.teamId}`, { status: 400 });
      }

      const nextOverrides = applyPointsOverrideUpdates(
        division.standingsOverrides,
        parsed.data.pointsOverrides,
      );

      await tx.divisions.update({
        where: { id: division.id },
        data: {
          standingsOverrides: nextOverrides,
          updatedAt: new Date(),
        } as any,
      });

      division.standingsOverrides = nextOverrides;
      return buildDivisionStandingsResponse(standingsEvent, division.id);
    });

    return NextResponse.json({ division: result }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to update standings overrides', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
