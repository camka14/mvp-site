import { rescheduleEventMatchesPreservingLocks } from '../reschedulePreservingLocks';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  TimeSlot,
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
    refereeCheckedIn: false,
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
      seed: 1,
      captainId: 'captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'team_2',
      seed: 2,
      captainId: 'captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'team_3',
      seed: 3,
      captainId: 'captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'team_4',
      seed: 4,
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
      referees: [],
      registrationIds: [],
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
      doTeamsRef: false,
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
      seed: 1,
      captainId: 'split_captain_1',
      division: playoffDivision,
      name: 'Split Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'split_team_2',
      seed: 2,
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
      referees: [],
      registrationIds: [],
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
      doTeamsRef: false,
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
      seed: 1,
      captainId: 'captain_a',
      division,
      name: 'Team A',
      matches: [],
      playerIds: [],
    });
    const teamB = new Team({
      id: 'team_b',
      seed: 2,
      captainId: 'captain_b',
      division,
      name: 'Team B',
      matches: [],
      playerIds: [],
    });
    const teamC = new Team({
      id: 'team_c',
      seed: 3,
      captainId: 'captain_c',
      division,
      name: 'Team C',
      matches: [],
      playerIds: [],
    });
    const teamD = new Team({
      id: 'team_d',
      seed: 4,
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
      referees: [],
      registrationIds: [],
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
      doTeamsRef: false,
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
});
