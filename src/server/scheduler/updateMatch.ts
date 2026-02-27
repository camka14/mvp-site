import { Schedule } from './Schedule';
import {
  Division,
  League,
  Match,
  PlayingField,
  SchedulerContext,
  Team,
  Tournament,
  UserData,
  TIMES,
  MINUTE_MS,
} from './types';

export type MatchUpdate = {
  locked?: boolean;
  team1Points?: number[];
  team2Points?: number[];
  setResults?: number[];
  team1Id?: string | null;
  team2Id?: string | null;
  refereeId?: string | null;
  teamRefereeId?: string | null;
  fieldId?: string | null;
  start?: Date;
  end?: Date;
  side?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  refereeCheckedIn?: boolean;
  matchId?: number | null;
};

export type FinalizeResult = {
  updatedMatch: Match;
  seededTeamIds: string[];
};

const noopContext: SchedulerContext = {
  log: () => {},
  error: () => {},
};

const OPEN_ENDED_RESCHEDULE_WEEKS = 52;

const isOpenEndedSchedule = (event: Tournament | League): boolean => {
  if (typeof event.noFixedEndDateTime === 'boolean') {
    return event.noFixedEndDateTime;
  }
  return event.start.getTime() === event.end.getTime();
};

const resolveRescheduleEndTime = (event: Tournament | League, currentTime: Date): Date => {
  if (!isOpenEndedSchedule(event)) {
    return event.end;
  }
  const baseline = Math.max(event.end.getTime(), currentTime.getTime());
  return new Date(baseline + OPEN_ENDED_RESCHEDULE_WEEKS * 7 * 24 * 60 * MINUTE_MS);
};

export const isScheduleWindowExceededError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('No available time slots remaining for scheduling');
};

const ensureMatchesArray = (participant?: { matches?: Match[] } | null) => {
  if (!participant) return [] as Match[];
  if (!participant.matches) participant.matches = [];
  return participant.matches;
};

const detachMatch = (participant: { matches?: Match[] } | null | undefined, match: Match) => {
  if (!participant?.matches) return;
  participant.matches = participant.matches.filter((existing) => existing.id !== match.id);
};

const getMatchStartMs = (match: Match): number | null => {
  const start = (match as unknown as { start?: Date | null }).start;
  if (!(start instanceof Date)) {
    return null;
  }
  const startMs = start.getTime();
  return Number.isNaN(startMs) ? null : startMs;
};

export const shouldAutoLockMatch = (match: Match, now: Date = new Date()): boolean => {
  if (match.refereeCheckedIn === true) {
    return true;
  }
  const startMs = getMatchStartMs(match);
  if (startMs === null) {
    return false;
  }
  return startMs <= now.getTime();
};

export const applyPersistentAutoLock = (
  match: Match,
  options?: { now?: Date; explicitLockedValue?: boolean | undefined },
): boolean => {
  if (options?.explicitLockedValue === false) {
    return false;
  }
  if (shouldAutoLockMatch(match, options?.now ?? new Date()) && !match.locked) {
    match.locked = true;
    return true;
  }
  return false;
};

export const applyMatchUpdates = (event: Tournament | League, match: Match, update: MatchUpdate) => {
  if (update.matchId !== undefined) {
    match.matchId = update.matchId ?? null;
  }
  if (update.locked !== undefined) {
    match.locked = Boolean(update.locked);
  }
  if (update.team1Points) {
    match.team1Points = [...update.team1Points];
  }
  if (update.team2Points) {
    match.team2Points = [...update.team2Points];
  }
  if (update.setResults) {
    match.setResults = [...update.setResults];
  }
  if (update.start) {
    match.start = update.start;
  }
  if (update.end) {
    match.end = update.end;
  }
  if (update.refereeCheckedIn !== undefined) {
    match.refereeCheckedIn = update.refereeCheckedIn;
  }
  if (update.side !== undefined) {
    match.side = update.side as any;
  }
  if (update.team1Id !== undefined) {
    detachMatch(match.team1, match);
    match.team1 = update.team1Id ? event.teams[update.team1Id] ?? null : null;
    if (match.team1) ensureMatchesArray(match.team1).push(match);
  }
  if (update.team2Id !== undefined) {
    detachMatch(match.team2, match);
    match.team2 = update.team2Id ? event.teams[update.team2Id] ?? null : null;
    if (match.team2) ensureMatchesArray(match.team2).push(match);
  }
  if (update.teamRefereeId !== undefined) {
    detachMatch(match.teamReferee, match);
    match.teamReferee = update.teamRefereeId ? event.teams[update.teamRefereeId] ?? null : null;
    if (match.teamReferee) ensureMatchesArray(match.teamReferee).push(match);
  }
  if (update.refereeId !== undefined) {
    detachMatch(match.referee, match);
    match.referee = update.refereeId
      ? event.referees.find((ref) => ref.id === update.refereeId) ?? null
      : null;
    if (match.referee) ensureMatchesArray(match.referee).push(match);
  }
  if (update.fieldId !== undefined) {
    if (match.field) {
      match.field.deleteEvent(match);
    }
    match.field = update.fieldId ? event.fields[update.fieldId] ?? null : null;
    if (match.field) {
      match.field.addEvent(match);
    }
  }
  if (update.previousLeftId !== undefined) {
    match.previousLeftMatch = update.previousLeftId ? event.matches[update.previousLeftId] ?? null : null;
  }
  if (update.previousRightId !== undefined) {
    match.previousRightMatch = update.previousRightId ? event.matches[update.previousRightId] ?? null : null;
  }
  if (update.winnerNextMatchId !== undefined) {
    match.winnerNextMatch = update.winnerNextMatchId ? event.matches[update.winnerNextMatchId] ?? null : null;
  }
  if (update.loserNextMatchId !== undefined) {
    match.loserNextMatch = update.loserNextMatchId ? event.matches[update.loserNextMatchId] ?? null : null;
  }
};

