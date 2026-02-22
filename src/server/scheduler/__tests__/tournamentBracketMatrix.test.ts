/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, PlayingField, Team, TimeSlot, Tournament } from '@/server/scheduler/types';

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

const buildTimeSlots = () => {
  const startDate = new Date(2026, 0, 5, 8, 0, 0); // Monday
  const slots: TimeSlot[] = [];
  for (let day = 0; day <= 6; day += 1) {
    slots.push(
      new TimeSlot({
        id: `slot_day_${day}`,
        dayOfWeek: day,
        startDate,
        repeating: true,
        startTimeMinutes: 8 * 60,
        endTimeMinutes: 22 * 60,
        field: 'field_1',
      }),
    );
  }
  return slots;
};

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      seed: i,
      captainId: `captain_${i}`,
      division,
      name: `Team ${i}`,
      matches: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

const scheduleTournament = (teamCount: number, doubleElimination: boolean) => {
  const division = buildDivision();
  const field = buildField(division);
  const teams = buildTeams(teamCount, division);
  const tournament = new Tournament({
    id: `matrix_tournament_${doubleElimination ? 'double' : 'single'}_${teamCount}`,
    name: `Matrix Tournament ${teamCount}`,
    start: new Date(2026, 0, 5, 8, 0, 0),
    end: new Date(2026, 11, 31, 22, 0, 0),
    maxParticipants: teamCount,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams,
    divisions: [division],
    fields: { [field.id]: field },
    timeSlots: buildTimeSlots(),
    doTeamsRef: false,
    doubleElimination,
    winnerSetCount: 1,
    loserSetCount: 1,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
  });
  return scheduleEvent({ event: tournament }, context);
};

describe('tournament bracket matrix', () => {
  jest.setTimeout(120000);

  it('handles team counts 1..32 for single and double elimination (including odd counts)', () => {
    for (let teamCount = 1; teamCount <= 32; teamCount += 1) {
      const single = scheduleTournament(teamCount, false);
      const double = scheduleTournament(teamCount, true);

      if (teamCount < 3) {
        expect(single.matches.length).toBe(0);
        expect(double.matches.length).toBe(0);
        continue;
      }

      expect(single.matches.length).toBe(teamCount - 1);
      expect(double.matches.length).toBeGreaterThanOrEqual(single.matches.length);
      expect(double.matches.length).toBeLessThanOrEqual(2 * teamCount - 1);

      const singleMatchIds = single.matches
        .map((match) => match.matchId)
        .filter((id): id is number => typeof id === 'number');
      const uniqueSingleMatchIds = new Set(singleMatchIds);
      expect(uniqueSingleMatchIds.size).toBe(singleMatchIds.length);

      const doubleMatchIds = double.matches
        .map((match) => match.matchId)
        .filter((id): id is number => typeof id === 'number');
      const uniqueDoubleMatchIds = new Set(doubleMatchIds);
      expect(uniqueDoubleMatchIds.size).toBe(doubleMatchIds.length);
    }
  });
});

