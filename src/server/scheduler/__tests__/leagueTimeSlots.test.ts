/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
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

describe('league scheduling (time slots)', () => {
  it('schedules weekend-only league matches across multiple weekends when weekend slots are limited', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(8, division);

    // Jan 3, 2026 is a Saturday.
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 4, 13, 0, 0);

    // Weekend-only, 4 hours/day. With 8 teams and 60-minute matches, each round consumes a full day.
    // Round robin needs 7 rounds, so we should span multiple weekends (multiple weeks).
    const slotStart = 9 * 60;
    const slotEnd = 13 * 60;
    const saturday = 6;
    const sunday = 0;
    const timeSlots = [
      new TimeSlot({
        id: 'slot_sat',
        dayOfWeek: saturday,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
      }),
      new TimeSlot({
        id: 'slot_sun',
        dayOfWeek: sunday,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
      }),
    ];

    const league = new League({
      id: 'league_slots',
      name: 'Weekend League',
      start,
      end,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: true,
      setDurationMinutes: 20,
      setsPerMatch: 3,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);

    const weekendDays = new Set([saturday, sunday]);
    for (const match of scheduled.matches) {
      expect(match.field).toBeTruthy();
      expect(weekendDays.has(match.start.getDay())).toBe(true);
      expect(match.start.getHours()).toBeGreaterThanOrEqual(9);
      const endHour = match.end.getHours();
      const endMinute = match.end.getMinutes();
      expect(endHour < 13 || (endHour === 13 && endMinute === 0)).toBe(true);
    }

    const threeWeeksMs = 3 * 7 * 24 * 60 * 60 * 1000;
    const maxStart = Math.max(...scheduled.matches.map((match) => match.start.getTime()));
    expect(maxStart).toBeGreaterThanOrEqual(start.getTime() + threeWeeksMs);
  });
});

