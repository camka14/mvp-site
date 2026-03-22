import { rescheduleEventMatchesPreservingLocks } from '../reschedulePreservingLocks';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
} from '../types';

const createMatch = (params: {
  id: string;
  matchId: number;
  start: Date;
  end: Date;
  locked?: boolean;
  field: PlayingField;
  division: Division;
  team1: Team;
  team2: Team;
  eventId: string;
}) =>
  new Match({
    id: params.id,
    matchId: params.matchId,
    locked: params.locked ?? false,
    team1: params.team1,
    team2: params.team2,
    team1Points: [0, 0, 0],
    team2Points: [0, 0, 0],
    start: params.start,
    end: params.end,
    losersBracket: false,
    division: params.division,
    field: params.field,
    setResults: [0, 0, 0],
    bufferMs: 5 * MINUTE_MS,
    side: null,
    officialCheckedIn: false,
    eventId: params.eventId,
  });

describe('rescheduleEventMatchesPreservingLocks', () => {
  it('keeps locked matches fixed and warns when they are outside the updated window', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_1',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const team1 = new Team({
      id: 'team_1',
      captainId: 'captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'team_2',
      captainId: 'captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'team_3',
      captainId: 'captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'team_4',
      captainId: 'captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T18:00:00.000Z');
    const lockedStart = new Date('2026-03-02T08:00:00.000Z');
    const lockedEnd = new Date('2026-03-02T09:00:00.000Z');

    const lockedMatch = createMatch({
      id: 'match_locked',
      matchId: 1,
      start: lockedStart,
      end: lockedEnd,
      locked: true,
      field,
      division,
      team1,
      team2,
      eventId: 'event_1',
    });
    const unlockedMatchOne = createMatch({
      id: 'match_2',
      matchId: 2,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_1',
    });
    const unlockedMatchTwo = createMatch({
      id: 'match_3',
      matchId: 3,
      start: new Date('2026-03-02T11:05:00.000Z'),
      end: new Date('2026-03-02T12:05:00.000Z'),
      field,
      division,
      team1,
      team2: team3,
      eventId: 'event_1',
    });

    const event = new League({
      id: 'event_1',
      name: 'Test League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatchOne.id]: unlockedMatchOne,
        [unlockedMatchTwo.id]: unlockedMatchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_1',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const matchMap = new Map(result.matches.map((match) => [match.id, match]));
    const locked = matchMap.get('match_locked');
    const match2 = matchMap.get('match_2');
    const match3 = matchMap.get('match_3');

    expect(locked).toBeDefined();
    expect(match2).toBeDefined();
    expect(match3).toBeDefined();
    expect(locked?.start.toISOString()).toBe(lockedStart.toISOString());
    expect(locked?.end.toISOString()).toBe(lockedEnd.toISOString());
    expect(locked?.locked).toBe(true);
    expect(locked?.field?.id).toBe('field_1');

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('LOCKED_MATCH_OUTSIDE_WINDOW');
    expect(result.warnings[0]?.matchIds).toEqual(['match_locked']);

    expect(match2!.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(match3!.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(match2!.end.getTime()).toBeLessThanOrEqual(eventEnd.getTime());
    expect(match3!.end.getTime()).toBeLessThanOrEqual(eventEnd.getTime());
  });

  it('reschedules non-repeating slots when field rental slots mirror event availability', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_non_repeating',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Non-Repeating',
    });

    const team1 = new Team({
      id: 'nr_team_1',
      captainId: 'nr_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'nr_team_2',
      captainId: 'nr_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'nr_team_3',
      captainId: 'nr_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'nr_team_4',
      captainId: 'nr_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const slotStart = new Date('2026-03-08T16:00:00.000Z');
    const slotEnd = new Date('2026-03-09T02:00:00.000Z');
    const mirroredSlot = new TimeSlot({
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
    field.rentalSlots = [mirroredSlot];

    const unscheduledStart = new Date('2026-03-08T16:18:00.000Z');
    const matchOne = createMatch({
      id: 'nr_match_1',
      matchId: 1,
      start: unscheduledStart,
      end: unscheduledStart,
      field,
      division,
      team1,
      team2,
      eventId: 'event_non_repeating',
    });
    const matchTwo = createMatch({
      id: 'nr_match_2',
      matchId: 2,
      start: unscheduledStart,
      end: unscheduledStart,
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_non_repeating',
    });

    const event = new League({
      id: 'event_non_repeating',
      name: 'Non-Repeating League',
      description: '',
      start: slotStart,
      end: unscheduledStart,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [matchOne.id]: matchOne,
        [matchTwo.id]: matchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      noFixedEndDateTime: true,
      restTimeMinutes: 5,
      timeSlots: [mirroredSlot],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toEqual([]);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every((match) => match.field?.id === field.id)).toBe(true);
    expect(result.matches.every((match) => match.end.getTime() - match.start.getTime() >= 5 * MINUTE_MS)).toBe(true);
    expect(result.matches.every((match) => match.start.getTime() >= slotStart.getTime())).toBe(true);
    expect(result.matches.every((match) => match.end.getTime() <= slotEnd.getTime())).toBe(true);
  });

  it('does not warn when a locked match is within a secondary day in daysOfWeek', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_multi_day',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Multi Day',
    });
    const team1 = new Team({
      id: 'multi_day_team_1',
      captainId: 'multi_day_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'multi_day_team_2',
      captainId: 'multi_day_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'multi_day_team_3',
      captainId: 'multi_day_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'multi_day_team_4',
      captainId: 'multi_day_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date(2026, 2, 2, 9, 0, 0);
    const eventEnd = new Date(2026, 2, 4, 18, 0, 0);

    const lockedMatch = createMatch({
      id: 'match_locked_multi_day',
      matchId: 1,
      start: new Date(2026, 2, 3, 10, 0, 0),
      end: new Date(2026, 2, 3, 11, 0, 0),
      locked: true,
      field,
      division,
      team1,
      team2,
      eventId: 'event_multi_day',
    });
    const unlockedMatch = createMatch({
      id: 'match_unlocked_multi_day',
      matchId: 2,
      start: new Date(2026, 2, 2, 10, 0, 0),
      end: new Date(2026, 2, 2, 11, 0, 0),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_multi_day',
    });

    const event = new League({
      id: 'event_multi_day',
      name: 'Multi-day lock league',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatch.id]: unlockedMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_day',
          dayOfWeek: 0,
          daysOfWeek: [0, 1],
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not warn when a locked match is within a secondary field in slot fieldIds', () => {
    const division = new Division('open', 'Open');
    const fieldOne = new PlayingField({
      id: 'field_multi_1',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court A',
    });
    const fieldTwo = new PlayingField({
      id: 'field_multi_2',
      fieldNumber: 2,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court B',
    });
    const team1 = new Team({
      id: 'multi_field_team_1',
      captainId: 'multi_field_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'multi_field_team_2',
      captainId: 'multi_field_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'multi_field_team_3',
      captainId: 'multi_field_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'multi_field_team_4',
      captainId: 'multi_field_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date(2026, 2, 2, 9, 0, 0);
    const eventEnd = new Date(2026, 2, 2, 18, 0, 0);

    const lockedMatch = createMatch({
      id: 'match_locked_multi_field',
      matchId: 1,
      start: new Date(2026, 2, 2, 10, 0, 0),
      end: new Date(2026, 2, 2, 11, 0, 0),
      locked: true,
      field: fieldTwo,
      division,
      team1,
      team2,
      eventId: 'event_multi_field',
    });
    const unlockedMatch = createMatch({
      id: 'match_unlocked_multi_field',
      matchId: 2,
      start: new Date(2026, 2, 2, 11, 5, 0),
      end: new Date(2026, 2, 2, 12, 5, 0),
      field: fieldOne,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_multi_field',
    });

    const event = new League({
      id: 'event_multi_field',
      name: 'Multi-field lock league',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [fieldOne.id]: fieldOne,
        [fieldTwo.id]: fieldTwo,
      },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatch.id]: unlockedMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_field',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          fieldIds: [fieldOne.id, fieldTwo.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toHaveLength(0);
  });

  it('reschedules split-playoff matches when playoff slots are inherited from source divisions', () => {
    const playoffDivisionId = 'e7c5bb6f-1529-46c3-ab2b-9d35d135427d__division__playoff_2';
    const regularDivision = new Division(
      'e7c5bb6f-1529-46c3-ab2b-9d35d135427d',
      'Regular',
      [],
      null,
      4,
      2,
      'LEAGUE',
      [playoffDivisionId],
    );
    const playoffDivision = new Division(
      playoffDivisionId,
      'Playoff 2',
      [],
      null,
      4,
      null,
      'PLAYOFF',
    );

    const field = new PlayingField({
      id: 'field_split_playoff',
      fieldNumber: 1,
      divisions: [regularDivision, playoffDivision],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Split',
    });

    const team1 = new Team({
      id: 'split_team_1',
      captainId: 'split_captain_1',
      division: playoffDivision,
      name: 'Split Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'split_team_2',
      captainId: 'split_captain_2',
      division: playoffDivision,
      name: 'Split Team 2',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-30T20:00:00.000Z');

    const playoffMatch = createMatch({
      id: 'match_split_playoff',
      matchId: 1,
      start: new Date('2026-03-03T10:00:00.000Z'),
      end: new Date('2026-03-03T11:00:00.000Z'),
      field,
      division: playoffDivision,
      team1,
      team2,
      eventId: 'event_split_playoff',
    });

    const event = new League({
      id: 'event_split_playoff',
      name: 'Split Playoff Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 2,
      teamSignup: true,
      divisions: [regularDivision],
      playoffDivisions: [playoffDivision],
      splitLeaguePlayoffDivisions: true,
      fields: { [field.id]: field },
      matches: {
        [playoffMatch.id]: playoffMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 2,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_regular_only',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [regularDivision],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const scheduled = result.matches.find((match) => match.id === playoffMatch.id);

    expect(scheduled).toBeDefined();
    expect(scheduled?.field?.id).toBe(field.id);
    expect(scheduled?.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(result.warnings).toHaveLength(0);
    expect(event.timeSlots[0]?.divisions.some((division) => division.id === playoffDivisionId)).toBe(true);
  });

  it('preserves dependent assignments when upstream winners are unresolved', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_dependency',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Dependency',
    });

    const teamA = new Team({
      id: 'team_a',
      captainId: 'captain_a',
      division,
      name: 'Team A',
      matches: [],
      playerIds: [],
    });
    const teamB = new Team({
      id: 'team_b',
      captainId: 'captain_b',
      division,
      name: 'Team B',
      matches: [],
      playerIds: [],
    });
    const teamC = new Team({
      id: 'team_c',
      captainId: 'captain_c',
      division,
      name: 'Team C',
      matches: [],
      playerIds: [],
    });
    const teamD = new Team({
      id: 'team_d',
      captainId: 'captain_d',
      division,
      name: 'Team D',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T16:00:00.000Z');

    const lockedMatch = createMatch({
      id: 'match_locked_dependency',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      locked: true,
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_dependency',
    });
    lockedMatch.setResults = [1, 1, 1];

    const qualifierMatch = createMatch({
      id: 'match_qualifier',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: teamC,
      team2: teamD,
      eventId: 'event_dependency',
    });
    qualifierMatch.setResults = [0, 0, 0];

    const dependentMatch = createMatch({
      id: 'match_dependent',
      matchId: 3,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_dependency',
    });
    dependentMatch.setResults = [0, 0, 0];
    dependentMatch.team1Seed = 11;
    dependentMatch.team2Seed = 12;
    dependentMatch.previousLeftMatch = qualifierMatch;
    qualifierMatch.winnerNextMatch = dependentMatch;

    const event = new League({
      id: 'event_dependency',
      name: 'Dependency Cleanup League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [teamA.id]: teamA,
        [teamB.id]: teamB,
        [teamC.id]: teamC,
        [teamD.id]: teamD,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [qualifierMatch.id]: qualifierMatch,
        [dependentMatch.id]: dependentMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 2,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_dependency',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 16 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const rescheduledDependent = result.matches.find((match) => match.id === dependentMatch.id);

    expect(rescheduledDependent).toBeDefined();
    expect(rescheduledDependent?.team1?.id).toBe(teamA.id);
    expect(rescheduledDependent?.team2?.id).toBe(teamB.id);
    expect(rescheduledDependent?.team1Seed).toBe(11);
    expect(rescheduledDependent?.team2Seed).toBe(12);
  });

  it('extends open-ended reschedule windows so matches can spill into later weeks', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_open_ended',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Open Ended',
    });

    const team1 = new Team({
      id: 'open_team_1',
      captainId: 'open_captain_1',
      division,
      name: 'Open Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'open_team_2',
      captainId: 'open_captain_2',
      division,
      name: 'Open Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'open_team_3',
      captainId: 'open_captain_3',
      division,
      name: 'Open Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'open_team_4',
      captainId: 'open_captain_4',
      division,
      name: 'Open Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const originalEventEnd = new Date('2026-03-02T18:00:00.000Z');

    const matchOne = createMatch({
      id: 'match_open_1',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1,
      team2,
      eventId: 'event_open_ended',
    });
    const matchTwo = createMatch({
      id: 'match_open_2',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_open_ended',
    });

    const event = new League({
      id: 'event_open_ended',
      name: 'Open Ended League',
      description: '',
      start: eventStart,
      end: originalEventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [matchOne.id]: matchOne,
        [matchTwo.id]: matchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      noFixedEndDateTime: true,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_open_ended',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: null,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const sorted = [...result.matches].sort((left, right) => (left.matchId ?? 0) - (right.matchId ?? 0));

    expect(sorted).toHaveLength(2);
    expect(sorted[0]?.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect((sorted[0]?.end.getTime() ?? 0) - (sorted[0]?.start.getTime() ?? 0)).toBe(60 * MINUTE_MS);
    const matchGapMs = (sorted[1]?.start.getTime() ?? 0) - (sorted[0]?.start.getTime() ?? 0);
    expect(matchGapMs).toBeGreaterThanOrEqual(6 * 24 * 60 * MINUTE_MS);
    expect(matchGapMs).toBeLessThanOrEqual(8 * 24 * 60 * MINUTE_MS);
    expect(result.event.end.getTime()).toBe(sorted[1]?.end.getTime());
    expect(result.event.end.getTime()).toBeGreaterThan(originalEventEnd.getTime());
    expect(result.warnings).toHaveLength(0);
  });

  it('reassigns missing official and team officials when rescheduling tournament matches', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_tournament_refs',
      fieldNumber: 1,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Tournament',
    });

    const makeTeam = (id: string, name: string) => new Team({
      id,
      captainId: '',
      division,
      name,
      matches: [],
      playerIds: [],
    });

    const team1 = makeTeam('team_1', 'Team 1');
    const team2 = makeTeam('team_2', 'Team 2');
    const team3 = makeTeam('team_3', 'Team 3');
    const team4 = makeTeam('team_4', 'Team 4');
    const team5 = makeTeam('team_5', 'Team 5');
    const team6 = makeTeam('team_6', 'Team 6');

    const official1 = new UserData({
      id: 'official_1',
      firstName: 'Official',
      lastName: 'One',
      matches: [],
      divisions: [division],
    });
    const official2 = new UserData({
      id: 'official_2',
      firstName: 'Official',
      lastName: 'Two',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T15:00:00.000Z');

    const match1 = createMatch({
      id: 'match_tourny_1',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1,
      team2,
      eventId: 'event_tourny',
    });
    const match2 = createMatch({
      id: 'match_tourny_2',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_tourny',
    });
    const match3 = createMatch({
      id: 'match_tourny_3',
      matchId: 3,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: team5,
      team2: team6,
      eventId: 'event_tourny',
    });

    const tournament = new Tournament({
      id: 'event_tourny',
      name: 'Tournament Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
        [team5.id]: team5,
        [team6.id]: team6,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 6,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
        [match3.id]: match3,
      },
      officials: [official1, official2],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: true,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_tournament_refs',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 15 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings).toHaveLength(0);

    const validOfficialIds = new Set(['official_1', 'official_2']);
    for (const match of result.matches) {
      expect(match.official?.id).toBeTruthy();
      expect(validOfficialIds.has(match.official?.id ?? '')).toBe(true);
      expect(match.teamOfficial?.id).toBeTruthy();
      expect(match.teamOfficial?.id).not.toBe(match.team1?.id);
      expect(match.teamOfficial?.id).not.toBe(match.team2?.id);
    }
  });
});