const attachMatchToParticipants = (match: Match) => {
  for (const participant of match.getParticipants()) {
    const matches = ensureMatchesArray(participant);
    if (!matches.includes(match)) matches.push(match);
  }
};

const syncMatchParticipants = (matches: Iterable<Match>) => {
  for (const match of matches) {
    attachMatchToParticipants(match);
  }
};

const buildScheduleParticipants = (event: Tournament | League): Record<string, Team | UserData> => {
  const participants: Record<string, Team | UserData> = { ...event.teams };
  for (const referee of event.referees) {
    if (!referee.divisions.length) referee.divisions = [...event.divisions];
    participants[referee.id] = referee;
  }
  return participants;
};

const isPlayoffMatch = (match: Match): boolean => {
  return Boolean(match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch);
};

const getUpcomingMatchesInTimeRange = (
  beginning: Date,
  end: Date,
  matches: Record<string, Match>,
  mustBeNextMatch: boolean,
): Match[] => {
  const matchesInRange: Match[] = [];
  for (const match of Object.values(matches)) {
    let matchIsNext = true;
    if (mustBeNextMatch) {
      if (match.previousLeftMatch && !isMatchOver(match.previousLeftMatch)) {
        matchIsNext = false;
      }
      if (match.previousRightMatch && !isMatchOver(match.previousRightMatch)) {
        matchIsNext = false;
      }
    }
    if (match.start >= beginning && match.end <= end && matchIsNext) {
      matchesInRange.push(match);
    }
  }
  matchesInRange.sort((a, b) => a.start.getTime() - b.start.getTime());
  matchesInRange.sort((a, b) => (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime()));
  return matchesInRange;
};

