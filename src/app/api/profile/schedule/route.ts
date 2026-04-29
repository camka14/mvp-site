import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import { getCanonicalTeamIdsByUserIds } from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const SCHEDULE_REGISTRATION_STATUSES = ['ACTIVE', 'STARTED', 'BLOCKED'] as const;

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
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const teamIdsByUserId = await getCanonicalTeamIdsByUserIds([user.id], prisma);
  const teamIds = teamIdsByUserId.get(user.id) ?? [];

  const teamsDelegate = getTeamsDelegate(prisma);
  const slotTeamRows = teamIds.length && teamsDelegate?.findMany
    ? await teamsDelegate.findMany({
        where: { parentTeamId: { in: teamIds } },
        select: { id: true },
      })
    : [];
  const slotTeamIds = uniqueStrings(slotTeamRows.map((row: { id?: unknown }) => String(row.id ?? '').trim()));
  const relevantTeamIds = uniqueStrings([...teamIds, ...slotTeamIds]);
  const registrationRows = await prisma.eventRegistrations.findMany({
    where: {
      status: { in: [...SCHEDULE_REGISTRATION_STATUSES] },
      OR: [
        {
          registrantId: user.id,
          registrantType: { in: ['SELF', 'CHILD'] },
        },
        ...(relevantTeamIds.length
          ? [{
              registrantId: { in: relevantTeamIds },
              registrantType: 'TEAM' as const,
            }]
          : []),
      ],
    },
    select: {
      eventId: true,
    },
  });
  const registeredEventIds = uniqueStrings(
    registrationRows.map((row: { eventId?: unknown }) => String(row.eventId ?? '').trim()),
  );
  const officialRows = typeof (prisma as any).eventOfficials?.findMany === 'function'
    ? await (prisma as any).eventOfficials.findMany({
      where: {
        userId: user.id,
        isActive: { not: false },
      },
      select: { eventId: true },
    })
    : [];
  const officialEventIds = uniqueStrings(
    officialRows.map((row: { eventId?: unknown }) => String(row.eventId ?? '').trim()),
  );
  const involvedEventIds = uniqueStrings([...registeredEventIds, ...officialEventIds]);

  const involvementFilters: Record<string, unknown>[] = [
    { hostId: user.id },
  ];
  if (involvedEventIds.length) {
    involvementFilters.push({ id: { in: involvedEventIds } });
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
  const enrichedEvents = await withDerivedEventParticipantIds(events, prisma);

  const eventIds = events.map((event) => event.id);
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(eventIds, prisma);
  const eventDtos = enrichedEvents.map((event) => ({
    ...event,
    officialIds: officialIdsByEventId.get(event.id) ?? [],
  }));
  const matchFilters: Record<string, unknown>[] = [{ officialId: user.id }];
  if (relevantTeamIds.length) {
    matchFilters.push(
      { team1Id: { in: relevantTeamIds } },
      { team2Id: { in: relevantTeamIds } },
      { teamOfficialId: { in: relevantTeamIds } },
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
    ...eventDtos.flatMap((event) => event.teamIds),
    ...matches.flatMap((match) => [match.team1Id, match.team2Id, match.teamOfficialId]),
  ]);

  const [fields, teams] = await Promise.all([
    fieldIds.length
      ? prisma.fields.findMany({
          where: { id: { in: fieldIds } },
          orderBy: [{ createdAt: 'asc' }, { name: 'asc' }, { id: 'asc' }],
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
    events: withLegacyList(eventDtos),
    matches: withLegacyList(matches),
    fields: withLegacyList(fields),
    teams: withLegacyList(teams as Record<string, any>[]),
  });
}
