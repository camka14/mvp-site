/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import {
  applyLeagueDivisionPlayoffReassignment,
  computeLeagueDivisionStandings,
  isPlayoffMatch,
  normalizeLeaguePlayoffPlacementMappings,
  validateDivisionPlayoffMapping,
} from '@/server/scheduler/standings';
import { Division, League, Match, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildField = (id: string, divisions: Division[]) =>
  new PlayingField({
    id,
    divisions,
    matches: [],
    events: [],
    rentalSlots: [],
    name: id,
  });

const buildTeamsForDivision = (prefix: string, count: number, division: Division): Record<string, Team> => {
  const teams: Record<string, Team> = {};
  for (let index = 1; index <= count; index += 1) {
    const id = `${prefix}_team_${index}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${prefix}_${index}`,
      division,
      name: `${prefix.toUpperCase()} Team ${index}`,
      matches: [],
    });
  }
  return teams;
};

const getPlayoffMatches = (league: League, playoffDivisionId: string): Match[] => (
  Object.values(league.matches).filter(
    (match) => match.division.id === playoffDivisionId && isPlayoffMatch(match),
  )
);

describe('standings playoff reassignment', () => {
  it('auto-fills single-division playoff mappings in bracket order', () => {
    const open = new Division(
      'open',
      'Open',
      [],
      null,
      8,
      4,
      'LEAGUE',
      ['playoff_1', '', 'playoff_unknown'],
    );
    const playoffOne = new Division('playoff_1', 'Playoff 1', [], null, 8, null, 'PLAYOFF');
    const playoffTwo = new Division('playoff_2', 'Playoff 2', [], null, 8, null, 'PLAYOFF');

    const league = new League({
      id: 'league_mapping_autofill',
      name: 'League Mapping Autofill',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-03-30T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams: {},
      divisions: [open],
      playoffDivisions: [playoffOne, playoffTwo],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {},
      timeSlots: [],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const changedDivisionIds = normalizeLeaguePlayoffPlacementMappings(league);

    expect(changedDivisionIds).toEqual([open.id]);
    expect(open.playoffPlacementDivisionIds).toEqual([
      playoffOne.id,
      playoffTwo.id,
      playoffOne.id,
      playoffTwo.id,
    ]);
  });

  it('does not auto-fill playoff mappings for split league divisions', () => {
    const east = new Division('east', 'East', [], null, 6, 3, 'LEAGUE', ['playoff_1', '', '']);
    const west = new Division('west', 'West', [], null, 6, 3, 'LEAGUE', ['playoff_1', '', '']);
    const playoffOne = new Division('playoff_1', 'Playoff 1', [], null, 8, null, 'PLAYOFF');
    const playoffTwo = new Division('playoff_2', 'Playoff 2', [], null, 8, null, 'PLAYOFF');

    const league = new League({
      id: 'league_mapping_manual_split',
      name: 'League Mapping Manual Split',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-03-30T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 12,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [east, west],
      playoffDivisions: [playoffOne, playoffTwo],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {},
      timeSlots: [],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const changedDivisionIds = normalizeLeaguePlayoffPlacementMappings(league);

    expect(changedDivisionIds).toEqual([]);
    expect(east.playoffPlacementDivisionIds).toEqual(['playoff_1', '', '']);
    expect(west.playoffPlacementDivisionIds).toEqual(['playoff_1', '', '']);
  });

  it('does not require placement mapping when split playoffs are disabled', () => {
    const open = new Division(
      'open',
      'Open',
      [],
      null,
      12,
      9,
      'LEAGUE',
      [],
    );
    const league = new League({
      id: 'league_no_split_mapping_required',
      name: 'League No Split Mapping Required',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-03-30T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 12,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams: {},
      divisions: [open],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      officials: [],
      fields: {},
      timeSlots: [],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 9,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const errors = validateDivisionPlayoffMapping(league, open);

    expect(errors).toEqual([]);
  });

  it('assigns each seeded team to a single entrant slot when bracket capacity is larger than confirmed entrants', () => {
    const east = new Division(
      'east',
      'East',
      [],
      null,
      4,
      2,
      'LEAGUE',
      ['playoff_2', 'playoff_2'],
    );
    const west = new Division(
      'west',
      'West',
      [],
      null,
      4,
      2,
      'LEAGUE',
      ['playoff_2', 'playoff_2'],
    );
    west.standingsConfirmedAt = new Date('2026-01-15T00:00:00.000Z');
    west.standingsConfirmedBy = 'host_1';

    const playoffTwo = new Division('playoff_2', 'Playoff 2', [], null, 8, null, 'PLAYOFF');
    const field = buildField('field_1', [east, west, playoffTwo]);
    const teams = {
      ...buildTeamsForDivision('east', 4, east),
      ...buildTeamsForDivision('west', 4, west),
    };

    const league = new League({
      id: 'league_standings_playoff_reassignment',
      name: 'League Standings Playoff Reassignment',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-03-30T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [east, west],
      playoffDivisions: [playoffTwo],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [field.id]: field,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_regular',
          dayOfWeek: 0,
          startDate: new Date('2026-01-05T08:00:00.000Z'),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [east, west],
        }),
        new TimeSlot({
          id: 'slot_playoff',
          dayOfWeek: 1,
          startDate: new Date('2026-01-05T08:00:00.000Z'),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [playoffTwo],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 2,
      doubleElimination: true,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const scheduledLeague = scheduled.event as League;
    const playoffMatches = getPlayoffMatches(scheduledLeague, playoffTwo.id);
    expect(playoffMatches.length).toBeGreaterThan(0);

    const reassignment = applyLeagueDivisionPlayoffReassignment(scheduledLeague, east.id, context);
    const assignedTeamIds = reassignment.teamIdsByPlayoffDivision[playoffTwo.id] ?? [];
    expect(assignedTeamIds.length).toBe(4);

    const assignedCounts = new Map<string, number>();
    const reassignedMatches = getPlayoffMatches(scheduledLeague, playoffTwo.id);
    for (const match of reassignedMatches) {
      if (match.team1) {
        assignedCounts.set(match.team1.id, (assignedCounts.get(match.team1.id) ?? 0) + 1);
        expect(match.previousLeftMatch).toBeNull();
      }
      if (match.team2) {
        assignedCounts.set(match.team2.id, (assignedCounts.get(match.team2.id) ?? 0) + 1);
        expect(match.previousRightMatch).toBeNull();
      }
    }

    for (const teamId of assignedTeamIds) {
      expect(assignedCounts.get(teamId)).toBe(1);
    }
  });

  it('preserves carried bye seeds on the actual quarterfinal nodes for a 10-team league playoff', () => {
    const open = new Division(
      'open',
      'Open',
      [],
      null,
      12,
      10,
      'LEAGUE',
      [],
    );
    const field = buildField('field_open', [open]);
    const teams = buildTeamsForDivision('open', 10, open);

    const league = new League({
      id: 'league_ten_team_bye_reassignment',
      name: 'League Ten Team Bye Reassignment',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-03-30T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 12,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams,
      divisions: [open],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      officials: [],
      fields: {
        [field.id]: field,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_open_playoff',
          dayOfWeek: 1,
          startDate: new Date('2026-01-05T08:00:00.000Z'),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const scheduledLeague = scheduled.event as League;

    const reassignment = applyLeagueDivisionPlayoffReassignment(scheduledLeague, open.id, context);
    const expectedTeamIdBySeed = new Map(
      computeLeagueDivisionStandings(scheduledLeague, open.id)
        .slice(0, 10)
        .map((row, index) => [index + 1, row.teamId] as const),
    );

    const carriedSeedMatches = getPlayoffMatches(scheduledLeague, open.id).filter((match) => {
      const previousCount = Number(Boolean(match.previousLeftMatch)) + Number(Boolean(match.previousRightMatch));
      const directSeedCount = Number(typeof match.team1Seed === 'number') + Number(typeof match.team2Seed === 'number');
      return previousCount === 1 && directSeedCount === 1;
    });
    const seededMatches = getPlayoffMatches(scheduledLeague, open.id).filter((match) => (
      typeof match.team1Seed === 'number' || typeof match.team2Seed === 'number'
    ));

    expect(reassignment.affectedPlayoffDivisionIds).toEqual([]);
    expect(reassignment.seededTeamIds).toHaveLength(10);
    expect(seededMatches.length).toBeGreaterThan(0);
    for (const match of seededMatches) {
      if (typeof match.team1Seed === 'number') {
        expect(match.team1?.id ?? null).toBe(expectedTeamIdBySeed.get(match.team1Seed) ?? null);
      }
      if (typeof match.team2Seed === 'number') {
        expect(match.team2?.id ?? null).toBe(expectedTeamIdBySeed.get(match.team2Seed) ?? null);
      }
    }

    expect(carriedSeedMatches).toHaveLength(2);
    expect(carriedSeedMatches.map((match) => match.matchId).sort((left, right) => left - right)).toEqual([69, 71]);
    expect(
      carriedSeedMatches
        .map((match) => (typeof match.team1Seed === 'number' ? match.team1Seed : match.team2Seed))
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
    ).toEqual([1, 2]);
  });
});