const isMatchOver = (match: Match | null): boolean => {
  if (!match) return false;
  const team1Wins = match.setResults.filter((result) => result === 1).length;
  const team2Wins = match.setResults.filter((result) => result === 2).length;
  const setsToWin = Math.ceil(match.setResults.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
};

const teamsWaitingToStart = (teams: Team[], currentTime: Date): Team[] => {
  const waiting: Team[] = [];
  for (const team of teams) {
    for (const match of team.matches ?? []) {
      if (match.start > currentTime && match.teamReferee !== team) {
        waiting.push(team);
        break;
      }
    }
  }
  return waiting;
};

const isTeamInPreviousMatch = (team: Team, match: Match): boolean => {
  for (const prev of match.getDependencies()) {
    if (prev.team1 === team || prev.team2 === team) {
      return true;
    }
  }
  return false;
};

const reassignTeamReferee = (match: Match, schedule: Schedule<Match, any, any, Division>, currentTime: Date): void => {
  if (!match.division) return;
  if (match.teamReferee && match.teamReferee.matches) {
    match.teamReferee.matches = match.teamReferee.matches.filter((existing) => existing.id !== match.id);
  }
  const freeParticipants = schedule.freeParticipants(match.division, currentTime, match.end);
  const freeTeams = freeParticipants.filter(
    (participant) => participant instanceof Team && participant !== match.team1 && participant !== match.team2,
  ) as Team[];
  for (const freeTeam of freeTeams) {
    if (!isTeamInPreviousMatch(freeTeam, match)) {
      match.teamReferee = freeTeam;
      ensureMatchesArray(freeTeam).push(match);
      return;
    }
  }
};

const reassignUserReferee = (match: Match, schedule: Schedule<Match, any, any, Division>): void => {
  if (!match.division) return;
  if (match.referee && match.referee.matches) {
    match.referee.matches = match.referee.matches.filter((existing) => existing.id !== match.id);
  }
  const freeParticipants = schedule.freeParticipants(match.division, match.start, match.end);
  const freeRefs = freeParticipants.filter((participant) => participant instanceof UserData) as UserData[];
  if (freeRefs.length) {
    match.referee = freeRefs[0];
    ensureMatchesArray(freeRefs[0]).push(match);
  }
};

const unscheduleMatchesOnField = (match: Match, useTeamRefs: boolean): void => {
  if (!match.field) return;
  const matchesOnField = match.field.matches as Match[];
  for (const matchOnField of matchesOnField) {
    if (matchOnField.locked) continue;
    if (matchOnField.start > match.start || (useTeamRefs && !matchOnField.teamReferee)) {
      matchOnField.unschedule();
    }
  }
};

const processMatches = (
  matches: Match[],
  bracketSchedule: Schedule<Match, any, any, Division>,
  updatedMatch: Match,
  tournament: Tournament | League,
  useTeamRefs: boolean,
): void => {
  unscheduleMatchesOnField(updatedMatch, useTeamRefs);
  for (const field of Object.values(tournament.fields)) {
    for (const match of field.matches) {
      if (match.locked) continue;
      if (
        (field === updatedMatch.field && match.start > updatedMatch.start) ||
        (useTeamRefs && !match.teamReferee)
      ) {
        match.unschedule();
      }
      if (match.start >= updatedMatch.end || (useTeamRefs && !match.teamReferee)) {
        match.unschedule();
      }
    }
  }

  for (const match of [...matches].reverse()) {
    if (!match.locked && !match.field) {
      bracketSchedule.scheduleEvent(match, match.team1Points.length * TIMES.SET);
      attachMatchToParticipants(match);
    }
  }
};

const assignMissingTeamReferees = (
  event: Tournament | League,
  schedule: Schedule<Match, any, any, Division>,
  matches: Iterable<Match>,
): void => {
  const teams = Object.values(event.teams);
  const unassigned = [...teams];
  const ordered = Array.from(matches).sort((a, b) => {
    const startDiff = a.start.getTime() - b.start.getTime();
    if (startDiff !== 0) return startDiff;
    const endDiff = a.end.getTime() - b.end.getTime();
    if (endDiff !== 0) return endDiff;
    return (a.field?.id ?? '').localeCompare(b.field?.id ?? '');
  });

  for (const match of ordered) {
    if (match.teamReferee || !(match.team1 && match.team2)) continue;
    if (!match.division) continue;

    const availableTeams = schedule
      .freeParticipants(match.division, match.start, match.end)
      .filter((participant) => participant instanceof Team) as Team[];
    const filtered = availableTeams.filter((team) => team !== match.team1 && team !== match.team2);
    if (!filtered.length) continue;

    let candidate: Team | null = null;
    for (let i = 0; i < unassigned.length; i += 1) {
      const candidateTeam = unassigned[0];
      unassigned.push(unassigned.shift() as Team);
      if (filtered.includes(candidateTeam)) {
        candidate = candidateTeam;
        const idx = unassigned.indexOf(candidateTeam);
        if (idx >= 0) unassigned.splice(idx, 1);
        break;
      }
    }
    if (!candidate) {
      candidate = filtered[0] ?? null;
    }
    if (!candidate) continue;

    match.teamReferee = candidate;
    ensureMatchesArray(candidate).push(match);
  }
};

export const finalizeMatch = (
  event: Tournament | League,
  updatedMatch: Match,
  _context: SchedulerContext = noopContext,
  currentTime: Date,
): FinalizeResult => {
  syncMatchParticipants(Object.values(event.matches));

  const seededTeamIds: string[] = [];

  const teamOne = updatedMatch.team1;
  const teamTwo = updatedMatch.team2;
  if (!teamOne || !teamTwo) {
    return { updatedMatch, seededTeamIds };
  }

  const team1Wins = updatedMatch.setResults.filter((result) => result === 1).length;
  const team2Wins = updatedMatch.setResults.filter((result) => result === 2).length;
  const winner = team1Wins > team2Wins ? teamOne : teamTwo;
  const loser = winner === teamOne ? teamTwo : teamOne;

  updatedMatch.advanceTeams(winner, loser);

  // League schedules are pre-built (regular season and playoffs). Finalizing a result should advance teams without
  // invoking bracket-style rescheduling, which can fail for split-playoff mapping configurations.
  if (event instanceof League) {
    if (event.doTeamsRef && seededTeamIds.length) {
      const participants = buildScheduleParticipants(event);
      const schedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
        event.start,
        event.fields,
        participants,
        event.divisions,
        currentTime,
        { endTime: resolveRescheduleEndTime(event, currentTime), timeSlots: event.timeSlots },
      );
      const playoffMatches = Object.values(event.matches).filter((match) => isPlayoffMatch(match));
      assignMissingTeamReferees(event, schedule, playoffMatches);
    }

    return { updatedMatch, seededTeamIds };
  }

  const participants = buildScheduleParticipants(event);
  const matchesSchedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
    event.start,
    event.fields,
    participants,
    event.divisions,
    currentTime,
    { endTime: resolveRescheduleEndTime(event, currentTime), timeSlots: event.timeSlots },
  );

  const orderedMatches = Object.values(event.matches);
  if (!orderedMatches.length) {
    return { updatedMatch, seededTeamIds };
  }

  const rootMatch = [...orderedMatches].sort((a, b) => (b.matchId ?? 0) - (a.matchId ?? 0))[0];
  const queue: Match[] = [rootMatch];
  const matches: Match[] = [];

  while (queue.length) {
    const match = queue.shift() as Match;
    matches.push(match);

    const prevMatches = match.getMatches();
    for (const prevMatch of prevMatches) {
      if (matches.includes(prevMatch) || queue.includes(prevMatch)) continue;
      if (match.losersBracket && match.losersBracket !== prevMatch.losersBracket) continue;

      queue.push(prevMatch);

      if (prevMatch.losersBracket) {
        const leftLoser = Boolean(prevMatch.previousLeftMatch && prevMatch.previousLeftMatch.losersBracket);
        const rightLoser = Boolean(prevMatch.previousRightMatch && prevMatch.previousRightMatch.losersBracket);
        if (leftLoser !== rightLoser) {
          if (leftLoser && prevMatch.previousLeftMatch) {
            queue.push(prevMatch.previousLeftMatch);
          } else if (prevMatch.previousRightMatch) {
            queue.push(prevMatch.previousRightMatch);
          }
        }
      }
    }
  }

  processMatches(matches, matchesSchedule, updatedMatch, event, event.doTeamsRef);

  const conflicts = matchesSchedule.getParticipantConflicts();
  for (const [participant, conflictMatches] of conflicts.entries()) {
    if (participant instanceof Team) {
      if (!event.doTeamsRef) continue;
      for (const match of conflictMatches) {
        if (participant === match.teamReferee) {
          reassignTeamReferee(match, matchesSchedule, currentTime);
        }
      }
    } else if (participant instanceof UserData) {
      for (const match of conflictMatches) {
        if (match.referee === participant) {
          reassignUserReferee(match, matchesSchedule);
        }
      }
    }
  }

  if (event.doTeamsRef) {
    let matchesInRange: Match[] = [];
    if (updatedMatch.losersBracket) {
      if (updatedMatch.winnerNextMatch) {
        matchesInRange = getUpcomingMatchesInTimeRange(
          updatedMatch.end,
          updatedMatch.winnerNextMatch.start,
          event.matches,
          true,
        );
        for (const match of matchesInRange) {
          if (!match.teamReferee) {
            match.teamReferee = winner;
            ensureMatchesArray(winner).push(match);
            break;
          }
        }
      }
      matchesInRange = getUpcomingMatchesInTimeRange(updatedMatch.end, event.end, event.matches, false);
    } else {
      if (updatedMatch.loserNextMatch) {
        matchesInRange = getUpcomingMatchesInTimeRange(
          updatedMatch.end,
          updatedMatch.loserNextMatch.start,
          event.matches,
          true,
        );
      }
    }

    if (!event.doubleElimination) {
      if (updatedMatch.winnerNextMatch) {
        matchesInRange = [updatedMatch.winnerNextMatch];
      } else {
        matchesInRange = [];
      }
    }

    for (const match of matchesInRange) {
      if (!match.teamReferee) {
        match.teamReferee = loser;
        ensureMatchesArray(loser).push(match);
        break;
      }
    }

    const waitingTeams = teamsWaitingToStart(Object.values(event.teams), currentTime);
    for (const team of waitingTeams) {
      const lastMatch = team.matches[team.matches.length - 1];
      if (!lastMatch) continue;
      const availableMatches = getUpcomingMatchesInTimeRange(currentTime, lastMatch.start, event.matches, true);
      for (const match of availableMatches) {
        if (!match.teamReferee) {
          match.teamReferee = team;
          ensureMatchesArray(team).push(match);
          break;
        }
      }
    }
  }

  return { updatedMatch, seededTeamIds };
};
