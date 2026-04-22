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
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court A',
    });
    const fieldTwo = new PlayingField({
      id: 'field_multi_2',
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

  it('moves a carried playoff seed back onto the open entrant slot when rescheduling', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_playoff_seed_normalization',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Playoff',
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

    const qualifierMatch = createMatch({
      id: 'match_playin',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_playoff_seed_normalization',
    });
    qualifierMatch.team1Seed = 8;
    qualifierMatch.team2Seed = 9;
    qualifierMatch.setResults = [0, 0, 0];

    const carriedMatch = createMatch({
      id: 'match_carry',
      matchId: 2,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: teamC,
      team2: teamD,
      eventId: 'event_playoff_seed_normalization',
    });
    carriedMatch.team1 = null;
    carriedMatch.team2 = null;
    carriedMatch.team1Seed = 1;
    carriedMatch.team2Seed = null;
    carriedMatch.previousLeftMatch = qualifierMatch;
    qualifierMatch.winnerNextMatch = carriedMatch;
    carriedMatch.setResults = [0, 0, 0];

    const event = new League({
      id: 'event_playoff_seed_normalization',
      name: 'Playoff Seed Normalization League',
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
        [qualifierMatch.id]: qualifierMatch,
        [carriedMatch.id]: carriedMatch,
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
      playoffTeamCount: 4,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_playoff_seed_normalization',
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
    const rescheduledCarry = result.matches.find((match) => match.id === carriedMatch.id);

    expect(rescheduledCarry).toBeDefined();
    expect(rescheduledCarry?.team1Seed).toBeNull();
    expect(rescheduledCarry?.team2Seed).toBe(1);
    expect(rescheduledCarry?.previousLeftMatch?.id).toBe(qualifierMatch.id);
  });

  it('normalizes carried playoff seeds for non-split multi-division leagues when rescheduling', () => {
    const open = new Division('open', 'CoEd Open • 18+');
    const premier = new Division('premier', 'CoEd Premier • 18+');
    const field = new PlayingField({
      id: 'field_multi_division_playoff_seed_normalization',
      divisions: [open, premier],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Multi Division',
    });
    const makeTeam = (id: string, division: Division) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });
    const openTeam1 = makeTeam('open_team_1', open);
    const openTeam2 = makeTeam('open_team_2', open);
    const premierTeam1 = makeTeam('premier_team_1', premier);
    const premierTeam2 = makeTeam('premier_team_2', premier);

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T18:00:00.000Z');

    const openQualifier = createMatch({
      id: 'match_open_playin',
      matchId: 91,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division: open,
      team1: openTeam1,
      team2: openTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    openQualifier.team1Seed = 8;
    openQualifier.team2Seed = 9;
    openQualifier.setResults = [0, 0, 0];

    const openCarry = createMatch({
      id: 'match_open_carry',
      matchId: 95,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division: open,
      team1: openTeam1,
      team2: openTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    openCarry.team1 = null;
    openCarry.team2 = null;
    openCarry.team1Seed = 1;
    openCarry.team2Seed = null;
    openCarry.previousLeftMatch = openQualifier;
    openQualifier.winnerNextMatch = openCarry;
    openCarry.setResults = [0, 0, 0];

    const premierQualifier = createMatch({
      id: 'match_premier_playin',
      matchId: 92,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division: premier,
      team1: premierTeam1,
      team2: premierTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    premierQualifier.team1Seed = 8;
    premierQualifier.team2Seed = 9;
    premierQualifier.setResults = [0, 0, 0];

    const premierCarry = createMatch({
      id: 'match_premier_carry',
      matchId: 96,
      start: new Date('2026-03-02T13:00:00.000Z'),
      end: new Date('2026-03-02T14:00:00.000Z'),
      field,
      division: premier,
      team1: premierTeam1,
      team2: premierTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    premierCarry.team1 = null;
    premierCarry.team2 = null;
    premierCarry.team1Seed = 1;
    premierCarry.team2Seed = null;
    premierCarry.previousLeftMatch = premierQualifier;
    premierQualifier.winnerNextMatch = premierCarry;
    premierCarry.setResults = [0, 0, 0];

    const event = new League({
      id: 'event_multi_division_playoff_seed_normalization',
      name: 'Multi Division Playoff Seed Normalization League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [openTeam1.id]: openTeam1,
        [openTeam2.id]: openTeam2,
        [premierTeam1.id]: premierTeam1,
        [premierTeam2.id]: premierTeam2,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [open, premier],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      fields: { [field.id]: field },
      matches: {
        [openQualifier.id]: openQualifier,
        [openCarry.id]: openCarry,
        [premierQualifier.id]: premierQualifier,
        [premierCarry.id]: premierCarry,
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
      playoffTeamCount: 10,
      doTeamsOfficiate: false,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_division_playoff_seed_normalization',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [open, premier],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const rescheduledOpenCarry = result.matches.find((match) => match.id === openCarry.id);
    const rescheduledPremierCarry = result.matches.find((match) => match.id === premierCarry.id);

    expect(rescheduledOpenCarry?.team1Seed).toBeNull();
    expect(rescheduledOpenCarry?.team2Seed).toBe(1);
    expect(rescheduledPremierCarry?.team1Seed).toBeNull();
    expect(rescheduledPremierCarry?.team2Seed).toBe(1);
  });

  it('extends open-ended reschedule windows so matches can spill into later weeks', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_open_ended',
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

  it('SCHEDULE mode clears stale conflicting assignments and leaves overlap slots empty', () => {
    const division = new Division('open', 'Open');
    const field1 = new PlayingField({
      id: 'field_schedule_mode_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const field2 = new PlayingField({
      id: 'field_schedule_mode_2',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 2',
    });

    const makeTeam = (id: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('team_1'),
      team_2: makeTeam('team_2'),
      team_3: makeTeam('team_3'),
      team_4: makeTeam('team_4'),
    };

    const official = new UserData({
      id: 'official_schedule_mode',
      firstName: 'Schedule',
      lastName: 'Official',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-04T10:00:00.000Z');
    const eventEnd = new Date('2026-03-04T11:00:00.000Z');

    const match1 = createMatch({
      id: 'schedule_mode_match_1',
      matchId: 1,
      start: new Date('2026-03-04T10:00:00.000Z'),
      end: new Date('2026-03-04T11:00:00.000Z'),
      field: field1,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_schedule_mode',
    });
    const match2 = createMatch({
      id: 'schedule_mode_match_2',
      matchId: 2,
      start: new Date('2026-03-04T10:00:00.000Z'),
      end: new Date('2026-03-04T11:00:00.000Z'),
      field: field2,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_schedule_mode',
    });

    match1.official = official;
    match1.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official.id,
      eventOfficialId: 'event_official_schedule_mode',
      checkedIn: false,
      hasConflict: false,
    }];
    match2.official = official;
    match2.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official.id,
      eventOfficialId: 'event_official_schedule_mode',
      checkedIn: false,
      hasConflict: false,
    }];

    const tournament = new Tournament({
      id: 'event_schedule_mode',
      name: 'Schedule Mode Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [field1.id]: field1,
        [field2.id]: field2,
      },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'event_official_schedule_mode',
        userId: official.id,
        positionIds: ['r1'],
        fieldIds: [],
        isActive: true,
      }],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_schedule_mode',
          dayOfWeek: 3,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          fieldIds: [field1.id, field2.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings).toHaveLength(0);

    const assignmentTotal = result.matches.reduce(
      (total, match) => total + match.officialAssignments.filter((assignment) => assignment.holderType === 'OFFICIAL').length,
      0,
    );
    expect(assignmentTotal).toBe(1);
    expect(result.matches.some((match) => match.officialAssignments.length === 0)).toBe(true);
    expect(result.matches.some((match) => match.officialAssignments.some((assignment) => assignment.hasConflict))).toBe(false);
  });

  it('OFF mode reassigns overlaps and marks conflicts during lock-preserving reschedule', () => {
    const division = new Division('open', 'Open');
    const field1 = new PlayingField({
      id: 'field_off_mode_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const field2 = new PlayingField({
      id: 'field_off_mode_2',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 2',
    });

    const makeTeam = (id: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('off_team_1'),
      team_2: makeTeam('off_team_2'),
      team_3: makeTeam('off_team_3'),
      team_4: makeTeam('off_team_4'),
    };

    const official = new UserData({
      id: 'official_off_mode',
      firstName: 'Off',
      lastName: 'Official',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-05T10:00:00.000Z');
    const eventEnd = new Date('2026-03-05T11:00:00.000Z');

    const match1 = createMatch({
      id: 'off_mode_match_1',
      matchId: 1,
      start: new Date('2026-03-05T10:00:00.000Z'),
      end: new Date('2026-03-05T11:00:00.000Z'),
      field: field1,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_off_mode',
    });
    const match2 = createMatch({
      id: 'off_mode_match_2',
      matchId: 2,
      start: new Date('2026-03-05T10:00:00.000Z'),
      end: new Date('2026-03-05T11:00:00.000Z'),
      field: field2,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_off_mode',
    });

    const tournament = new Tournament({
      id: 'event_off_mode',
      name: 'Off Mode Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [field1.id]: field1,
        [field2.id]: field2,
      },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'OFF',
      officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'event_official_off_mode',
        userId: official.id,
        positionIds: ['r1'],
        fieldIds: [],
        isActive: true,
      }],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_off_mode',
          dayOfWeek: 4,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          fieldIds: [field1.id, field2.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings).toHaveLength(0);

    const assignmentTotal = result.matches.reduce(
      (total, match) => total + match.officialAssignments.filter((assignment) => assignment.holderType === 'OFFICIAL').length,
      0,
    );
    expect(assignmentTotal).toBe(2);
    expect(result.matches.some((match) => match.officialAssignments.some((assignment) => assignment.hasConflict))).toBe(true);
  });

  it('STAFFING mode fills all required official positions when rescheduling existing matches', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_staffing_reschedule',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Staffing',
    });

    const makeTeam = (id: string, name: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('team_1', 'Team 1'),
      team_2: makeTeam('team_2', 'Team 2'),
      team_3: makeTeam('team_3', 'Team 3'),
      team_4: makeTeam('team_4', 'Team 4'),
    };

    const official1 = new UserData({
      id: 'official_staffing_1',
      firstName: 'Official',
      lastName: 'One',
      matches: [],
      divisions: [division],
    });
    const official2 = new UserData({
      id: 'official_staffing_2',
      firstName: 'Official',
      lastName: 'Two',
      matches: [],
      divisions: [division],
    });
    const official3 = new UserData({
      id: 'official_staffing_3',
      firstName: 'Official',
      lastName: 'Three',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-03T10:00:00.000Z');
    const eventEnd = new Date('2026-03-03T13:00:00.000Z');

    const match1 = createMatch({
      id: 'match_staffing_1',
      matchId: 1,
      start: new Date('2026-03-03T10:00:00.000Z'),
      end: new Date('2026-03-03T11:00:00.000Z'),
      field,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_staffing_reschedule',
    });
    const match2 = createMatch({
      id: 'match_staffing_2',
      matchId: 2,
      start: new Date('2026-03-03T11:00:00.000Z'),
      end: new Date('2026-03-03T12:00:00.000Z'),
      field,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_staffing_reschedule',
    });

    // Simulate legacy persisted assignments where only one position was filled.
    match1.official = official1;
    match1.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official1.id,
      eventOfficialId: 'event_official_staffing_1',
      checkedIn: false,
      hasConflict: false,
    }];
    match2.official = official2;
    match2.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official2.id,
      eventOfficialId: 'event_official_staffing_2',
      checkedIn: false,
      hasConflict: false,
    }];

    const tournament = new Tournament({
      id: 'event_staffing_reschedule',
      name: 'Staffing Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official1, official2, official3],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'STAFFING',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_staffing_1',
          userId: official1.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_staffing_2',
          userId: official2.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_staffing_3',
          userId: official3.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_staffing_reschedule',
          dayOfWeek: 1,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 13 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings).toHaveLength(0);

    for (const match of result.matches) {
      expect(match.officialAssignments).toHaveLength(2);
      const slotIds = new Set(match.officialAssignments.map((assignment) => assignment.positionId));
      expect(slotIds).toEqual(new Set(['r1', 'r2']));
      const userIds = match.officialAssignments.map((assignment) => assignment.userId);
      expect(new Set(userIds).size).toBe(2);
      expect(match.official?.id).toBeTruthy();
      expect(userIds).toContain(match.official?.id ?? '');
    }
  });
});
