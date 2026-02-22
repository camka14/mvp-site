import { Schedule } from './Schedule';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  Tournament,
  UserData,
} from './types';

type SchedulerEvent = League | Tournament;

const MIN_SCHEDULE_DURATION_MS = 5 * MINUTE_MS;

export type LockedScheduleWarning = {
  code: 'LOCKED_MATCH_OUTSIDE_WINDOW';
  message: string;
  matchIds: string[];
};

export type LockedPreservingRescheduleResult = {
  event: SchedulerEvent;
  matches: Match[];
  warnings: LockedScheduleWarning[];
};

const buildScheduleParticipants = (event: SchedulerEvent): Record<string, Team | UserData> => {
  const participants: Record<string, Team | UserData> = { ...event.teams };
  for (const referee of event.referees) {
    if (!referee.divisions.length) {
      referee.divisions = [...event.divisions];
    }
    participants[referee.id] = referee;
  }
  return participants;
};

const resetScheduleCollections = (event: SchedulerEvent): void => {
  for (const field of Object.values(event.fields)) {
    field.matches = [];
  }
  for (const team of Object.values(event.teams)) {
    team.matches = [];
  }
  for (const referee of event.referees) {
    referee.matches = [];
  }
};

const attachMatchToParticipants = (match: Match): void => {
  for (const participant of match.getParticipants()) {
    if (!participant.matches) {
      participant.matches = [];
    }
    if (!participant.matches.includes(match)) {
      participant.matches.push(match);
    }
  }
};

const attachLockedMatchToField = (event: SchedulerEvent, match: Match): void => {
  if (!match.field) return;
  const field = event.fields[match.field.id] ?? null;
  match.field = field;
  if (!field) return;
  if (!field.matches.includes(match)) {
    field.matches.push(match);
  }
};

const compareMatches = (left: Match, right: Match): number => {
  const leftMatchId = left.matchId ?? Number.MAX_SAFE_INTEGER;
  const rightMatchId = right.matchId ?? Number.MAX_SAFE_INTEGER;
  if (leftMatchId !== rightMatchId) {
    return leftMatchId - rightMatchId;
  }
  const startDiff = left.start.getTime() - right.start.getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = left.end.getTime() - right.end.getTime();
  if (endDiff !== 0) return endDiff;
  return left.id.localeCompare(right.id);
};

const durationForReschedule = (match: Match): number => {
  const durationMs = match.end.getTime() - match.start.getTime();
  if (durationMs >= MIN_SCHEDULE_DURATION_MS) {
    return durationMs;
  }
  return MIN_SCHEDULE_DURATION_MS;
};

const normalizeDayOfWeek = (date: Date): number => (date.getDay() + 6) % 7;

const minuteOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const startOfDay = (date: Date): Date => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const slotAllowsField = (slot: { field?: string | null }, fieldId: string): boolean => {
  if (!slot.field) return true;
  return slot.field === fieldId;
};

const slotAllowsDivision = (slot: { divisions?: Division[] }, divisionId: string): boolean => {
  if (!Array.isArray(slot.divisions) || !slot.divisions.length) {
    return true;
  }
  return slot.divisions.some((division) => division.id === divisionId);
};

const slotAllowsDate = (
  slot: { startDate: Date; endDate: Date | null },
  matchStart: Date,
): boolean => {
  const matchDayMs = startOfDay(matchStart).getTime();
  const slotStartMs = startOfDay(slot.startDate).getTime();
  if (matchDayMs < slotStartMs) return false;
  if (!slot.endDate) return true;
  const slotEndMs = startOfDay(slot.endDate).getTime();
  return matchDayMs <= slotEndMs;
};

const slotAllowsTime = (
  slot: { dayOfWeek: number; startTimeMinutes: number; endTimeMinutes: number },
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  if (normalizeDayOfWeek(matchStart) !== slot.dayOfWeek) {
    return false;
  }
  if (startOfDay(matchStart).getTime() !== startOfDay(matchEnd).getTime()) {
    return false;
  }
  const startMinutes = minuteOfDay(matchStart);
  const endMinutes = minuteOfDay(matchEnd);
  return startMinutes >= slot.startTimeMinutes && endMinutes <= slot.endTimeMinutes;
};

