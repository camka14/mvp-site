import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import { serializeMatchRecordsLegacy } from '@/server/matches/instantPayloads';
import {
  getScheduleTeamsDelegate,
  loadProfileScheduleScope,
  uniqueScheduleIds,
} from '@/server/profile/scheduleScope';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PROFILE_SCHEDULE_PAST_DAYS = 90;
export const PROFILE_SCHEDULE_FUTURE_DAYS = 366;
export const PROFILE_SCHEDULE_MAX_WINDOW_DAYS = 457;
const PROFILE_SCHEDULE_DEFAULT_LIMIT = 200;
const PROFILE_SCHEDULE_MAX_LIMIT = 200;
const PROFILE_SCHEDULE_MAX_MATCHES_PER_PAGE = 5_000;

type ScheduleCursor = {
  start: Date;
  id: string;
  windowFrom: Date;
  windowTo: Date;
};

const encodeScheduleCursor = (
  event: { start: Date; id: string },
  window: { from: Date; to: Date },
): string => (
  Buffer.from(JSON.stringify({
    start: event.start.toISOString(),
    id: event.id,
    windowFrom: window.from.toISOString(),
    windowTo: window.to.toISOString(),
  }), 'utf8').toString('base64url')
);

const decodeScheduleCursor = (value: string | null): ScheduleCursor | null | undefined => {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      start?: unknown;
      id?: unknown;
      windowFrom?: unknown;
      windowTo?: unknown;
    };
    const start = new Date(String(decoded.start ?? ''));
    const windowFrom = new Date(String(decoded.windowFrom ?? ''));
    const windowTo = new Date(String(decoded.windowTo ?? ''));
    const id = typeof decoded.id === 'string' ? decoded.id.trim() : '';
    if (
      Number.isNaN(start.getTime())
      || Number.isNaN(windowFrom.getTime())
      || Number.isNaN(windowTo.getTime())
      || !id
    ) return undefined;
    return { start, id, windowFrom, windowTo };
  } catch {
    return undefined;
  }
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;

  const cursor = decodeScheduleCursor(params.get('cursor'));
  if (cursor === undefined) {
    return NextResponse.json({ error: 'Invalid schedule cursor' }, { status: 400 });
  }
  const now = new Date();
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const parsedFrom = parseDateInput(rawFrom);
  const parsedTo = parseDateInput(rawTo);
  if ((rawFrom && !parsedFrom) || (rawTo && !parsedTo)) {
    return NextResponse.json({ error: 'Invalid schedule date window' }, { status: 400 });
  }
  const from = parsedFrom ?? cursor?.windowFrom ?? new Date(now.getTime() - PROFILE_SCHEDULE_PAST_DAYS * DAY_MS);
  const to = parsedTo ?? cursor?.windowTo ?? new Date(now.getTime() + PROFILE_SCHEDULE_FUTURE_DAYS * DAY_MS);
  if (to < from || to.getTime() - from.getTime() > PROFILE_SCHEDULE_MAX_WINDOW_DAYS * DAY_MS) {
    return NextResponse.json({ error: 'Schedule date window is too large or reversed' }, { status: 400 });
  }
  if (
    cursor
    && (
      cursor.windowFrom.getTime() !== from.getTime()
      || cursor.windowTo.getTime() !== to.getTime()
    )
  ) {
    return NextResponse.json({ error: 'Schedule cursor does not match the requested date window' }, { status: 400 });
  }
  const rawLimit = Number(params.get('limit') || String(PROFILE_SCHEDULE_DEFAULT_LIMIT));
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(PROFILE_SCHEDULE_MAX_LIMIT, Math.round(rawLimit)))
    : PROFILE_SCHEDULE_DEFAULT_LIMIT;

  const scheduleScope = await loadProfileScheduleScope(prisma, session.userId);
  if (!scheduleScope) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const { userId, relevantTeamIds, involvementFilters } = scheduleScope;
  const teamsDelegate = getScheduleTeamsDelegate(prisma);

  const where: Record<string, unknown> = {
    NOT: { state: 'TEMPLATE' },
    OR: involvementFilters,
  };

  const dateConditions: Record<string, unknown>[] = [
    {
      OR: [
        { noFixedEndDateTime: true },
        { end: null },
        { end: { gte: from } },
      ],
    },
    { start: { lte: to } },
  ];
  if (cursor) {
    dateConditions.push({
      OR: [
        { start: { gt: cursor.start } },
        { start: cursor.start, id: { gt: cursor.id } },
      ],
    });
  }
  where.AND = dateConditions;

  const eventRows = await prisma.events.findMany({
    where,
    take: limit + 1,
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
  });
  const hasMore = eventRows.length > limit;
  const events = hasMore ? eventRows.slice(0, limit) : eventRows;
  const lastEvent = events[events.length - 1];
  const nextCursor = hasMore && lastEvent ? encodeScheduleCursor(lastEvent, { from, to }) : null;
  const enrichedEvents = await withDerivedEventParticipantIds(events, prisma);

  const eventIds = events.map((event) => event.id);
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(eventIds, prisma);
  const eventDtos = enrichedEvents.map((event) => ({
    ...event,
    officialIds: officialIdsByEventId.get(event.id) ?? [],
  }));
  const matchFilters: Record<string, unknown>[] = [{ officialId: userId }];
  if (relevantTeamIds.length) {
    matchFilters.push(
      { team1Id: { in: relevantTeamIds } },
      { team2Id: { in: relevantTeamIds } },
      { teamOfficialId: { in: relevantTeamIds } },
    );
  }

  const matchRows = eventIds.length
    ? await prisma.matches.findMany({
        where: {
          eventId: { in: eventIds },
          OR: matchFilters,
          AND: [
            {
              OR: [
                {
                  start: { lte: to },
                  AND: [
                    {
                      OR: [
                        { end: { gte: from } },
                        { end: null, start: { gte: from } },
                      ],
                    },
                  ],
                },
                {
                  start: null,
                  actualStart: { gte: from, lte: to },
                },
              ],
            },
          ],
        },
        take: PROFILE_SCHEDULE_MAX_MATCHES_PER_PAGE + 1,
        orderBy: [{ start: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
      })
    : [];
  if (matchRows.length > PROFILE_SCHEDULE_MAX_MATCHES_PER_PAGE) {
    return NextResponse.json({
      error: 'Schedule page contains too many matches for one response. Narrow the requested date window.',
      code: 'SCHEDULE_MATCH_WINDOW_TOO_LARGE',
    }, { status: 413 });
  }
  const matches = matchRows;

  const fieldIds = uniqueScheduleIds([
    ...events.flatMap((event) => (Array.isArray(event.fieldIds) ? event.fieldIds : [])),
    ...matches.map((match) => match.fieldId),
  ]);

  const relatedTeamIds = uniqueScheduleIds([
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
    matches: serializeMatchRecordsLegacy(matches),
    fields: withLegacyList(fields),
    teams: withLegacyList(teams as Record<string, any>[]),
    pagination: {
      limit,
      hasMore,
      nextCursor,
      isComplete: !hasMore,
      windowFrom: from.toISOString(),
      windowTo: to.toISOString(),
    },
  });
}
