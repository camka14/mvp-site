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
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
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
      captainId: `captain_${prefix}_${i}`,
      division,
      name: `${prefix} Team ${i}`,
      matches: [],
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
      doTeamsOfficiate: false,
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

  it('schedules non-repeating slots even when fields contain mirrored rental slot records', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(8, division);

    const slotStart = new Date('2026-03-08T16:00:00.000Z');
    const slotEnd = new Date('2026-03-09T02:00:00.000Z');
    const nonRepeatingSlot = new TimeSlot({
      id: 'slot_non_repeating',
      dayOfWeek: 6,
      daysOfWeek: [6],
      startDate: slotStart,
      endDate: slotEnd,
      repeating: false,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 19 * 60,
      field: field.id,
      fieldIds: [field.id],
      divisions: [division],
    });
    // Repository hydration mirrors event time slots onto field rental slots.
    field.rentalSlots = [nonRepeatingSlot];

    const tournament = new Tournament({
      id: 'tournament_non_repeating_slots',
      name: 'Non-Repeating Tournament',
      start: slotStart,
      end: new Date('2026-03-08T16:18:00.000Z'),
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [division],
      fields: { [field.id]: field },
      timeSlots: [nonRepeatingSlot],
      doTeamsOfficiate: false,
      noFixedEndDateTime: true,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: true,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    expect(scheduled.matches).toHaveLength(7);
    expect(scheduled.matches.every((match) => Boolean(match.field))).toBe(true);
    expect(scheduled.matches.every((match) => match.end.getTime() > match.start.getTime())).toBe(true);
    expect(scheduled.matches.every((match) => match.start.getTime() >= slotStart.getTime())).toBe(true);
    expect(scheduled.matches.every((match) => match.end.getTime() <= slotEnd.getTime())).toBe(true);
  });

  it('uses non-repeating slot minutes in the slot timezone when explicit boundaries are shifted', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const shiftedStart = new Date('2026-07-12T03:00:00.000Z');
    const shiftedEnd = new Date('2026-07-12T09:00:00.000Z');
    const nonRepeatingSlot = new TimeSlot({
      id: 'slot_shifted_non_repeating',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: shiftedStart,
      endDate: shiftedEnd,
      repeating: false,
      startTimeMinutes: 13 * 60,
      endTimeMinutes: 19 * 60,
      field: field.id,
      fieldIds: [field.id],
      divisions: [division],
      timeZone: 'America/Los_Angeles',
    });

    const tournament = new Tournament({
      id: 'tournament_shifted_non_repeating_slots',
      name: 'Shifted Non-Repeating Tournament',
      start: new Date('2026-07-11T08:00:00.000Z'),
      end: new Date('2026-07-12T10:00:00.000Z'),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [division],
      fields: { [field.id]: field },
      timeSlots: [nonRepeatingSlot],
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: true,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);

    expect(scheduled.matches.length).toBeGreaterThan(0);
    expect(scheduled.matches[0].start.toISOString()).toBe('2026-07-11T20:00:00.000Z');
    expect(scheduled.matches[0].end.toISOString()).toBe('2026-07-11T20:20:00.000Z');
  });

  it('expands a stale fixed event window to cover explicit non-repeating slots', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const nonRepeatingSlot = new TimeSlot({
      id: 'slot_after_event_window',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: new Date('2026-07-11T16:00:00.000Z'),
      endDate: new Date('2026-07-11T19:00:00.000Z'),
      repeating: false,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 12 * 60,
      field: field.id,
      fieldIds: [field.id],
      divisions: [division],
      timeZone: 'America/Los_Angeles',
    });

    const tournament = new Tournament({
      id: 'tournament_stale_event_window',
      name: 'Stale Event Window Tournament',
      start: new Date('2026-07-10T11:00:00.000Z'),
      end: new Date('2026-07-10T22:00:00.000Z'),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [division],
      fields: { [field.id]: field },
      timeSlots: [nonRepeatingSlot],
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: true,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);

    expect(scheduled.event.start.toISOString()).toBe('2026-07-11T16:00:00.000Z');
    expect(scheduled.event.end.toISOString()).toBe('2026-07-11T19:00:00.000Z');
    expect(scheduled.matches.length).toBeGreaterThan(0);
    expect(scheduled.matches[0].start.toISOString()).toBe('2026-07-11T16:00:00.000Z');
  });

  it('lets generated pool divisions inherit bracket time slots and use pool division schedule config', () => {
    const bracketDivision = new Division(
      'tournament_bracket_open',
      'CoEd Open',
      [],
      null,
      4,
      4,
      'PLAYOFF',
    );
    const poolA = new Division(
      'tournament_bracket_open_pool_a',
      'Pool A',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [bracketDivision.id, bracketDivision.id],
    );
    const poolB = new Division(
      'tournament_bracket_open_pool_b',
      'Pool B',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [bracketDivision.id, bracketDivision.id],
    );
    poolA.leagueConfig = {
      gamesPerOpponent: 2,
      usesSets: true,
      setsPerMatch: 3,
      setDurationMinutes: 5,
      pointsToVictory: [11, 11, 11],
      restTimeMinutes: 45,
    };
    poolB.leagueConfig = {
      gamesPerOpponent: 2,
      usesSets: true,
      setsPerMatch: 3,
      setDurationMinutes: 0,
      pointsToVictory: [11, 11, 11],
      restTimeMinutes: 45,
    };
    const field = buildField(bracketDivision);
    const teams = {
      ...buildTeamsForDivision('pool_a', 2, poolA),
      ...buildTeamsForDivision('pool_b', 2, poolB),
    };

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const timeSlot = new TimeSlot({
      id: 'slot_bracket_only',
      dayOfWeek: 5,
      startDate: start,
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 17 * 60,
      fieldIds: [field.id],
      divisions: [bracketDivision],
    });

    const tournament = new Tournament({
      id: 'tournament_pool_time_slot_inheritance',
      name: 'Pool Play Tournament',
      start,
      end: new Date(2026, 0, 3, 17, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [poolA, poolB],
      playoffDivisions: [bracketDivision],
      includePlayoffs: true,
      fields: { [field.id]: field },
      timeSlots: [timeSlot],
      doTeamsOfficiate: false,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: true,
      setsPerMatch: 1,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);

    expect(timeSlot.divisions.map((division) => division.id)).toEqual([
      bracketDivision.id,
      poolA.id,
      poolB.id,
    ]);
    const poolMatches = scheduled.matches.filter((match) => (
      match.division.id === poolA.id || match.division.id === poolB.id
    ));
    expect(poolMatches).toHaveLength(4);
    expect(poolMatches.every((match) => match.team1Points.length === 3)).toBe(true);
    expect(poolMatches
      .filter((match) => match.division.id === poolA.id)
      .every((match) => match.end.getTime() - match.start.getTime() === 15 * 60 * 1000)).toBe(true);
    expect(poolMatches
      .filter((match) => match.division.id === poolB.id)
      .every((match) => match.end.getTime() - match.start.getTime() === 60 * 60 * 1000)).toBe(true);
    expect(scheduled.matches.some((match) => match.division.id === poolA.id)).toBe(true);
    expect(scheduled.matches.some((match) => match.division.id === poolB.id)).toBe(true);
    expect(scheduled.matches.filter((match) => match.division.id === bracketDivision.id)).toHaveLength(3);
  });

  it('uses event-level double elimination for single-division pool play', () => {
    const bracketDivision = new Division(
      'single_pool_bracket',
      'Open',
      [],
      null,
      4,
      4,
      'PLAYOFF',
    );
    bracketDivision.playoffConfig = {
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21],
      loserBracketPointsToVictory: [21],
      prize: '',
      fieldCount: 1,
      restTimeMinutes: 0,
      setDurationMinutes: 20,
    };
    const poolA = new Division(
      'single_pool_bracket_pool_a',
      'Pool A',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [bracketDivision.id, bracketDivision.id],
    );
    const poolB = new Division(
      'single_pool_bracket_pool_b',
      'Pool B',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [bracketDivision.id, bracketDivision.id],
    );
    poolA.leagueConfig = {
      gamesPerOpponent: 1,
      usesSets: true,
      setsPerMatch: 1,
      setDurationMinutes: 20,
      pointsToVictory: [21],
      restTimeMinutes: 0,
    };
    poolB.leagueConfig = { ...poolA.leagueConfig };
    const field = buildField(bracketDivision);
    const teams = {
      ...buildTeamsForDivision('single_pool_a', 2, poolA),
      ...buildTeamsForDivision('single_pool_b', 2, poolB),
    };
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const timeSlot = new TimeSlot({
      id: 'slot_single_pool_bracket',
      dayOfWeek: 5,
      startDate: start,
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 22 * 60,
      fieldIds: [field.id],
      divisions: [bracketDivision],
    });
    const tournament = new Tournament({
      id: 'single_division_pool_double_elimination',
      name: 'Single Division Pool Tournament',
      start,
      end: new Date(2026, 0, 3, 22, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      singleDivision: true,
      eventType: 'TOURNAMENT',
      teams,
      divisions: [poolA, poolB],
      playoffDivisions: [bracketDivision],
      includePlayoffs: true,
      playoffTeamCount: 4,
      fields: { [field.id]: field },
      timeSlots: [timeSlot],
      doTeamsOfficiate: false,
      doubleElimination: true,
      winnerSetCount: 3,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21, 21, 15],
      loserBracketPointsToVictory: [21],
      usesSets: true,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);

    const losersBracketMatches = scheduled.matches.filter((match) => match.losersBracket);
    expect(losersBracketMatches.length).toBeGreaterThan(0);
    expect(losersBracketMatches.every((match) => (
      match.end.getTime() - match.start.getTime() === 20 * 60 * 1000
    ))).toBe(true);
    expect(scheduled.matches.some((match) => (
      !match.losersBracket && match.end.getTime() - match.start.getTime() === 60 * 60 * 1000
    ))).toBe(true);
    expect(scheduled.matches.length).toBeGreaterThan(5);
  });

  it('removes stale generated placeholders before rebuilding tournament pool play', () => {
    const bracketDivision = new Division(
      'tournament_bracket_stale',
      'CoEd Open',
      [],
      null,
      4,
      2,
      'PLAYOFF',
    );
    const poolA = new Division(
      'tournament_bracket_stale_pool_a',
      'Pool A',
      [],
      null,
      2,
      1,
      'LEAGUE',
      [bracketDivision.id],
    );
    const poolB = new Division(
      'tournament_bracket_stale_pool_b',
      'Pool B',
      [],
      null,
      2,
      1,
      'LEAGUE',
      [bracketDivision.id],
    );
    const field = buildField(bracketDivision);

    const staleTeams: Record<string, Team> = {};
    for (let index = 1; index <= 4; index += 1) {
      const id = `stale_pool_a_${index}`;
      staleTeams[id] = new Team({
        id,
        captainId: '',
        division: poolA,
        name: `Place Holder ${index}`,
        matches: [],
      });
    }
    poolA.teamIds = Object.keys(staleTeams);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const timeSlot = new TimeSlot({
      id: 'slot_stale_placeholders',
      dayOfWeek: 5,
      startDate: start,
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 17 * 60,
      fieldIds: [field.id],
      divisions: [bracketDivision],
    });

    const tournament = new Tournament({
      id: 'tournament_pool_stale_placeholders',
      name: 'Pool Play Tournament',
      start,
      end: new Date(2026, 0, 3, 17, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: staleTeams,
      divisions: [poolA, poolB],
      playoffDivisions: [bracketDivision],
      includePlayoffs: true,
      fields: { [field.id]: field },
      timeSlots: [timeSlot],
      doTeamsOfficiate: false,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: true,
      setsPerMatch: 1,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    const teamCountsByDivision = Object.values(scheduled.event.teams).reduce<Record<string, number>>((counts, team) => {
      const divisionId = team.division.id;
      counts[divisionId] = (counts[divisionId] ?? 0) + 1;
      return counts;
    }, {});
    const matchCountsByDivision = scheduled.matches.reduce<Record<string, number>>((counts, match) => {
      counts[match.division.id] = (counts[match.division.id] ?? 0) + 1;
      return counts;
    }, {});

    expect(Object.keys(scheduled.event.teams).some((teamId) => teamId.startsWith('stale_pool_a_'))).toBe(false);
    expect(teamCountsByDivision[poolA.id]).toBe(2);
    expect(teamCountsByDivision[poolB.id]).toBe(2);
    expect(matchCountsByDivision[poolA.id]).toBe(1);
    expect(matchCountsByDivision[poolB.id]).toBe(1);
  });
});
