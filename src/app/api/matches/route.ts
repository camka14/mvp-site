import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput } from '@/server/requestParsing';
import { serializeMatchRecordsLegacy } from '@/server/matches/instantPayloads';
import { getVisibleEventIds } from '@/server/eventVisibility';

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

  const eventAccessRows = await prisma.events.findMany({
    where: {
      id: { in: eventIds },
      archivedAt: null,
    },
    select: {
      id: true,
      state: true,
      archivedAt: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  const visibleEventIds = await getVisibleEventIds(req, eventAccessRows);
  if (!visibleEventIds.size) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const matches = await prisma.matches.findMany({
    where: {
      eventId: { in: Array.from(visibleEventIds) },
      ...(fieldIds.length > 0 ? { fieldId: { in: fieldIds } } : {}),
      ...rangeWhere,
    },
    orderBy: { start: 'asc' },
  });

  return NextResponse.json({ matches: serializeMatchRecordsLegacy(matches) }, { status: 200 });
}
