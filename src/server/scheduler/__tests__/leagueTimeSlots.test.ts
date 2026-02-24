/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, League, MINUTE_MS, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

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
  it('uses zero rest time as-is without applying an implicit default gap', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 14, 0, 0);
    const timeSlots = [
      new TimeSlot({
        id: 'slot_no_default_rest',
        dayOfWeek: 5, // Saturday
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 14 * 60,
      }),
    ];

    const league = new League({
      id: 'league_no_default_rest_gap',
      name: 'No Default Rest Gap League',
      start,
      end,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsRef: false,
      gamesPerOpponent: 2,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(2);

    const matchesByStart = [...scheduled.matches]
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const gapMs = matchesByStart[1].start.getTime() - matchesByStart[0].end.getTime();
    expect(gapMs).toBe(0 * MINUTE_MS);
  });

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

  it('schedules matches within explicit non-repeating start/end datetime slots', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const eventStart = new Date(2026, 0, 3, 8, 0, 0);
    const eventEnd = new Date(2026, 0, 3, 20, 0, 0);
    const slotStart = new Date(2026, 0, 3, 10, 0, 0);
    const slotEnd = new Date(2026, 0, 3, 12, 0, 0);

    const league = new League({
      id: 'league_non_repeating_window_fit',
      name: 'Non Repeating Window Fit',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_non_repeat_fit',
          dayOfWeek: 5,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
        }),
      ],
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
    expect(scheduled.matches).toHaveLength(1);
    const [match] = scheduled.matches;
    expect(match.start.getTime()).toBeGreaterThanOrEqual(slotStart.getTime());
    expect(match.end.getTime()).toBeLessThanOrEqual(slotEnd.getTime());
  });

  it('errors when matches cannot fit within a non-repeating slot hard end datetime', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const eventStart = new Date(2026, 0, 3, 8, 0, 0);
    const eventEnd = new Date(2026, 0, 3, 20, 0, 0);
    const slotStart = new Date(2026, 0, 3, 10, 0, 0);
    const slotEnd = new Date(2026, 0, 3, 12, 0, 0);

    const league = new League({
      id: 'league_non_repeating_window_overflow',
      name: 'Non Repeating Window Overflow',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_non_repeat_overflow',
          dayOfWeek: 5,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
        }),
      ],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(/provided time slots/i);
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

  it('uses division max participants for placeholder capacity in multi-division leagues', () => {
    const beginner = new Division('beginner', 'Beginner', [], null, 4);
    const advanced = new Division('advanced', 'Advanced', [], null, 2);

    const fieldBeginner = buildFieldById('field_beginner_targeted', beginner);
    const fieldAdvanced = buildFieldById('field_advanced_targeted', advanced);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 2, 31, 21, 0, 0);

    const league = new League({
      id: 'league_multi_division_capacity_targets',
      name: 'Division Capacity Targets League',
      start,
      end,
      maxParticipants: 40,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [beginner, advanced],
      referees: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_beginner_targeted',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          field: fieldBeginner.id,
          divisions: [beginner],
        }),
        new TimeSlot({
          id: 'slot_advanced_targeted',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          field: fieldAdvanced.id,
          divisions: [advanced],
        }),
      ],
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
    expect(scheduled.matches.length).toBe(7);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(6);
    expect(divisionCounts.get('advanced')).toBe(1);
  });

  it('uses per-division playoff team count when divisions are separate', () => {
    const rec = new Division('rec', 'Rec', [], null, 4, 3);
    const open = new Division('open', 'Open', [], null, 4, 4);
    const fieldRec = buildFieldById('field_rec_playoff_counts', rec);
    const fieldOpen = buildFieldById('field_open_playoff_counts', open);

    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_per_division_playoff_count',
      name: 'Per Division Playoff Count',
      start,
      end,
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [rec, open],
      referees: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec_playoff_counts',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open_playoff_counts',
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

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(17);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('rec')).toBe(8);
    expect(divisionCounts.get('open')).toBe(9);
  });

  it('schedules playoffs for odd per-division team counts derived from placeholder capacity', () => {
    const rec = new Division('rec', 'Rec');
    const open = new Division('open', 'Open');
    const fieldRec = buildFieldById('field_rec', rec);
    const fieldOpen = buildFieldById('field_open', open);

    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_odd_division_playoffs',
      name: 'Odd Division Playoffs',
      start,
      end,
      noFixedEndDateTime: false,
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

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);
    expect(scheduled.matches.every((match) => match.division.id === 'rec' || match.division.id === 'open')).toBe(true);
  });

  it('schedules split playoff divisions when playoff timeslots are provided', () => {
    const mixedAge = new Division('mixed_age', 'Mixed Age', [], null, 4, 2, 'LEAGUE');
    const mixedAgePlayoff = new Division('mixed_age_playoff', 'Mixed Age Playoff', [], null, 4, null, 'PLAYOFF');
    const fieldRegular = buildFieldById('field_mixed_age_regular', mixedAge);
    const fieldPlayoff = buildFieldById('field_mixed_age_playoff', mixedAgePlayoff);
    const teams = buildTeams(4, mixedAge);

    const league = new League({
      id: 'league_split_playoff_division_timeslots',
      name: 'Split Playoff Division Timeslots',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 4,
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
        [fieldPlayoff.id]: fieldPlayoff,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_mixed_age_regular',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
        new TimeSlot({
          id: 'slot_mixed_age_playoff',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldPlayoff.id,
          divisions: [mixedAgePlayoff],
        }),
      ],
      doTeamsRef: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 2,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => match.division.id === mixedAgePlayoff.id);

    expect(playoffMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.every((match) => match.field?.id === fieldPlayoff.id)).toBe(true);
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

  it('surfaces division names (not ids) in no-field scheduling errors', () => {
    const playoffDivisionId = '1bc2cc2d-0ef5-4b83-839b-dcce8e7e0bd3__division__playoff_1';
    const playoffDivision = new Division(playoffDivisionId, 'Playoff Division 1');
    const advancedDivision = new Division('ADVANCED', 'Advanced');
    const field = buildField(advancedDivision);
    const teams = buildTeams(4, playoffDivision);

    const league = new League({
      id: 'league_missing_fields_named',
      name: 'Missing Fields Named League',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 10, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [playoffDivision],
      referees: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_named',
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

    try {
      scheduleEvent({ event: league }, context);
      fail('Expected scheduleEvent to throw a no-field configuration error.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('Playoff Division 1');
      expect(message).not.toContain(playoffDivisionId);
    }
  });

  it('schedules placeholder-backed multi-division leagues without leaking synthetic teams', () => {
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

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);
    expect(Object.keys((scheduled.event as League).teams)).toHaveLength(0);
    expect(scheduled.matches.every((match) => !match.team1 || !match.team1.id.startsWith('placeholder-'))).toBe(true);
    expect(scheduled.matches.every((match) => !match.team2 || !match.team2.id.startsWith('placeholder-'))).toBe(true);
  });
});
