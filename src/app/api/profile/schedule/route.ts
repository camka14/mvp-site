import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  )
);

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;

  const from = parseDateInput(params.get('from'));
  const to = parseDateInput(params.get('to'));
  const rawLimit = Number(params.get('limit') || '200');
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.round(rawLimit))) : 200;

  const user = await prisma.userData.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      teamIds: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const teamIds = Array.isArray(user.teamIds)
    ? user.teamIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  const involvementFilters: Record<string, unknown>[] = [
    { userIds: { has: user.id } },
    { freeAgentIds: { has: user.id } },
    { waitListIds: { has: user.id } },
    { refereeIds: { has: user.id } },
  ];
  if (teamIds.length) {
    involvementFilters.push({ teamIds: { hasSome: teamIds } });
  }

  const where: Record<string, unknown> = {
    NOT: { state: 'TEMPLATE' },
    OR: involvementFilters,
  };

  const dateConditions: Record<string, unknown>[] = [];
  if (from) {
    dateConditions.push({ end: { gte: from } });
  }
  if (to) {
    dateConditions.push({ start: { lte: to } });
  }
  if (dateConditions.length) {
    where.AND = dateConditions;
  }

  const events = await prisma.events.findMany({
    where,
    take: limit,
    orderBy: { start: 'asc' },
  });

  const eventIds = events.map((event) => event.id);
  const matchFilters: Record<string, unknown>[] = [{ refereeId: user.id }];
  if (teamIds.length) {
    matchFilters.push(
      { team1Id: { in: teamIds } },
      { team2Id: { in: teamIds } },
      { teamRefereeId: { in: teamIds } },
    );
  }

  const matches = eventIds.length
    ? await prisma.matches.findMany({
        where: {
          eventId: { in: eventIds },
          OR: matchFilters,
        },
        orderBy: { start: 'asc' },
      })
    : [];

  const fieldIds = uniqueStrings([
    ...events.flatMap((event) => (Array.isArray(event.fieldIds) ? event.fieldIds : [])),
    ...matches.map((match) => match.fieldId),
  ]);

  const relatedTeamIds = uniqueStrings([
    ...events.flatMap((event) => (Array.isArray(event.teamIds) ? event.teamIds : [])),
    ...matches.flatMap((match) => [match.team1Id, match.team2Id, match.teamRefereeId]),
  ]);

  const teamsDelegate = getTeamsDelegate(prisma);
  const [fields, teams] = await Promise.all([
    fieldIds.length
      ? prisma.fields.findMany({
          where: { id: { in: fieldIds } },
          orderBy: { fieldNumber: 'asc' },
        })
      : Promise.resolve([]),
    relatedTeamIds.length && teamsDelegate?.findMany
      ? teamsDelegate.findMany({
          where: { id: { in: relatedTeamIds } },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    events: withLegacyList(events),
    matches: withLegacyList(matches),
    fields: withLegacyList(fields),
    teams: withLegacyList(teams as Record<string, any>[]),
  });
}
