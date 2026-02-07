import { Brackets } from './Brackets';
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
} from './types';

export type MatchUpdate = {
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

const ensureMatchesArray = (participant?: { matches?: Match[] } | null) => {
  if (!participant) return [] as Match[];
  if (!participant.matches) participant.matches = [];
  return participant.matches;
};

const detachMatch = (participant: { matches?: Match[] } | null | undefined, match: Match) => {
  if (!participant?.matches) return;
  participant.matches = participant.matches.filter((existing) => existing.id !== match.id);
};

export const applyMatchUpdates = (event: Tournament | League, match: Match, update: MatchUpdate) => {
  if (update.matchId !== undefined) {
    match.matchId = update.matchId ?? null;
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

const isMatchScored = (match: Match): boolean => {
  if (!match.setResults?.length) return false;
  return match.setResults.every((result) => result === 1 || result === 2);
};

type LeagueStanding = {
  teamId: string;
  teamName: string;
  team: Team | null;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

const computeLeagueStandings = (league: League, matches: Iterable<Match>): LeagueStanding[] => {
  const standings = new Map<string, LeagueStanding>();

  const ensureRow = (teamObj: Team | null): LeagueStanding | null => {
    if (!teamObj) return null;
    if (!standings.has(teamObj.id)) {
      standings.set(teamObj.id, {
        teamId: teamObj.id,
        teamName: teamObj.name || teamObj.id,
        team: teamObj,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }
    return standings.get(teamObj.id) ?? null;
  };

  for (const team of Object.values(league.teams)) {
    ensureRow(team);
  }

  const sumPoints = (points: number[]): number => points.reduce((total, value) => (Number.isFinite(value) ? total + value : total), 0);

  for (const match of matches) {
    if (!isMatchScored(match)) continue;
    const team1 = match.team1;
    const team2 = match.team2;
    const row1 = ensureRow(team1 ?? null);
    const row2 = ensureRow(team2 ?? null);
    if (!row1 || !row2) continue;

    const setResults = match.setResults ?? [];
    const team1Wins = setResults.filter((result) => result === 1).length;
    const team2Wins = setResults.filter((result) => result === 2).length;
    const allSetsResolved = Boolean(setResults.length) && setResults.every((result) => result === 1 || result === 2);

    const team1Total = sumPoints(match.team1Points ?? []);
    const team2Total = sumPoints(match.team2Points ?? []);

    let outcome: 'team1' | 'team2' | 'draw' | null = null;
    if (team1Wins > team2Wins) {
      outcome = 'team1';
    } else if (team2Wins > team1Wins) {
      outcome = 'team2';
    } else if (allSetsResolved) {
      outcome = 'draw';
    } else if (team1Total > 0 || team2Total > 0) {
      if (team1Total > team2Total) {
        outcome = 'team1';
      } else if (team2Total > team1Total) {
        outcome = 'team2';
      } else {
        outcome = 'draw';
      }
    }

    if (!outcome) continue;

    row1.goalsFor += team1Total;
    row1.goalsAgainst += team2Total;
    row2.goalsFor += team2Total;
    row2.goalsAgainst += team1Total;

    if (outcome === 'team1') {
      row1.wins += 1;
      row2.losses += 1;
    } else if (outcome === 'team2') {
      row2.wins += 1;
      row1.losses += 1;
    } else {
      row1.draws += 1;
      row2.draws += 1;
    }
  }

  const scoring = league.leagueScoringConfig ?? {};
  const pointsForWin = scoring.pointsForWin ?? 0;
  const pointsForDraw = scoring.pointsForDraw ?? 0;
  const pointsForLoss = scoring.pointsForLoss ?? 0;
  const pointsPerGoal = scoring.pointsPerGoalScored ?? 0;
  const pointsPerGoalAgainst = scoring.pointsPerGoalConceded ?? 0;
  let precision = Number(scoring.pointPrecision ?? 0);
  precision = precision > 0 ? precision : 0;
  const multiplier = precision > 0 ? 10 ** precision : 1;

  for (const row of standings.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    const basePoints = row.wins * pointsForWin + row.draws * pointsForDraw + row.losses * pointsForLoss;
    const goalPoints = row.goalsFor * pointsPerGoal + row.goalsAgainst * pointsPerGoalAgainst;
    let totalPoints = basePoints + goalPoints;
    if (precision > 0) {
      totalPoints = Math.round(totalPoints * multiplier) / multiplier;
    }
    row.points = totalPoints;
  }

  return Array.from(standings.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase());
  });
};

const assignTeamToMatch = (match: Match, attr: 'team1' | 'team2', team: Team) => {
  const previous = match[attr];
  if (previous && previous.matches) {
    previous.matches = previous.matches.filter((existing) => existing.id !== match.id);
  }
  match[attr] = team;
  const matches = ensureMatchesArray(team);
  if (!matches.includes(match)) matches.push(match);
};

const copyTemplateAssignments = (
  actualMatch: Match,
  templateMatch: Match,
  teamLookup: Record<string, Team>,
  visited: Set<string>,
) => {
  if (visited.has(actualMatch.id)) return;
  visited.add(actualMatch.id);

  for (const attr of ['team1', 'team2'] as const) {
    const templateTeam = templateMatch[attr];
    if (!templateTeam) continue;
    const realTeam = teamLookup[templateTeam.id];
    if (!realTeam) continue;
    assignTeamToMatch(actualMatch, attr, realTeam);
  }

  const children: Array<[Match | null, Match | null]> = [
    [actualMatch.previousLeftMatch, templateMatch.previousLeftMatch],
    [actualMatch.previousRightMatch, templateMatch.previousRightMatch],
  ];
  for (const [actualChild, templateChild] of children) {
    if (actualChild && templateChild) {
      copyTemplateAssignments(actualChild, templateChild, teamLookup, visited);
    }
  }
};

const findPlayoffRootMatch = (matches: Iterable<Match>): Match | null => {
  const playoffMatches = Array.from(matches).filter((match) => isPlayoffMatch(match));
  if (!playoffMatches.length) return null;
  const finals = playoffMatches.filter(
    (match) => !match.winnerNextMatch && !match.losersBracket && (match.previousLeftMatch || match.previousRightMatch),
  );
  if (finals.length) {
    return finals.sort((a, b) => (b.matchId ?? 0) - (a.matchId ?? 0))[0];
  }
  return playoffMatches.sort((a, b) => (b.matchId ?? 0) - (a.matchId ?? 0))[0];
};

const buildTemplateBracket = (league: League, seededTeamIds: string[], context: SchedulerContext): Match | null => {
  const teamClones: Record<string, Team> = {};
  for (const teamId of seededTeamIds) {
    const team = league.teams[teamId];
    if (!team) continue;
    teamClones[teamId] = new Team({
      id: team.id,
      seed: team.seed,
      captainId: team.captainId,
      division: team.division,
      name: team.name,
      matches: [],
      playerIds: [...(team.playerIds ?? [])],
      wins: team.wins,
      losses: team.losses,
    });
  }

  if (Object.keys(teamClones).length < 2) return null;

  const divisions = league.divisions.length ? league.divisions : [new Division('OPEN', 'OPEN')];

  const tournamentFields: Record<string, PlayingField> = {};
  for (const [fieldId, field] of Object.entries(league.fields)) {
    tournamentFields[fieldId] = new PlayingField({
      id: field.id,
      fieldNumber: field.fieldNumber,
      organizationId: field.organizationId ?? null,
      divisions: field.divisions.length ? field.divisions : [...divisions],
      matches: [],
      events: [...field.events],
      rentalSlots: [...field.rentalSlots],
      name: field.name,
    });
  }

  const tournament = new Tournament({
    id: `${league.id}-playoffs`,
    name: `${league.name} Playoffs`,
    start: league.start,
    end: league.end,
    fields: tournamentFields,
    doubleElimination: league.doubleElimination,
    matches: {},
    fieldType: league.fieldType,
    location: league.location,
    organizationId: league.organizationId ?? null,
    winnerSetCount: league.winnerSetCount,
    loserSetCount: league.loserSetCount,
    teams: teamClones,
    players: league.players,
    waitListIds: [],
    freeAgentIds: [],
    maxParticipants: Object.keys(teamClones).length,
    teamSignup: true,
    divisions,
    eventType: 'TOURNAMENT',
    timeSlots: league.timeSlots,
    restTimeMinutes: league.restTimeMinutes,
    matchDurationMinutes: league.matchDurationMinutes,
    usesSets: league.usesSets,
    setDurationMinutes: league.setDurationMinutes,
  });

  const bracketBuilder = new Brackets(tournament, context);
  bracketBuilder.buildBrackets();
  return findPlayoffRootMatch(Object.values(bracketBuilder.tournament.matches));
};

const assignSeededTeamsToPlayoffMatches = (league: League, seededTeamIds: string[], context: SchedulerContext): void => {
  if (!seededTeamIds.length) return;
  const actualRoot = findPlayoffRootMatch(Object.values(league.matches));
  if (!actualRoot) return;
  const templateRoot = buildTemplateBracket(league, seededTeamIds, context);
  if (!templateRoot) return;
  const visited = new Set<string>();
  copyTemplateAssignments(actualRoot, templateRoot, league.teams, visited);
};

const seedLeaguePlayoffs = (league: League, updatedMatch: Match, context: SchedulerContext): string[] => {
  if (!league.includePlayoffs) return [];
  const regularMatches = Object.values(league.matches).filter((match) => !isPlayoffMatch(match));
  if (!regularMatches.length) return [];
  if (!regularMatches.every((match) => isMatchScored(match))) return [];

  const standings = computeLeagueStandings(league, regularMatches);
  const playoffTeamCount = Math.min(league.playoffTeamCount ?? 0, standings.length);
  if (playoffTeamCount < 2) return [];

  const seededTeamIds: string[] = [];
  let seedValue = playoffTeamCount;
  for (const row of standings.slice(0, playoffTeamCount)) {
    const team = league.teams[row.teamId];
    if (!team) continue;
    team.seed = seedValue;
    seededTeamIds.push(team.id);
    seedValue -= 1;
  }

  if (seededTeamIds.length) {
    assignSeededTeamsToPlayoffMatches(league, seededTeamIds, context);
  }

  return seededTeamIds;
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
    if (!freeTeam.losses && !isTeamInPreviousMatch(freeTeam, match)) {
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
    if (!match.field) {
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
  context: SchedulerContext = noopContext,
  currentTime: Date,
): FinalizeResult => {
  syncMatchParticipants(Object.values(event.matches));

  const updatedIsPlayoffMatch = isPlayoffMatch(updatedMatch);
  const seededTeamIds: string[] = [];
  if (event instanceof League && !updatedIsPlayoffMatch) {
    seededTeamIds.push(...seedLeaguePlayoffs(event, updatedMatch, context));
  }

  const teamOne = updatedMatch.team1;
  const teamTwo = updatedMatch.team2;
  if (!teamOne || !teamTwo) {
    return { updatedMatch, seededTeamIds };
  }

  const team1Wins = updatedMatch.setResults.filter((result) => result === 1).length;
  const team2Wins = updatedMatch.setResults.filter((result) => result === 2).length;
  const winner = team1Wins > team2Wins ? teamOne : teamTwo;
  const loser = winner === teamOne ? teamTwo : teamOne;

  winner.wins += 1;
  loser.losses += 1;
  updatedMatch.advanceTeams(winner, loser);

  // Regular season league matches should not trigger bracket-style rescheduling. The schedule is pre-built and
  // independent from match results; rescheduling here was unscheduling future matches without restoring them.
  if (event instanceof League && !updatedIsPlayoffMatch) {
    if (event.doTeamsRef && seededTeamIds.length) {
      const participants = buildScheduleParticipants(event);
      const schedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
        event.start,
        event.fields,
        participants,
        event.divisions,
        currentTime,
        { endTime: event.end, timeSlots: event.timeSlots },
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
    { endTime: event.end, timeSlots: event.timeSlots },
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
      if (team.losses) continue;
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
