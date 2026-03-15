import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';
import {
  applyUserPrivacyList,
  createVisibilityContext,
  publicUserSelect,
} from '@/server/userPrivacy';

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const includesId = (ids: string[], value: string): boolean => {
  return ids.map((entry) => entry.trim()).filter(Boolean).includes(value);
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = id.trim();
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const teamsDelegate = getTeamsDelegate(prisma);
  if (!teamsDelegate?.findUnique || !teamsDelegate?.findMany) {
    return NextResponse.json({ error: 'Team storage is unavailable. Regenerate Prisma client.' }, { status: 500 });
  }

  const team = await teamsDelegate.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      coachIds: true,
    },
  });

  if (!team) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isTeamManager = session.isAdmin
    || team.captainId === session.userId
    || team.managerId === session.userId
    || team.headCoachId === session.userId
    || includesId(normalizeIdList(team.coachIds), session.userId);

  const playerIds = normalizeIdList(team.playerIds);
  const parentLink = !isTeamManager && playerIds.length > 0
    ? await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId: { in: playerIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    : null;

  if (!isTeamManager && !parentLink) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const childTeams = await teamsDelegate.findMany({
    where: { parentTeamId: teamId },
    select: { id: true },
  });
  const relatedTeamIds = Array.from(new Set([teamId, ...childTeams.map((row: { id: string }) => row.id)]));

  const now = new Date();
  const events = await prisma.events.findMany({
    where: {
      teamIds: { hasSome: relatedTeamIds },
      NOT: { end: { lt: now } },
    },
    select: {
      id: true,
      freeAgentIds: true,
    },
    orderBy: { start: 'asc' },
  });

  const freeAgentIds = Array.from(
    new Set(
      events.flatMap((event) => normalizeIdList(event.freeAgentIds)),
    ),
  );

  if (!freeAgentIds.length) {
    return NextResponse.json({ users: [], eventIds: events.map((event) => event.id), freeAgentIds: [] }, { status: 200 });
  }

  const users = await prisma.userData.findMany({
    where: { id: { in: freeAgentIds } },
    select: publicUserSelect,
  });
  const usersById = new Map(users.map((user) => [user.id, user] as const));
  const orderedUsers = freeAgentIds
    .map((freeAgentId) => usersById.get(freeAgentId))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const visibilityContext = await createVisibilityContext(prisma, {
    viewerId: session.userId,
    isAdmin: session.isAdmin,
    teamId,
    allowManagerFreeAgentUnmask: true,
    freeAgentUserIds: freeAgentIds,
  });

  return NextResponse.json(
    {
      users: withLegacyList(applyUserPrivacyList(orderedUsers, visibilityContext)),
      eventIds: events.map((event) => event.id),
      freeAgentIds,
    },
    { status: 200 },
  );
}
