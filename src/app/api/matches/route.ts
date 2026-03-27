import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const normalizeIds = (value: string | null): string[] =>
  Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const eventIds = normalizeIds(params.get('eventIds'));
  if (eventIds.length === 0) {
    return NextResponse.json(
      { error: 'eventIds query parameter is required' },
      { status: 400 },
    );
  }

  const fieldIds = normalizeIds(params.get('fieldIds'));
  const start = parseDateInput(params.get('start'));
  const end = parseDateInput(params.get('end'));

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
      eventId: { in: eventIds },
      ...(fieldIds.length > 0 ? { fieldId: { in: fieldIds } } : {}),
      ...rangeWhere,
    },
    orderBy: { start: 'asc' },
  });

  const visibleEvents = await prisma.events.findMany({
    where: {
      id: { in: eventIds },
      NOT: { state: 'TEMPLATE' },
    },
    select: { id: true },
  });
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const filteredMatches = matches.filter((match) => {
    const matchEventId = typeof match.eventId === 'string' ? match.eventId : '';
    return matchEventId.length > 0 && visibleEventIds.has(matchEventId);
  });

  return NextResponse.json({ matches: withLegacyList(filteredMatches) }, { status: 200 });
}
