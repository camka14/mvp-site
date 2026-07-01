import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import {
  addTemporaryMatchRosterPlayer,
  getMatchRoster,
  isTeamManagerOrCoach,
  removeMatchRosterPlayer,
  restoreMatchRosterPlayer,
} from '@/server/matches/teamCheckIns';

export const dynamic = 'force-dynamic';

const rosterOperationSchema = z.object({
  eventTeamId: z.string().trim().min(1),
  removePlayer: z.object({
    userId: z.string().trim().min(1),
  }).optional(),
  restorePlayer: z.object({
    userId: z.string().trim().min(1),
  }).optional(),
  addPlayer: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    entryId: z.string().optional(),
  }).optional(),
}).strict();

const toErrorResponse = (error: unknown) => {
  if (error instanceof Response) {
    return error;
  }
  console.error('Match roster route failed', error);
  return NextResponse.json({ error: 'Failed to update match roster.' }, { status: 500 });
};

const canViewRoster = async (
  session: { userId: string; isAdmin?: boolean },
  event: {
    id: string;
    hostId: string | null;
    assistantHostIds: string[];
    organizationId: string | null;
  },
  teamIds: string[],
) => {
  if (await canManageEvent({ ...session, isAdmin: Boolean(session.isAdmin) }, event)) {
    return true;
  }
  const [official, teamAccess] = await Promise.all([
    prisma.eventOfficials.findFirst({
      where: {
        eventId: event.id,
        userId: session.userId,
        isActive: { not: false },
      },
      select: { id: true },
    }),
    Promise.all(teamIds.map((teamId) => isTeamManagerOrCoach(prisma, teamId, session.userId))),
  ]);
  return Boolean(official) || teamAccess.some(Boolean);
};

const loadRosterContext = async (eventId: string, matchId: string) => {
  const [event, match] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
        teamSignup: true,
        allowMatchRosterEdits: true,
        allowTemporaryMatchPlayers: true,
      },
    }),
    prisma.matches.findFirst({
      where: { id: matchId, eventId },
      select: {
        id: true,
        eventId: true,
        team1Id: true,
        team2Id: true,
        start: true,
        status: true,
        resultType: true,
        actualEnd: true,
      },
    }),
  ]);
  if (!event || !match) {
    throw new Response('Match not found.', { status: 404 });
  }
  const teamIds = [match.team1Id, match.team2Id].filter((teamId): teamId is string => Boolean(teamId));
  return { event, match, teamIds };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  try {
    const { event, teamIds } = await loadRosterContext(eventId, matchId);
    if (!await canViewRoster(session, event, teamIds)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const rosters = await Promise.all(teamIds.map((eventTeamId) => (
      getMatchRoster(prisma, { eventId, matchId, eventTeamId })
    )));
    return NextResponse.json({
      rosters,
      allowMatchRosterEdits: event.allowMatchRosterEdits === true,
      allowTemporaryMatchPlayers: event.allowTemporaryMatchPlayers === true,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; matchId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, matchId } = await params;
  const parsed = rosterOperationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [event, match] = await Promise.all([
        tx.events.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
            teamSignup: true,
            allowMatchRosterEdits: true,
            allowTemporaryMatchPlayers: true,
          },
        }),
        tx.matches.findFirst({
          where: { id: matchId, eventId },
          select: {
            id: true,
            eventId: true,
            team1Id: true,
            team2Id: true,
            start: true,
            status: true,
            resultType: true,
            actualEnd: true,
          },
        }),
      ]);
      if (!event || !match) {
        throw new Response('Match not found.', { status: 404 });
      }
      if (![match.team1Id, match.team2Id].includes(parsed.data.eventTeamId)) {
        throw new Response('Team is not assigned to this match.', { status: 400 });
      }
      const isManagerOrCoach = await isTeamManagerOrCoach(tx, parsed.data.eventTeamId, session.userId);
      const isHostOrAdmin = await canManageEvent(session, event, tx);
      if (!isManagerOrCoach && !isHostOrAdmin) {
        throw new Response('Forbidden', { status: 403 });
      }
      if (parsed.data.removePlayer) {
        await removeMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          userId: parsed.data.removePlayer.userId,
          actorUserId: session.userId,
          match,
          event,
        });
      } else if (parsed.data.restorePlayer) {
        await restoreMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          userId: parsed.data.restorePlayer.userId,
          match,
          event,
        });
      } else if (parsed.data.addPlayer) {
        await addTemporaryMatchRosterPlayer(tx, {
          eventId,
          matchId,
          eventTeamId: parsed.data.eventTeamId,
          firstName: parsed.data.addPlayer.firstName,
          lastName: parsed.data.addPlayer.lastName,
          email: parsed.data.addPlayer.email,
          existingEntryId: parsed.data.addPlayer.entryId,
          actorUserId: session.userId,
          match,
          event,
        });
      } else {
        throw new Response('No roster operation provided.', { status: 400 });
      }
      return getMatchRoster(tx, { eventId, matchId, eventTeamId: parsed.data.eventTeamId });
    });
    return NextResponse.json({ roster: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
