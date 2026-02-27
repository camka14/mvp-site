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

const buildFieldById = (id: string, division: Division) =>
  new PlayingField({
    id,
    fieldNumber: 1,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: id,
  });

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
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
    // Finalization should not reshuffle already scheduled fields.
    expect(team1.id).not.toEqual('');
    expect(team2.id).not.toEqual('');
  });

  it('does not auto-seed playoff teams when regular-season league matches are finalized', () => {
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
    const initialPlayoffAssignments = new Map(
      playoffMatches.map((match) => [
        match.id,
        [match.team1?.id ?? null, match.team2?.id ?? null] as const,
      ]),
    );

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

    expect(seeded).toEqual([]);
    const updatedPlayoffMatches = Object.values(league.matches).filter((match) => isPlayoff(match));
    for (const match of updatedPlayoffMatches) {
      expect([match.team1?.id ?? null, match.team2?.id ?? null]).toEqual(
        initialPlayoffAssignments.get(match.id),
      );
    }
  });

  it('finalizes split-playoff matches without rescheduling when playoff divisions map to regular slots', () => {
    const mixedAge = new Division(
      'mixed_age_finalize_mapped_slots',
      'Mixed Age',
      [],
      null,
      8,
      4,
      'LEAGUE',
      [
        'mixed_age_finalize_playoff_mapped_slots',
        'mixed_age_finalize_playoff_mapped_slots',
        'mixed_age_finalize_playoff_mapped_slots',
        'mixed_age_finalize_playoff_mapped_slots',
      ],
    );
    const mixedAgePlayoff = new Division(
      'mixed_age_finalize_playoff_mapped_slots',
      'Mixed Age Playoff',
      [],
      null,
      8,
      null,
      'PLAYOFF',
    );
    const fieldRegular = buildFieldById('field_finalize_mapped_slots_regular', mixedAge);
    const teams = buildTeams(8, mixedAge);

    const league = new League({
      id: 'league_finalize_split_playoff_mapped_slot_fallback',
      name: 'Finalize Split Playoff Mapped Slot Fallback',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [mixedAge],
      playoffDivisions: [mixedAgePlayoff],
      splitLeaguePlayoffDivisions: true,
      referees: [],
      fields: {
        [fieldRegular.id]: fieldRegular,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_finalize_mapped_slots_regular',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
      ],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatch = scheduled.matches.find((match) => match.division.id === mixedAgePlayoff.id);

    expect(playoffMatch).toBeTruthy();
    if (!playoffMatch) {
      return;
    }

    const teamsArray = Object.values(league.teams);
    const [team1, team2] = teamsArray;
    expect(team1).toBeTruthy();
    expect(team2).toBeTruthy();
    if (!team1 || !team2) {
      return;
    }

    playoffMatch.team1 = team1;
    playoffMatch.team2 = team2;
    if (!team1.matches.includes(playoffMatch)) {
      team1.matches.push(playoffMatch);
    }
    if (!team2.matches.includes(playoffMatch)) {
      team2.matches.push(playoffMatch);
    }

    playoffMatch.setResults = [1];
    playoffMatch.team1Points = [21];
    playoffMatch.team2Points = [19];

    expect(() => finalizeMatch(league, playoffMatch, context, new Date(playoffMatch.end))).not.toThrow();
  });
});
