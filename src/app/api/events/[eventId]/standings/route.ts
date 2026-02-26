import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { acquireEventLock } from '@/server/repositories/locks';
import { loadEventWithRelations } from '@/server/repositories/events';
import { getLeagueDivisionById } from '@/server/scheduler/standings';
import {
  applyPointsOverrideUpdates,
  buildDivisionStandingsResponse,
  toLeagueEvent,
} from './shared';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  divisionId: z.string().min(1),
  pointsOverrides: z.array(z.object({
    teamId: z.string().min(1),
    points: z.number().nullable(),
  })).default([]),
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
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });

    if (!eventAccess) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (eventAccess.state === 'TEMPLATE') {
      const session = await requireSession(req);
      if (!(await canManageEvent(session, eventAccess))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const loaded = await loadEventWithRelations(eventId);
    const league = toLeagueEvent(loaded);
    if (!league) {
      return NextResponse.json({ error: 'Standings are only available for leagues' }, { status: 400 });
    }

    if (!getLeagueDivisionById(league, divisionId)) {
      return NextResponse.json({ error: 'League division not found' }, { status: 404 });
    }

    return NextResponse.json({
      division: buildDivisionStandingsResponse(league, divisionId),
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
      const league = toLeagueEvent(loaded);
      if (!league) {
        throw new Response('Standings are only available for leagues', { status: 400 });
      }

      const division = getLeagueDivisionById(league, parsed.data.divisionId);
      if (!division) {
        throw new Response('League division not found', { status: 404 });
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
      return buildDivisionStandingsResponse(league, division.id);
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
