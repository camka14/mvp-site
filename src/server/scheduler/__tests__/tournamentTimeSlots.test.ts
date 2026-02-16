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

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      seed: i,
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

describe('tournament scheduling (time slots)', () => {
  it('schedules across multiple weekends when weekend slot capacity is limited', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(32, division);

    // Jan 3, 2026 is a Saturday.
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 4, 13, 0, 0);

    // Two 4-hour windows per week (Sat/Sun) forces a multi-weekend schedule for a 32-team bracket.
    const slotStart = 9 * 60;
    const slotEnd = 13 * 60;
    const saturdaySlotDay = 5; // Monday-based index (0=Mon ... 6=Sun)
    const sundaySlotDay = 6;
    const timeSlots = [
      new TimeSlot({
        id: 'slot_sat',
        dayOfWeek: saturdaySlotDay,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
      }),
      new TimeSlot({
        id: 'slot_sun',
        dayOfWeek: sundaySlotDay,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
      }),
    ];

    const tournament = new Tournament({
      id: 'tournament_slots',
      name: 'Weekend Tournament',
      start,
      end,
      maxParticipants: 32,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [division],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsRef: false,
      doubleElimination: false,
      winnerSetCount: 2,
      loserSetCount: 1,
      usesSets: true,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    expect(scheduled.matches.length).toBe(31);

    const weekendDays = new Set([6, 0]); // JS Date#getDay() indexes (0=Sun ... 6=Sat)
    for (const match of scheduled.matches) {
      expect(weekendDays.has(match.start.getDay())).toBe(true);
      expect(match.start.getHours()).toBeGreaterThanOrEqual(9);
      const endHour = match.end.getHours();
      const endMinute = match.end.getMinutes();
      expect(endHour < 13 || (endHour === 13 && endMinute === 0)).toBe(true);
    }

    const twoWeeksMs = 2 * 7 * 24 * 60 * 60 * 1000;
    const maxStart = Math.max(...scheduled.matches.map((match) => match.start.getTime()));
    expect(maxStart).toBeGreaterThanOrEqual(start.getTime() + twoWeeksMs);
  });
});
