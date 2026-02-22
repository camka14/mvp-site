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
});
