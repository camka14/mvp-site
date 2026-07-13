import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { loadProfileScheduleScope } from '@/server/profile/scheduleScope';

export const dynamic = 'force-dynamic';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NEXT_ACTION_MAX_EVENT_CANDIDATES = 500;
const NEXT_ACTION_MAX_MATCH_CANDIDATES = 200;
const TERMINAL_EVENT_STATES = new Set(['CANCELLED', 'CANCELED', 'DELETED', 'ARCHIVED', 'TEMPLATE']);
const TERMINAL_MATCH_STATUSES = new Set([
  'COMPLETE',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
  'FORFEIT',
  'SUSPENDED',
]);
const TERMINAL_RESULT_STATUSES = new Set([
  'FINAL',
  'COMPLETE',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
  'FORFEIT',
]);

type NextActionEvent = {
  id: string;
  name: string;
  imageId: string | null;
  start: Date;
  end: Date | null;
  noFixedEndDateTime: boolean;
  state: string | null;
};

type NextActionMatch = {
  id: string;
  eventId: string | null;
  matchId: number;
  start: Date | null;
  end: Date | null;
  status: string | null;
  resultStatus: string | null;
  actualStart: Date | null;
};

const normalizedState = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase();

const isEventNonTerminal = (event: NextActionEvent): boolean => (
  !TERMINAL_EVENT_STATES.has(normalizedState(event.state))
);

const isEventEligible = (event: NextActionEvent, now: Date): boolean => {
  if (!isEventNonTerminal(event)) return false;
  const effectiveEnd = event.noFixedEndDateTime
    ? null
    : event.end && event.end > event.start
      ? event.end
      : new Date(event.start.getTime() + DAY_MS);
  return (effectiveEnd === null || effectiveEnd >= now)
    && event.start <= new Date(now.getTime() + DAY_MS);
};

const isMatchEligible = (match: NextActionMatch, now: Date): boolean => {
  if (
    TERMINAL_MATCH_STATUSES.has(normalizedState(match.status))
    || TERMINAL_RESULT_STATUSES.has(normalizedState(match.resultStatus))
  ) return false;

  if (!match.start) {
    const status = normalizedState(match.status);
    return Boolean(match.actualStart) || status === 'IN_PROGRESS' || status === 'STARTED';
  }

  const effectiveEnd = match.end && match.end > match.start
    ? match.end
    : new Date(match.start.getTime() + HOUR_MS);
  const startsWithinOneHour = match.start >= now && match.start <= new Date(now.getTime() + HOUR_MS);
  const isInScheduledWindow = match.start <= now && effectiveEnd >= now;
  return startsWithinOneHour || isInScheduledWindow;
};