const lockedMatchFitsUpdatedWindow = (event: SchedulerEvent, match: Match): boolean => {
  if (match.start.getTime() < event.start.getTime() || match.end.getTime() > event.end.getTime()) {
    return false;
  }
  if (!event.timeSlots.length) {
    return true;
  }
  if (!match.field) {
    return false;
  }
  return event.timeSlots.some((slot) =>
    slotAllowsField(slot, match.field?.id ?? '')
    && slotAllowsDivision(slot, match.division?.id ?? '')
    && slotAllowsDate(slot, match.start)
    && slotAllowsTime(slot, match.start, match.end),
  );
};

const collectWarnings = (event: SchedulerEvent, lockedMatches: Match[]): LockedScheduleWarning[] => {
  if (!lockedMatches.length) return [];
  const outOfWindowIds = lockedMatches
    .filter((match) => !lockedMatchFitsUpdatedWindow(event, match))
    .map((match) => match.id);
  if (!outOfWindowIds.length) {
    return [];
  }
  const subject = outOfWindowIds.length === 1 ? 'Locked match is' : 'Locked matches are';
  const preservedVerb = outOfWindowIds.length === 1 ? 'was' : 'were';
  return [
    {
      code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
      message: `${subject} outside the updated start/time-slot window and ${preservedVerb} preserved.`,
      matchIds: outOfWindowIds,
    },
  ];
};

const latestMatchEnd = (matches: Match[]): Date | null => {
  let latest: Date | null = null;
  for (const match of matches) {
    if (!latest || match.end.getTime() > latest.getTime()) {
      latest = match.end;
    }
  }
  return latest;
};

const dependenciesAreScheduled = (match: Match, pendingIds: Set<string>): boolean => {
  for (const dependency of match.getDependencies()) {
    if (pendingIds.has(dependency.id)) {
      return false;
    }
  }
  return true;
};

export const rescheduleEventMatchesPreservingLocks = (
  event: SchedulerEvent,
): LockedPreservingRescheduleResult => {
  const allMatches = Object.values(event.matches);
  if (!allMatches.length) {
    return { event, matches: [], warnings: [] };
  }

  const lockedMatches = allMatches.filter((match) => match.locked);
  const warnings = collectWarnings(event, lockedMatches);
  resetScheduleCollections(event);

  for (const match of lockedMatches) {
    attachLockedMatchToField(event, match);
    attachMatchToParticipants(match);
  }

  const participants = buildScheduleParticipants(event);
  const schedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
    event.start,
    event.fields,
    participants,
    event.divisions,
    event.start,
    { endTime: event.end, timeSlots: event.timeSlots },
  );

  const unlockedMatches = allMatches
    .filter((match) => !match.locked)
    .sort(compareMatches);
  const unlockedById = new Map(unlockedMatches.map((match) => [match.id, match]));
  const pendingIds = new Set(unlockedMatches.map((match) => match.id));

  for (const match of unlockedMatches) {
    match.unschedule();
  }

  while (pendingIds.size > 0) {
    const readyMatches = unlockedMatches
      .filter((match) => pendingIds.has(match.id) && dependenciesAreScheduled(match, pendingIds))
      .sort(compareMatches);

    const nextBatch = readyMatches.length
      ? readyMatches
      : [unlockedById.get(Array.from(pendingIds.values())[0]) as Match];

    for (const match of nextBatch) {
      schedule.scheduleEvent(match, durationForReschedule(match));
      attachMatchToParticipants(match);
      pendingIds.delete(match.id);
    }
  }

  const latestEnd = latestMatchEnd(allMatches);
  if (latestEnd) {
    event.end = latestEnd;
  }

  return {
    event,
    matches: allMatches.sort(compareMatches),
    warnings,
  };
};
