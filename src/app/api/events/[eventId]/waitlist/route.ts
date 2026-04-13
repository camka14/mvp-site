import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';
import {
  deleteEventRegistration,
  upsertEventRegistration,
  type RegistrationRegistrantType,
} from '@/server/events/eventRegistrations';
import {
  isWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from '@/server/events/weeklyOccurrences';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  userId: z.string().optional(),
  teamId: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const canManageLinkedChildWaitlist = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const canManageTeamWaitlist = (params: {
  sessionUserId: string;
  team: { managerId: string | null };
}): boolean => params.team.managerId === params.sessionUserId;

async function updateWaitlist(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const requestedUserId = normalizeId(parsed.data.userId);
  const requestedTeamId = normalizeId(parsed.data.teamId);
  if (requestedUserId && requestedTeamId) {
    return NextResponse.json({ error: 'Specify either userId or teamId, not both.' }, { status: 400 });
  }

  const userId = requestedUserId ?? (!requestedTeamId ? session.userId : null);
  const teamId = requestedTeamId;
  if (!userId && !teamId) {
    return NextResponse.json({ error: 'userId or teamId is required.' }, { status: 400 });
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      teamSignup: true,
      eventType: true,
      parentEvent: true,
      timeSlotIds: true,
      divisions: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const occurrence = isWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
    })
    : null;
  if (occurrence && !occurrence.ok) {
    return NextResponse.json({ error: occurrence.error }, { status: 400 });
  }
  if (!isWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json({ error: 'Weekly occurrence selection is only valid for weekly events.' }, { status: 400 });
  }
  const resolvedOccurrence = occurrence?.ok ? occurrence.value : null;
  if (mode === 'add' && resolvedOccurrence && isWeeklyOccurrenceJoinClosed(resolvedOccurrence)) {
    return NextResponse.json({ error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR }, { status: 409 });
  }

  let registrantType: RegistrationRegistrantType = 'SELF';
  let parentId: string | null = null;
  let ageAtEvent: number | null = null;

  if (userId) {
    const targetUser = await prisma.userData.findUnique({
      where: { id: userId },
      select: { id: true, dateOfBirth: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const managingLinkedChild = !session.isAdmin && userId !== session.userId
      ? await canManageLinkedChildWaitlist({
        parentId: session.userId,
        childId: userId,
      })
      : false;
    if (!session.isAdmin && userId !== session.userId && !managingLinkedChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    ageAtEvent = calculateAgeOnDate(targetUser.dateOfBirth, event.start);
    if (mode === 'add' && userId === session.userId && !session.isAdmin && Number.isFinite(ageAtEvent) && ageAtEvent < 18) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          childId: userId,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        select: { parentId: true },
      });
      if (!parentLink?.parentId) {
        return NextResponse.json(
          { error: 'No linked parent/guardian found. Ask a parent to add you first.' },
          { status: 403 },
        );
      }
      return NextResponse.json(
        {
          event: withLegacyFields(event),
          requiresParentApproval: true,
        },
        { status: 200 },
      );
    }

    if (managingLinkedChild) {
      registrantType = 'CHILD';
      parentId = session.userId;
    }
  }

  if (teamId) {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        managerId: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    if (!session.isAdmin && !canManageTeamWaitlist({ sessionUserId: session.userId, team })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!event.teamSignup) {
      return NextResponse.json(
        { error: 'Team waitlist is only available for team registration events.' },
        { status: 403 },
      );
    }
    registrantType = 'TEAM';
  }

  if (mode === 'add') {
    const registrantId = (userId ?? teamId)!;
    await upsertEventRegistration({
      eventId,
      registrantType,
      registrantId,
      rosterRole: 'WAITLIST',
      status: 'ACTIVE',
      createdBy: session.userId,
      parentId,
      ageAtEvent,
      occurrence: resolvedOccurrence,
    });
  } else {
    await deleteEventRegistration({
      eventId,
      registrantType,
      registrantId: (userId ?? teamId)!,
      occurrence: resolvedOccurrence,
    });
  }

  const refreshedEvent = await prisma.events.findUnique({ where: { id: eventId } });
  return NextResponse.json(
    { event: refreshedEvent ? withLegacyFields(refreshedEvent) : withLegacyFields(event) },
    { status: 200 },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateWaitlist(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateWaitlist(req, params, 'remove');
}
