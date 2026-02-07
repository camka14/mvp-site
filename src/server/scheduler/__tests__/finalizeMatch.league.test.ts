/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { finalizeMatch } from '@/server/scheduler/updateMatch';
import { Division, League, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (division: Division) =>
  new PlayingField({
    id: 'field_1',
    fieldNumber: 1,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  });

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      seed: 0,
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

const buildWeeklySlot = (dayOfWeek: number) =>
  new TimeSlot({
    id: 'slot_1',
    dayOfWeek,
    startDate: new Date(2026, 0, 1),
    repeating: true,
    startTimeMinutes: 9 * 60,
    endTimeMinutes: 23 * 60,
  });

describe('finalizeMatch (league)', () => {
  it('does not unschedule future regular-season matches when a match is finalized', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 1, 9, 0, 0);
    const end = new Date(2026, 0, 1, 17, 0, 0);

    const league = new League({
      id: 'league_1',
      name: 'Test League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [buildWeeklySlot(start.getDay())],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      restTimeMinutes: 0,
      usesSets: true,
      setDurationMinutes: 20,
      setsPerMatch: 3,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBeGreaterThan(0);
    expect(scheduled.matches.every((match) => Boolean(match.field))).toBe(true);

    const ordered = [...scheduled.matches].sort((a, b) => (a.matchId ?? 0) - (b.matchId ?? 0));
    const first = ordered[0];
    expect(first.team1).not.toBeNull();
    expect(first.team2).not.toBeNull();

    // Mark the match as completed.
    first.setResults = [1, 1, 2];
    first.team1Points = [21, 21, 15];
    first.team2Points = [10, 18, 21];

    const team1 = first.team1 as Team;
    const team2 = first.team2 as Team;
    const beforeFields = ordered.map((match) => match.field?.id ?? null);

    finalizeMatch(league, first, context, new Date(first.end));

    const afterFields = Object.values(league.matches)
      .sort((a, b) => (a.matchId ?? 0) - (b.matchId ?? 0))
      .map((match) => match.field?.id ?? null);

    expect(afterFields).toEqual(beforeFields);
    // Winner/loser records are updated even though the schedule does not change.
    expect(team1.wins + team2.wins).toBe(1);
    expect(team1.losses + team2.losses).toBe(1);
  });

  it('seeds playoff teams once all regular-season matches are scored (and assigns team refs for ready playoff matches)', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 1, 9, 0, 0);
    const end = new Date(2026, 0, 1, 17, 0, 0);

    const league = new League({
      id: 'league_2',
      name: 'Playoff League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [buildWeeklySlot(start.getDay())],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      restTimeMinutes: 0,
      usesSets: true,
      setDurationMinutes: 20,
      setsPerMatch: 3,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
      doTeamsRef: true,
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const isPlayoff = (match: any) =>
      Boolean(match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch);

    const regularMatches = scheduled.matches.filter((match) => !isPlayoff(match));
    const playoffMatches = scheduled.matches.filter((match) => isPlayoff(match));

    expect(regularMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.some((match) => !match.team1 || !match.team2)).toBe(true);

    let seeded: string[] = [];
    const orderedRegular = [...regularMatches].sort((a, b) => (a.matchId ?? 0) - (b.matchId ?? 0));
    for (const match of orderedRegular) {
      const team1 = match.team1 as Team;
      const team2 = match.team2 as Team;
      expect(team1).toBeTruthy();
      expect(team2).toBeTruthy();

      const teamNum = (team: Team) => Number(team.id.split('_')[1] ?? 0);
      const winnerIsTeam1 = teamNum(team1) > teamNum(team2);

      match.setResults = winnerIsTeam1 ? [1, 1, 2] : [2, 2, 1];
      match.team1Points = winnerIsTeam1 ? [21, 21, 15] : [10, 10, 21];
      match.team2Points = winnerIsTeam1 ? [10, 10, 21] : [21, 21, 15];

      const result = finalizeMatch(league, match, context, new Date(match.end));
      if (result.seededTeamIds.length) {
        seeded = result.seededTeamIds;
      }
    }

    expect(seeded).toEqual(['team_4', 'team_3', 'team_2', 'team_1']);
    expect(league.teams.team_4.seed).toBe(4);
    expect(league.teams.team_3.seed).toBe(3);
    expect(league.teams.team_2.seed).toBe(2);
    expect(league.teams.team_1.seed).toBe(1);

    const readyPlayoffMatches = Object.values(league.matches).filter(
      (match) => isPlayoff(match) && match.team1 && match.team2,
    );
    expect(readyPlayoffMatches.length).toBeGreaterThan(0);
    for (const match of readyPlayoffMatches) {
      expect(match.field).not.toBeNull();
      expect(match.teamReferee).not.toBeNull();
      expect(match.teamReferee).not.toBe(match.team1);
      expect(match.teamReferee).not.toBe(match.team2);
    }
  });
});