const createEventAction = () => ({ type: 'CREATE_EVENT' as const });

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const scheduleScope = await loadProfileScheduleScope(prisma, session.userId);
  if (!scheduleScope) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - DAY_MS);
  const windowEnd = new Date(now.getTime() + DAY_MS);
  const eventRows = await prisma.events.findMany({
    where: {
      archivedAt: null,
      OR: scheduleScope.involvementFilters,
      start: { lte: windowEnd },
      AND: [
        {
          OR: [
            { state: null },
            { state: { not: 'TEMPLATE' } },
          ],
        },
        {
          OR: [
            { noFixedEndDateTime: true },
            { end: null },
            { end: { gte: now } },
            { start: { gte: windowStart } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      imageId: true,
      start: true,
      end: true,
      noFixedEndDateTime: true,
      state: true,
    },
    take: NEXT_ACTION_MAX_EVENT_CANDIDATES + 1,
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
  }) as NextActionEvent[];
  if (eventRows.length > NEXT_ACTION_MAX_EVENT_CANDIDATES) {
    return NextResponse.json({
      error: 'Too many schedule events overlap the next-action window.',
      code: 'SCHEDULE_NEXT_ACTION_EVENT_LIMIT',
    }, { status: 413 });
  }
  const events = eventRows;

  const matchCarrierEvents = events.filter(isEventNonTerminal);
  const eligibleEvents = matchCarrierEvents.filter((event) => isEventEligible(event, now));
  if (!matchCarrierEvents.length) {
    return NextResponse.json({
      contractVersion: 1,
      generatedAt: now.toISOString(),
      action: createEventAction(),
    });
  }

  const eventById = new Map(matchCarrierEvents.map((event) => [event.id, event]));
  const matchFilters: Record<string, unknown>[] = [{ officialId: scheduleScope.userId }];
  if (scheduleScope.relevantTeamIds.length) {
    matchFilters.push(
      { team1Id: { in: scheduleScope.relevantTeamIds } },
      { team2Id: { in: scheduleScope.relevantTeamIds } },
      { teamOfficialId: { in: scheduleScope.relevantTeamIds } },
    );
  }
  const matchRows = await prisma.matches.findMany({
    where: {
      eventId: { in: matchCarrierEvents.map((event) => event.id) },
      OR: matchFilters,
      AND: [
        {
          OR: [
            { status: null },
            { status: { notIn: Array.from(TERMINAL_MATCH_STATUSES) } },
          ],
        },
        {
          OR: [
            { resultStatus: null },
            { resultStatus: { notIn: Array.from(TERMINAL_RESULT_STATUSES) } },
          ],
        },
        {
          OR: [
            {
              start: {
                gte: new Date(now.getTime() - HOUR_MS),
                lte: new Date(now.getTime() + HOUR_MS),
              },
            },
            { end: { gte: now }, start: { lte: new Date(now.getTime() + HOUR_MS) } },
            {
              start: null,
              OR: [
                { actualStart: { not: null } },
                { status: { in: ['IN_PROGRESS', 'STARTED'] } },
              ],
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      eventId: true,
      matchId: true,
      start: true,
      end: true,
      status: true,
      resultStatus: true,
      actualStart: true,
    },
    take: NEXT_ACTION_MAX_MATCH_CANDIDATES + 1,
    orderBy: [{ start: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
  }) as NextActionMatch[];
  if (matchRows.length > NEXT_ACTION_MAX_MATCH_CANDIDATES) {
    return NextResponse.json({
      error: 'Too many matches overlap the next-action window.',
      code: 'SCHEDULE_NEXT_ACTION_MATCH_LIMIT',
    }, { status: 413 });
  }
  const matches = matchRows;

  const matchCandidate = matches
    .filter((match) => Boolean(match.eventId && eventById.has(match.eventId)))
    .filter((match) => isMatchEligible(match, now))
    .sort((left, right) => {
      const leftTime = left.start?.getTime() ?? now.getTime();
      const rightTime = right.start?.getTime() ?? now.getTime();
      return leftTime - rightTime || left.matchId - right.matchId || left.id.localeCompare(right.id);
    })[0];
  if (matchCandidate?.eventId) {
    const event = eventById.get(matchCandidate.eventId);
    if (event) {
      return NextResponse.json({
        contractVersion: 1,
        generatedAt: now.toISOString(),
        action: {
          type: 'MATCH',
          eventId: event.id,
          matchId: matchCandidate.id,
          eventName: event.name.trim() || 'Event',
          eventImageId: event.imageId ?? '',
        },
      });
    }
  }

  const eventCandidate = eligibleEvents.sort((left, right) => {
    const leftTime = Math.max(left.start.getTime(), now.getTime());
    const rightTime = Math.max(right.start.getTime(), now.getTime());
    return leftTime - rightTime || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  })[0];

  return NextResponse.json({
    contractVersion: 1,
    generatedAt: now.toISOString(),
    action: eventCandidate
      ? {
          type: 'EVENT',
          eventId: eventCandidate.id,
          eventName: eventCandidate.name.trim() || 'Event',
          eventImageId: eventCandidate.imageId ?? '',
        }
      : createEventAction(),
  });
}
