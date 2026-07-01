import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import {
  checkInTeam,
  loadTeamCheckIns,
} from '@/server/matches/teamCheckIns';

export const dynamic = 'force-dynamic';

const checkInSchema = z.object({
  eventTeamId: z.string().trim().min(1),
}).strict();

const toErrorResponse = (error: unknown) => {
  if (error instanceof Response) {
    return error;
  }
  console.error('Match team check-in route failed', error);
  return NextResponse.json({ error: 'Failed to update match team check-in.' }, { status: 500 });
};

const canViewMatchCheckIns = async (
  session: { userId: string; isAdmin?: boolean },
  event: {
    id: string;
    hostId: string | null;
    assistantHostIds: string[];
    organizationId: string | null;
  },
  match: { officialId?: string | null; officialIds?: unknown },
) => {
  if (await canManageEvent({ ...session, isAdmin: Boolean(session.isAdmin) }, event)) {
    return true;
  }
  if (match.officialId === session.userId) {
    return true;
  }
  const eventOfficial = await prisma.eventOfficials.findFirst({
    where: {
      eventId: event.id,
      userId: session.userId,
      isActive: { not: false },
    },
    select: { id: true },
  });
  return Boolean(eventOfficial);
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  const [event, match] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
        teamSignup: true,
        teamCheckInMode: true,
        teamCheckInOpenMinutesBefore: true,
      },
    }),
    prisma.matches.findFirst({
      where: { id: matchId, eventId },
      select: {
        id: true,
        eventId: true,
        team1Id: true,
        team2Id: true,
        officialId: true,
        officialIds: true,
        start: true,
      },
    }),
  ]);
  if (!event || !match) {
    return NextResponse.json({ error: 'Match not found.' }, { status: 404 });
  }
  if (!await canViewMatchCheckIns(session, event, match)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const checkIns = await loadTeamCheckIns(prisma, eventId, { matchId });
  return NextResponse.json({
    checkIns,
    teamCheckInMode: event.teamSignup ? event.teamCheckInMode ?? 'OFF' : 'OFF',
    teamCheckInOpenMinutesBefore: event.teamCheckInOpenMinutesBefore ?? 60,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  const parsed = checkInSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const checkIn = await prisma.$transaction(async (tx) => {
      const [event, match] = await Promise.all([
        tx.events.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            teamSignup: true,
            teamCheckInMode: true,
            teamCheckInOpenMinutesBefore: true,
          },
        }),
        tx.matches.findFirst({
          where: { id: matchId, eventId },
          select: { id: true, eventId: true, start: true, team1Id: true, team2Id: true },
        }),
      ]);
      if (!event || !match) {
        throw new Response('Match not found.', { status: 404 });
      }
      if (![match.team1Id, match.team2Id].includes(parsed.data.eventTeamId)) {
        throw new Response('Team is not assigned to this match.', { status: 400 });
      }
      return checkInTeam(tx, {
        event,
        match,
        eventTeamId: parsed.data.eventTeamId,
        checkedInByUserId: session.userId,
      });
    });
    return NextResponse.json({ checkIn });
  } catch (error) {
    return toErrorResponse(error);
  }
}
