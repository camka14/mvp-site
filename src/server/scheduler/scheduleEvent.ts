import { EventBuilder } from './EventBuilder';
import { Division, League, Match, Tournament, TIMES, MINUTE_MS, SchedulerContext } from './types';

export type ScheduleRequest = {
  event: League | Tournament;
  participantCount?: number;
};

export type ScheduleResult = {
  preview?: boolean;
  event: League | Tournament;
  matches: Match[];
};

export class ScheduleError extends Error {}

const isLeague = (event: League | Tournament): event is League => {
  return event instanceof League || event.eventType === 'LEAGUE';
};

const OPEN_ENDED_WEEKS = 52;

const isOpenEndedSchedule = (event: League | Tournament): boolean => {
  if (typeof event.noFixedEndDateTime === 'boolean') {
    return event.noFixedEndDateTime;
  }
  return event.start.getTime() === event.end.getTime();
};

const extendOpenEndedWindow = (event: League | Tournament): void => {
  const baseEndMs = Math.max(event.start.getTime(), event.end.getTime());
  event.end = new Date(baseEndMs + OPEN_ENDED_WEEKS * 7 * 24 * 60 * MINUTE_MS);
};

export const scheduleEvent = (request: ScheduleRequest, context: SchedulerContext): ScheduleResult => {
  const { event } = request;
  if (typeof request.participantCount === 'number' && request.participantCount > 0) {
    event.maxParticipants = request.participantCount;
  }

  const openEndedSchedule = isOpenEndedSchedule(event);
  if (!openEndedSchedule && event.end.getTime() <= event.start.getTime()) {
    throw new ScheduleError('End date/time must be after start date/time when "No fixed end date/time" is disabled.');
  }
  if (openEndedSchedule) {
    extendOpenEndedWindow(event);
  }

  prepareScheduleWindow(event, openEndedSchedule);

  if (isLeague(event)) {
    return buildLeagueSchedule(event, context, openEndedSchedule);
  }

  return buildTournamentSchedule(event, context);
};

const buildLeagueSchedule = (
  league: League,
  context: SchedulerContext,
  openEndedSchedule: boolean,
): ScheduleResult => {
  if (!league.timeSlots.length) {
    throw new ScheduleError(describeScheduleFailure(league, league.maxParticipants));
  }
  let updated: League | null = null;
  let extensionAttempt = 0;
  const maxExtensions = 3;
  const baseTeams = { ...league.teams };

  while (!updated) {
    // Retry attempts must start from the original roster. Placeholder teams
    // are synthetic and should not leak into later attempts.
    league.teams = { ...baseTeams };
    for (const team of Object.values(league.teams)) {
      team.matches = [];
    }

    const builder = new EventBuilder(league, context);
    try {
      const scheduled = builder.buildSchedule();
      if (!(scheduled instanceof League)) {
        throw new ScheduleError('Builder returned unexpected event type');
      }
      updated = scheduled;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      context.error(`schedule_event: scheduling failed (${errMsg}), attempt ${extensionAttempt + 1}`);
      if (errMsg.toLowerCase().includes('no fields')) {
        // Misconfiguration: surface this as a 4xx instead of a 500.
        throw new ScheduleError(errMsg);
      }
      if (openEndedSchedule && extensionAttempt < maxExtensions) {
        extensionAttempt += 1;
        const extraWeeks = Math.max(2, extensionAttempt * 2);
        league.end = new Date(league.end.getTime() + extraWeeks * 7 * 24 * 60 * MINUTE_MS);
        context.log(`schedule_event: extending season end to ${league.end.toISOString()} for retry`);
        continue;
      }
      // Build the failure summary from the original roster, not synthetic
      // playoff placeholders created during the failed attempt.
      league.teams = { ...baseTeams };
      for (const team of Object.values(league.teams)) {
        team.matches = [];
      }
      const baselineTeamCount = Object.keys(baseTeams).length;
      const message = describeScheduleFailure(
        league,
        Math.max(league.maxParticipants ?? 0, baselineTeamCount),
      );
      throw new ScheduleError(message);
    }
  }

  const latestEnd = latestMatchEnd(Object.values(updated.matches));
  if (latestEnd) {
    updated.end = latestEnd;
  }

  return {
    preview: false,
    event: updated,
    matches: Object.values(updated.matches),
  };
};

