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
  console.error('Team check-in route failed', error);
  return NextResponse.json({ error: 'Failed to update team check-in.' }, { status: 500 });
};

const canViewCheckIns = async (
  session: { userId: string; isAdmin?: boolean },
  event: {
    id: string;
    hostId: string | null;
    assistantHostIds: string[];
    organizationId: string | null;
  },
) => {
  if (await canManageEvent({ ...session, isAdmin: Boolean(session.isAdmin) }, event)) {
    return true;
  }
  const official = await prisma.eventOfficials.findFirst({
    where: {
      eventId: event.id,
      userId: session.userId,
      isActive: { not: false },
    },
    select: { id: true },
  });
  return Boolean(official);
};

const loadManagedEventTeamIds = async (eventId: string, userId: string): Promise<Set<string>> => {
  const registrations = await prisma.eventRegistrations.findMany({
    where: {
      eventId,
      eventTeamId: { not: null },
      status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
    },
    select: { eventTeamId: true },
  });
  const eventTeamIds = Array.from(new Set(registrations
    .map((registration) => registration.eventTeamId)
    .filter((teamId): teamId is string => Boolean(teamId))));
  if (eventTeamIds.length === 0) {
    return new Set();
  }
  const [teams, assignments] = await Promise.all([
    prisma.teams.findMany({
      where: {
        id: { in: eventTeamIds },
        OR: [
          { managerId: userId },
          { headCoachId: userId },
          { coachIds: { has: userId } },
        ],
      },
      select: { id: true },
    }),
    prisma.eventTeamStaffAssignments.findMany({
      where: {
        eventTeamId: { in: eventTeamIds },
        userId,
        status: 'ACTIVE',
        role: { in: ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'] },
      },
      select: { eventTeamId: true },
    }),
  ]);
  return new Set([
    ...teams.map((team) => team.id),
    ...assignments.map((assignment) => assignment.eventTeamId),
  ]);
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamCheckInMode: true,
      teamCheckInOpenMinutesBefore: true,
      teamSignup: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  const canViewAll = await canViewCheckIns(session, event);
  const managedEventTeamIds = canViewAll
    ? null
    : await loadManagedEventTeamIds(eventId, session.userId);
  if (!canViewAll && managedEventTeamIds?.size === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const checkIns = await loadTeamCheckIns(prisma, eventId, { matchId: null });
  return NextResponse.json({
    checkIns: managedEventTeamIds
      ? checkIns.filter((checkIn) => managedEventTeamIds.has(checkIn.eventTeamId))
      : checkIns,
    teamCheckInMode: event.teamSignup ? event.teamCheckInMode ?? 'OFF' : 'OFF',
    teamCheckInOpenMinutesBefore: event.teamCheckInOpenMinutesBefore ?? 60,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const parsed = checkInSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const accessEvent = await prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });
    const canCheckInAnyTeam = accessEvent ? await canViewCheckIns(session, accessEvent) : false;
    const checkIn = await prisma.$transaction(async (tx) => {
      const event = await tx.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          start: true,
          teamSignup: true,
          teamCheckInMode: true,
          teamCheckInOpenMinutesBefore: true,
        },
      });
      if (!event) {
        throw new Response('Event not found.', { status: 404 });
      }
      return checkInTeam(tx, {
        event,
        eventTeamId: parsed.data.eventTeamId,
        checkedInByUserId: session.userId,
        canCheckInAnyTeam,
      });
    });
    return NextResponse.json({ checkIn });
  } catch (error) {
    return toErrorResponse(error);
  }
}
