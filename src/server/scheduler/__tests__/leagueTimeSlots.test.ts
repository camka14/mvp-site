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

    const weekendDays = new Set([6, 0]); // JS Date#getDay() indexes (0=Sun ... 6=Sat)
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

  it('supports multi-day weekly slot input via daysOfWeek on a single slot row', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);

    // Jan 3, 2026 is a Saturday.
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 10, 13, 0, 0);

    const saturdaySlotDay = 5; // Monday-based index (0=Mon ... 6=Sun)
    const sundaySlotDay = 6;
    const multiDaySlot = new TimeSlot({
      id: 'slot_multi',
      dayOfWeek: saturdaySlotDay,
      startDate: new Date(2026, 0, 3),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
    }) as TimeSlot & { daysOfWeek?: number[] };
    multiDaySlot.daysOfWeek = [sundaySlotDay, saturdaySlotDay];

    const league = new League({
      id: 'league_multi_day_slot',
      name: 'Weekend Multi-Day League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [multiDaySlot],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);

    const scheduledDays = new Set(scheduled.matches.map((match) => match.start.getDay()));
    expect(scheduledDays.has(6)).toBe(true);
    expect(scheduledDays.has(0)).toBe(true);
  });

  it('supports timeslots that reference multiple fields via scheduledFieldIds', () => {
    const division = buildDivision();
    const fieldA = buildFieldById('field_1', division);
    const fieldB = buildFieldById('field_2', division);
    const teams = buildTeams(4, division);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 10, 13, 0, 0);

    const multiFieldSlot = new TimeSlot({
      id: 'slot_multi_field',
      dayOfWeek: 5,
      startDate: new Date(2026, 0, 3),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
    }) as TimeSlot & { scheduledFieldIds?: string[] };
    multiFieldSlot.field = null;
    multiFieldSlot.scheduledFieldIds = ['field_1', 'field_2'];

    const league = new League({
      id: 'league_multi_field_slot',
      name: 'Multi-field Slot League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [fieldA.id]: fieldA, [fieldB.id]: fieldB },
      timeSlots: [multiFieldSlot],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);
    const usedFields = new Set(scheduled.matches.map((match) => match.field?.id).filter(Boolean));
    expect(usedFields.has('field_1')).toBe(true);
    expect(usedFields.has('field_2')).toBe(true);
  });

  it('surfaces a configuration error when selected divisions have no available fields', () => {
    const openDivision = new Division('OPEN', 'Open');
    const advancedDivision = new Division('ADVANCED', 'Advanced');
    const field = buildField(advancedDivision);
    const teams = buildTeams(4, openDivision);

    const league = new League({
      id: 'league_missing_fields',
      name: 'Missing Fields League',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 10, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [openDivision],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_open',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          divisions: [advancedDivision],
        }),
      ],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      /no fields are available.*OPEN/i,
    );
  });
});