const buildTournamentSchedule = (tournament: Tournament, context: SchedulerContext): ScheduleResult => {
  const builder = new EventBuilder(tournament, context);
  const scheduled = builder.buildSchedule();
  if (!(scheduled instanceof Tournament)) {
    throw new ScheduleError('Builder returned unexpected event type');
  }
  const latestEnd = latestMatchEnd(Object.values(scheduled.matches));
  if (latestEnd) {
    scheduled.end = latestEnd;
  }
  return {
    preview: false,
    event: scheduled,
    matches: Object.values(scheduled.matches),
  };
};

const latestMatchEnd = (matches: Match[]): Date | null => {
  let latest: Date | null = null;
  for (const match of matches) {
    if (match.end && (!latest || match.end.getTime() > latest.getTime())) {
      latest = match.end;
    }
  }
  return latest;
};

const projectedDivisionTeamCounts = (event: League, fallbackTotal: number = 0): Map<string, number> => {
  const participantsByDivision = new Map<string, number>();
  for (const team of Object.values(event.teams)) {
    const divisionId = team.division?.id ?? event.divisions[0]?.id ?? 'default';
    participantsByDivision.set(divisionId, (participantsByDivision.get(divisionId) ?? 0) + 1);
  }

  const configuredDivisions = event.divisions.length ? event.divisions : [new Division('default', 'Default')];
  const divisionFallbackCapacity = event.maxParticipants && event.maxParticipants > 0
    ? Math.ceil(event.maxParticipants / Math.max(configuredDivisions.length, 1))
    : 0;

  const byDivision = new Map<string, number>();
  for (const division of configuredDivisions) {
    const currentCount = participantsByDivision.get(division.id) ?? 0;
    const configuredCapacity = typeof division.maxParticipants === 'number' && Number.isFinite(division.maxParticipants)
      ? Math.max(0, Math.trunc(division.maxParticipants))
      : divisionFallbackCapacity;
    byDivision.set(division.id, Math.max(currentCount, configuredCapacity));
    participantsByDivision.delete(division.id);
  }

  for (const [divisionId, count] of participantsByDivision.entries()) {
    byDivision.set(divisionId, Math.max(0, Math.trunc(count)));
  }

  if (!byDivision.size && fallbackTotal > 0) {
    byDivision.set(configuredDivisions[0].id, Math.max(0, Math.trunc(fallbackTotal)));
  }

  return byDivision;
};

const resolveDivisionPlayoffTeamCount = (
  event: League,
  division: Division | undefined,
  teamCount: number,
): number => {
  if (teamCount < 2) {
    return 0;
  }
  const configuredDivisionCount = typeof division?.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
    ? Math.max(0, Math.trunc(division.playoffTeamCount))
    : null;
  const configuredEventCount = typeof event.playoffTeamCount === 'number' && Number.isFinite(event.playoffTeamCount)
    ? Math.max(0, Math.trunc(event.playoffTeamCount))
    : 0;
  const configured = configuredDivisionCount ?? configuredEventCount;
  const fallback = configured > 0 ? configured : teamCount;
  return Math.min(fallback, teamCount);
};

