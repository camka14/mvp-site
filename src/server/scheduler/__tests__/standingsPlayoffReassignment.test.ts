/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { applyLeagueDivisionPlayoffReassignment, isPlayoffMatch } from '@/server/scheduler/standings';
import { Division, League, Match, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildField = (id: string, divisions: Division[]) =>
  new PlayingField({
    id,
    fieldNumber: 1,
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
      referees: [],
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
      doTeamsRef: false,
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
});
