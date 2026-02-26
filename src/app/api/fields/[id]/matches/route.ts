import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = req.nextUrl.searchParams;
  const start = parseDateInput(search.get('start'));
  const end = parseDateInput(search.get('end'));

  const matches = await prisma.matches.findMany({
    where: {
      fieldId: id,
      ...(start ? { start: { gte: start } } : {}),
      ...(end ? { end: { lte: end } } : {}),
    },
    orderBy: { start: 'asc' },
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