const describeScheduleFailure = (event: League, placeholderCount?: number): string => {
  let teamCount = Object.keys(event.teams).length;
  if (teamCount < 2 && placeholderCount) {
    teamCount = placeholderCount;
  }
  const totalMatches = estimateLeagueMatches(event, teamCount);

  let matchMinutes = 60;
  let bufferMinutes = 5;
  if (event.usesSets && event.setDurationMinutes && event.setsPerMatch) {
    matchMinutes = event.setDurationMinutes * event.setsPerMatch;
    bufferMinutes = 5 * Math.max(event.setsPerMatch, 1);
  } else if (event.matchDurationMinutes) {
    matchMinutes = event.matchDurationMinutes;
  }

  const minutesPerMatch = matchMinutes + bufferMinutes;
  const weeklySlotMinutesTotal = weeklySlotMinutes(event.timeSlots);
  const weeklyHoursAvailable = weeklySlotMinutesTotal / 60;
  const weeklyMatchesCapacity = minutesPerMatch ? Math.floor(weeklySlotMinutesTotal / minutesPerMatch) : 0;

  const totalSlotMinutes = calculateSlotMinutes(event);
  const totalHoursAvailable = totalSlotMinutes / 60;
  const totalMatchesCapacity = minutesPerMatch ? Math.floor(totalSlotMinutes / minutesPerMatch) : 0;

  if (!totalSlotMinutes) {
    return 'Unable to schedule league because no recurring time slots are configured. Add weekly field availability to continue.';
  }

  return [
    'Unable to schedule league with the provided weekly time slots.',
    `Approximate matches needed: ${totalMatches}.`,
    `Approximate weekly capacity: ${weeklyMatchesCapacity} matches (~${weeklyHoursAvailable.toFixed(1)} hours/week).`,
    `Approximate total capacity in schedule window: ${totalMatchesCapacity} matches (~${totalHoursAvailable.toFixed(1)} hours).`,
    'Add more weekly slots, extend the season, or reduce games per opponent/playoff teams to create a schedule.',
  ].join(' ');
};

const calculateSlotMinutes = (event: League): number => {
  if (!event.timeSlots.length) return 0;
  const start = event.start;
  const end = event.end;
  if (start.getTime() >= end.getTime()) return 0;

  let totalMinutes = 0;
  let weekIndex = 0;
  while (start.getTime() + weekIndex * 7 * 24 * 60 * MINUTE_MS <= end.getTime()) {
    const reference = new Date(start.getTime() + weekIndex * 7 * 24 * 60 * MINUTE_MS);
    for (const slot of event.timeSlots) {
      const [slotStart, slotEnd] = slot.asDateRange(reference);
      if (slotEnd.getTime() <= start.getTime() || slotStart.getTime() >= end.getTime()) continue;
      const windowStart = slotStart.getTime() < start.getTime() ? start : slotStart;
      const windowEnd = slotEnd.getTime() > end.getTime() ? end : slotEnd;
      if (windowEnd.getTime() <= windowStart.getTime()) continue;
      totalMinutes += Math.floor((windowEnd.getTime() - windowStart.getTime()) / MINUTE_MS);
    }
    weekIndex += 1;
  }
  return totalMinutes;
};

const prepareScheduleWindow = (event: Tournament | League, allowExtension: boolean): void => {
  if (!allowExtension) return;
  if (!event.timeSlots.length) return;
  const expectedTeams = projectedTeamCount(event);
  const weeklyMinutes = weeklySlotMinutes(event.timeSlots);
  if (weeklyMinutes <= 0) return;
  const matchMinutes = estimatedMatchMinutes(event, expectedTeams);
  if (matchMinutes <= 0) return;
  const weeks = Math.max(Math.ceil(matchMinutes / weeklyMinutes), 1);
  const scheduleSpan = (weeks + 1) * 7 * 24 * 60 * MINUTE_MS;
  if (event.end.getTime() <= event.start.getTime() || event.end.getTime() - event.start.getTime() < scheduleSpan) {
    event.end = new Date(event.start.getTime() + scheduleSpan);
  }
};

const projectedTeamCount = (event: Tournament | League): number => {
  if (isLeague(event) && !event.singleDivision && event.divisions.length > 0) {
    const projectedByDivision = projectedDivisionTeamCounts(event, event.maxParticipants || 0);
    const total = Array.from(projectedByDivision.values()).reduce((sum, count) => sum + Math.max(0, count), 0);
    return Math.max(total, 2);
  }
  let teamCount = Object.keys(event.teams).length;
  const maxParticipants = event.maxParticipants || 0;
  if (maxParticipants > teamCount) teamCount = maxParticipants;
  return Math.max(teamCount, 2);
};

