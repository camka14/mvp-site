import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateAgeOnDate } from '@/lib/age';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  userId: z.string().optional(),
  teamId: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const ensureUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

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
  team: { captainId: string | null; managerId: string | null; playerIds: unknown };
}): boolean => {
  const players = Array.isArray(params.team.playerIds)
    ? params.team.playerIds.filter((id): id is string => typeof id === 'string')
    : [];
  return (
    params.team.captainId === params.sessionUserId
    || params.team.managerId === params.sessionUserId
    || players.includes(params.sessionUserId)
  );
};

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

  const targetUser = userId
    ? await prisma.userData.findUnique({
      where: { id: userId },
      select: { id: true, dateOfBirth: true },
    })
    : null;
  if (userId && !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (userId) {
    if (!session.isAdmin && userId !== session.userId) {
      const canManageChild = await canManageLinkedChildWaitlist({
        parentId: session.userId,
        childId: userId,
      });
      if (!canManageChild) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  if (teamId) {
    const team = await prisma.teams.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        playerIds: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    if (!session.isAdmin && !canManageTeamWaitlist({ sessionUserId: session.userId, team })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      teamSignup: true,
      waitListIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (teamId && !event.teamSignup) {
    return NextResponse.json(
      { error: 'Team waitlist is only available for team registration events.' },
      { status: 403 },
    );
  }
  if (mode === 'add' && userId && targetUser && !session.isAdmin) {
    const ageAtEvent = calculateAgeOnDate(targetUser.dateOfBirth, event.start);
    if (!Number.isFinite(ageAtEvent)) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }
    if (ageAtEvent < 18 && userId === session.userId) {
      const parentLink = await prisma.parentChildLinks.findFirst({
        where: {
          childId: userId,
          status: 'ACTIVE',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          parentId: true,
        },
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
  }

  const waitListIds = Array.isArray(event.waitListIds)
    ? event.waitListIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : [];
  const targetId = (userId ?? teamId)!;
  const nextWaitListIds = mode === 'add'
    ? ensureUnique([...waitListIds, targetId])
    : waitListIds.filter((id) => id !== targetId);

  const updated = await prisma.events.update({
    where: { id: eventId },
    data: {
      waitListIds: nextWaitListIds,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ event: withLegacyFields(updated) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateWaitlist(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateWaitlist(req, params, 'remove');
}
