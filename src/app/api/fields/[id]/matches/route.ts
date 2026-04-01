import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const parseBooleanQueryParam = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = req.nextUrl.searchParams;
  const start = parseDateInput(search.get('start'));
  const end = parseDateInput(search.get('end'));
  const rentalOverlapOnly = parseBooleanQueryParam(search.get('rentalOverlapOnly'));
  const rangeWhere = (() => {
    if (start && end) {
      return {
        AND: [
          { start: { lte: end } },
          {
            OR: [
              { end: null },
              { end: { gte: start } },
            ],
          },
        ],
      };
    }
    if (start) {
      return {
        OR: [
          { end: null },
          { end: { gte: start } },
        ],
      };
    }
    if (end) {
      return { start: { lte: end } };
    }
    return {};
  })();

  const matches = await prisma.matches.findMany({
    where: {
      fieldId: id,
      ...rangeWhere,
    },
    orderBy: { start: 'asc' },
    ...(rentalOverlapOnly
      ? {
        select: {
          id: true,
          start: true,
          end: true,
          eventId: true,
          fieldId: true,
          team1Id: true,
          team2Id: true,
          teamOfficialId: true,
          officialId: true,
          officialIds: true,
          locked: true,
          team1Seed: true,
          team2Seed: true,
          losersBracket: true,
          matchId: true,
          team1Points: true,
          team2Points: true,
          setResults: true,
          previousLeftId: true,
          previousRightId: true,
          winnerNextMatchId: true,
          loserNextMatchId: true,
        },
      }
      : {}),
  });

  const eventIds = Array.from(
    new Set(
      matches
        .map((match) => (typeof match.eventId === 'string' ? match.eventId : ''))
        .filter((eventId) => eventId.length > 0),
    ),
  );

  if (!eventIds.length) {
    return NextResponse.json({ matches: withLegacyList(matches) }, { status: 200 });
  }

  const visibleEvents = await prisma.events.findMany({
    where: {
      id: { in: eventIds },
      NOT: { state: 'TEMPLATE' },
    },
    select: { id: true },
  });
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const filteredMatches = matches.filter((match) => {
    const eventId = typeof match.eventId === 'string' ? match.eventId : '';
    return !eventId || visibleEventIds.has(eventId);
  });

  return NextResponse.json({ matches: withLegacyList(filteredMatches) }, { status: 200 });
}