const weeklySlotMinutes = (slots: { startTimeMinutes?: number; endTimeMinutes?: number }[]): number => {
  let total = 0;
  for (const slot of slots) {
    const start = slot.startTimeMinutes ?? 0;
    const end = slot.endTimeMinutes ?? 0;
    if (end > start) total += end - start;
  }
  return total;
};

const estimatedMatchMinutes = (event: Tournament | League, teamCount: number): number => {
  const totalMatches = estimateTotalMatches(event, teamCount);
  if (totalMatches <= 0) return 0;
  const minutesPerMatch = matchMinutesWithBuffer(event);
  return totalMatches * minutesPerMatch;
};

const estimateTotalMatches = (event: Tournament | League, teamCount: number): number => {
  if (isLeague(event)) {
    return estimateLeagueMatches(event, teamCount);
  }
  return estimateTournamentMatches(event, teamCount);
};

const estimateLeagueMatches = (event: League, teamCount: number): number => {
  const gamesPerOpponent = event.gamesPerOpponent || 1;
  if (event.singleDivision || event.divisions.length === 0) {
    let regularMatches = 0;
    if (teamCount > 1) {
      regularMatches = Math.floor((teamCount * (teamCount - 1) / 2) * gamesPerOpponent);
    }
    const playoffCount = event.includePlayoffs ? resolveDivisionPlayoffTeamCount(event, undefined, teamCount) : 0;
    const playoffMatches = playoffCount >= 2 ? tournamentMatchCount(playoffCount, Boolean(event.doubleElimination)) : 0;
    return regularMatches + playoffMatches;
  }

  const projectedByDivision = projectedDivisionTeamCounts(event, teamCount);
  const divisionLookup = new Map(event.divisions.map((division) => [division.id, division]));
  let regularMatches = 0;
  let playoffMatches = 0;
  for (const [divisionId, divisionTeamCount] of projectedByDivision.entries()) {
    if (divisionTeamCount < 2) {
      continue;
    }
    regularMatches += Math.floor((divisionTeamCount * (divisionTeamCount - 1) / 2) * gamesPerOpponent);
    if (!event.includePlayoffs) {
      continue;
    }
    const playoffCount = resolveDivisionPlayoffTeamCount(
      event,
      divisionLookup.get(divisionId),
      divisionTeamCount,
    );
    if (playoffCount >= 2) {
      playoffMatches += tournamentMatchCount(playoffCount, Boolean(event.doubleElimination));
    }
  }
  return regularMatches + playoffMatches;
};

const estimateTournamentMatches = (event: Tournament, teamCount: number): number => {
  const doubleElimination = event.doubleElimination;
  const divisionCounts: Record<string, number> = {};
  let processed = 0;
  for (const team of Object.values(event.teams)) {
    const divisionId = team.division?.id ?? 'default';
    divisionCounts[divisionId] = (divisionCounts[divisionId] ?? 0) + 1;
    processed += 1;
  }
  let totalMatches = 0;
  for (const count of Object.values(divisionCounts)) {
    totalMatches += tournamentMatchCount(count, doubleElimination);
  }
  const remaining = Math.max(teamCount - processed, 0);
  if (remaining) totalMatches += tournamentMatchCount(remaining, doubleElimination);
  return totalMatches;
};

const tournamentMatchCount = (teamCount: number, doubleElimination: boolean): number => {
  if (teamCount < 2) return 0;
  if (doubleElimination) return Math.max(2 * teamCount - 1, 0);
  return Math.max(teamCount - 1, 0);
};

const matchMinutesWithBuffer = (event: Tournament | League): number => {
  const usesSets = event.usesSets;
  const setMinutes = event.setDurationMinutes;
  let setsPerMatch = event.setsPerMatch ?? (event as Tournament).winnerSetCount ?? null;
  if (usesSets && setMinutes && setsPerMatch) {
    const matchMinutes = setMinutes * setsPerMatch;
    const bufferMinutes = 5 * Math.max(setsPerMatch, 1);
    return matchMinutes + bufferMinutes;
  }
  const matchDuration = event.matchDurationMinutes;
  const matchMinutes = matchDuration && matchDuration > 0 ? matchDuration : 60;
  return matchMinutes + 5;
};
