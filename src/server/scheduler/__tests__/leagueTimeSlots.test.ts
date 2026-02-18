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

const buildTeamsForDivision = (prefix: string, count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `${prefix}_team_${i}`;
    teams[id] = new Team({
      id,
      seed: i,
      captainId: `captain_${prefix}_${i}`,
      division,
      name: `${prefix} Team ${i}`,
      matches: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

describe('league scheduling (time slots)', () => {
  it('rejects schedulable events with fixed end windows when end is not after start', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);

    const league = new League({
      id: 'league_fixed_invalid_window',
      name: 'Invalid Fixed Window League',
      start,
      end: start,
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      'End date/time must be after start date/time',
    );
  });

  it('allows open-ended schedules to continue past the stored end date/time when enabled', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 11, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_open_ended',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
      }),
    ];

    const league = new League({
      id: 'league_open_ended_window',
      name: 'Open Ended Window League',
      start,
      end,
      noFixedEndDateTime: true,
      maxParticipants: 4,
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
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);
    const latestStart = Math.max(...scheduled.matches.map((match) => match.start.getTime()));
    expect(latestStart).toBeGreaterThan(end.getTime());
  });

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

  it('schedules regular-season matches within each division when singleDivision is disabled', () => {
    const beginner = new Division('beginner', 'Beginner');
    const intermediate = new Division('intermediate', 'Intermediate');
    const advanced = new Division('advanced', 'Advanced');

    const fieldBeginner = buildFieldById('field_beginner', beginner);
    const fieldIntermediate = buildFieldById('field_intermediate', intermediate);
    const fieldAdvanced = buildFieldById('field_advanced', advanced);

    const teams = {
      ...buildTeamsForDivision('beginner', 2, beginner),
      ...buildTeamsForDivision('intermediate', 2, intermediate),
      ...buildTeamsForDivision('advanced', 2, advanced),
    };

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 1, 28, 13, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_beginner',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_beginner',
        divisions: [beginner],
      }),
      new TimeSlot({
        id: 'slot_intermediate',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_intermediate',
        divisions: [intermediate],
      }),
      new TimeSlot({
        id: 'slot_advanced',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_advanced',
        divisions: [advanced],
      }),
    ];

    const league = new League({
      id: 'league_multi_division_regular_season',
      name: 'Multi Division League',
      start,
      end,
      maxParticipants: 6,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [beginner, intermediate, advanced],
      referees: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldIntermediate.id]: fieldIntermediate,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots,
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
    expect(scheduled.matches.length).toBe(3);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      const team1Division = match.team1?.division.id;
      const team2Division = match.team2?.division.id;
      expect(team1Division).toBeTruthy();
      expect(team2Division).toBeTruthy();
      expect(team1Division).toBe(team2Division);
      expect(match.division.id).toBe(team1Division);
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(1);
    expect(divisionCounts.get('intermediate')).toBe(1);
    expect(divisionCounts.get('advanced')).toBe(1);
  });

  it('distributes placeholder teams across divisions when singleDivision is disabled', () => {
    const beginner = new Division('beginner', 'Beginner');
    const intermediate = new Division('intermediate', 'Intermediate');
    const advanced = new Division('advanced', 'Advanced');

    const fieldBeginner = buildFieldById('field_beginner', beginner);
    const fieldIntermediate = buildFieldById('field_intermediate', intermediate);
    const fieldAdvanced = buildFieldById('field_advanced', advanced);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 1, 28, 13, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_beginner_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_beginner',
        divisions: [beginner],
      }),
      new TimeSlot({
        id: 'slot_intermediate_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_intermediate',
        divisions: [intermediate],
      }),
      new TimeSlot({
        id: 'slot_advanced_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_advanced',
        divisions: [advanced],
      }),
    ];

    const league = new League({
      id: 'league_multi_division_placeholders',
      name: 'Multi Division Placeholders League',
      start,
      end,
      maxParticipants: 6,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [beginner, intermediate, advanced],
      referees: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldIntermediate.id]: fieldIntermediate,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots,
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
    expect(scheduled.matches.length).toBe(3);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(1);
    expect(divisionCounts.get('intermediate')).toBe(1);
    expect(divisionCounts.get('advanced')).toBe(1);
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

  it('does not inflate placeholder team counts in failure messages after retries', () => {
    const rec = new Division('rec', 'Rec');
    const open = new Division('open', 'Open');
    const fieldRec = buildFieldById('field_rec', rec);
    const fieldOpen = buildFieldById('field_open', open);
    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_retry_placeholder_growth',
      name: 'Retry Placeholder Growth',
      start,
      end,
      maxParticipants: 10,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [rec, open],
      referees: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      /Approximate matches needed: 54\./,
    );
  });
});
