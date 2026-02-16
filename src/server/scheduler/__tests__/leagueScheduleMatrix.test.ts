/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, League, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('open', 'Open');

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let index = 1; index <= count; index += 1) {
    const id = `team_${index}`;
    teams[id] = new Team({
      id,
      seed: index,
      captainId: `captain_${index}`,
      division,
      name: `Team ${index}`,
      matches: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

const buildFields = (division: Division, count: number): Record<string, PlayingField> => {
  const fields: Record<string, PlayingField> = {};
  for (let index = 1; index <= count; index += 1) {
    const id = `field_${index}`;
    fields[id] = new PlayingField({
      id,
      fieldNumber: index,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: `Field ${index}`,
    });
  }
  return fields;
};

const buildTimeSlots = (fieldIds: string[]): TimeSlot[] => {
  const startDate = new Date(2026, 0, 5, 8, 0, 0); // Monday
  const slots: TimeSlot[] = [];
  for (const fieldId of fieldIds) {
    for (let day = 0; day <= 6; day += 1) {
      slots.push(
        new TimeSlot({
          id: `${fieldId}_day_${day}`,
          dayOfWeek: day, // Monday-based index
          startDate,
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 22 * 60,
          field: fieldId,
        }),
      );
    }
  }
  return slots;
};

const projectedTeamCount = (teamCount: number): number => {
  // Scheduler always pads to at least 2 participants.
  return Math.max(teamCount, 2);
};

const regularMatchCount = (teamCount: number, gamesPerOpponent: number): number => {
  const projected = projectedTeamCount(teamCount);
  return Math.floor((projected * (projected - 1) / 2) * gamesPerOpponent);
};

const playoffMatchCount = (teamCount: number, includePlayoffs: boolean, playoffTeamCount: number): number => {
  if (!includePlayoffs) return 0;

  const projected = projectedTeamCount(teamCount);
  const seededCount = Math.min(Math.max(playoffTeamCount, 0), projected);

  // Bracket builder intentionally skips divisions with fewer than 3 teams.
  if (seededCount < 3) return 0;

  return seededCount - 1;
};

type Scenario = {
  label: string;
  teamCount: number;
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount: number;
  usesSets: boolean;
  restTimeMinutes: number;
};

const scenarios: Scenario[] = [
  { label: '1-team no playoffs timed', teamCount: 1, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 0 },
  { label: '2-team no playoffs timed', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 0 },
  { label: '4-team round robin x2 timed', teamCount: 4, gamesPerOpponent: 2, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 15 },
  { label: '8-team no playoffs set-based', teamCount: 8, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: true, restTimeMinutes: 0 },
  { label: '16-team round robin x2 set-based', teamCount: 16, gamesPerOpponent: 2, includePlayoffs: false, playoffTeamCount: 0, usesSets: true, restTimeMinutes: 20 },
  { label: '32-team no playoffs timed', teamCount: 32, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 5 },
  { label: '2-team playoffs count 1 (no playoffs generated)', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 1, usesSets: false, restTimeMinutes: 0 },
  { label: '2-team playoffs count 2', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 2, usesSets: false, restTimeMinutes: 0 },
  { label: '5-team playoffs count 4 set-based', teamCount: 5, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 4, usesSets: true, restTimeMinutes: 10 },
  { label: '8-team playoffs count 4 timed', teamCount: 8, gamesPerOpponent: 2, includePlayoffs: true, playoffTeamCount: 4, usesSets: false, restTimeMinutes: 0 },
  { label: '8-team playoffs count 8 set-based', teamCount: 8, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 8, usesSets: true, restTimeMinutes: 15 },
  { label: '16-team playoffs count 16 timed', teamCount: 16, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 16, usesSets: false, restTimeMinutes: 30 },
  { label: '16-team playoffs count over cap clamps to 16', teamCount: 16, gamesPerOpponent: 2, includePlayoffs: true, playoffTeamCount: 20, usesSets: true, restTimeMinutes: 20 },
  { label: '32-team playoffs count 16 timed', teamCount: 32, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 16, usesSets: false, restTimeMinutes: 10 },
];

describe('league schedule matrix', () => {
  jest.setTimeout(120000);

  it.each(scenarios)('schedules scenario: $label', (scenario) => {
    const division = buildDivision();
    const teams = buildTeams(scenario.teamCount, division);
    const fields = buildFields(division, 4);
    const timeSlots = buildTimeSlots(Object.keys(fields));

    const start = new Date(2026, 0, 5, 8, 0, 0);
    const end = new Date(2026, 11, 31, 22, 0, 0);

    const league = new League({
      id: `league_${scenario.teamCount}_${scenario.gamesPerOpponent}_${scenario.playoffTeamCount}_${scenario.usesSets ? 'sets' : 'timed'}`,
      name: `Matrix ${scenario.label}`,
      start,
      end,
      maxParticipants: scenario.teamCount,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields,
      timeSlots,
      doTeamsRef: false,
      gamesPerOpponent: scenario.gamesPerOpponent,
      includePlayoffs: scenario.includePlayoffs,
      playoffTeamCount: scenario.playoffTeamCount,
      doubleElimination: false,
      usesSets: scenario.usesSets,
      matchDurationMinutes: scenario.usesSets ? undefined : 60,
      setDurationMinutes: scenario.usesSets ? 20 : undefined,
      setsPerMatch: scenario.usesSets ? 3 : undefined,
      restTimeMinutes: scenario.restTimeMinutes,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const expectedRegularMatches = regularMatchCount(scenario.teamCount, scenario.gamesPerOpponent);
    const expectedPlayoffMatches = playoffMatchCount(
      scenario.teamCount,
      scenario.includePlayoffs,
      scenario.playoffTeamCount,
    );
    const expectedTotal = expectedRegularMatches + expectedPlayoffMatches;

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(expectedTotal);

    for (const match of scheduled.matches) {
      expect(match.field).toBeTruthy();
      expect(match.start.getTime()).toBeLessThan(match.end.getTime());
    }
  });
});
