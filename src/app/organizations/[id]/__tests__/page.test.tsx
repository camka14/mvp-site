import { buildFieldCalendarEvents } from '../fieldCalendar';
import type { Field, Match } from '@/types';
import { createSport } from '@/types/defaults';

describe('buildFieldCalendarEvents', () => {
  const baseField: Field = {
    $id: 'field_1',
    name: 'Court Alpha',
    location: '',
    lat: 0,
    long: 0,
    type: 'INDOOR',
    fieldNumber: 1,
  } as Field;

  it('creates calendar entries for matches with start and end times', () => {
    const match: Match = {
      $id: '68e9abb4003907d62b83',
      start: '2025-10-12T00:00:00.000+00:00',
      end: '2025-10-12T01:00:00.000+00:00',
      losersBracket: false,
      matchId: 1,
      team1Seed: undefined,
      team2Seed: undefined,
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      previousLeftId: undefined,
      previousRightId: undefined,
      winnerNextMatchId: undefined,
      loserNextMatchId: undefined,
      field: baseField,
      event: {
        $id: '68e81149002bcfc961a1',
        name: 'Pickup Night',
        description: '',
        start: '2025-10-12T00:00:00.000+00:00',
        end: '2025-10-12T02:00:00.000+00:00',
        location: '',
        coordinates: [0, 0],
        fieldType: 'INDOOR',
        price: 0,
        imageId: '',
        hostId: 'host_1',
        state: 'PUBLISHED',
        maxParticipants: 0,
        teamSizeLimit: 0,
        teamSignup: false,
        singleDivision: false,
        waitListIds: [],
        freeAgentIds: [],
        seedColor: 0,
        cancellationRefundHours: 0,
        registrationCutoffHours: 0,
        eventType: 'EVENT',
        sport: createSport({ $id: 'volleyball', name: 'Volleyball' }),
        divisions: [],
        attendees: 0,
        category: 'Volleyball',
      } as any,
    } as Match;

    const entries = buildFieldCalendarEvents([
      {
        ...baseField,
        matches: [match],
        events: [],
      } as Field,
    ]);

    const matchEntry = entries.find((entry) => entry.metaType === 'match');
    expect(matchEntry).toBeDefined();
    expect(matchEntry?.start.toISOString()).toBe(new Date(match.start).toISOString());
    expect(matchEntry?.end.toISOString()).toBe(new Date(match.end as string).toISOString());
  });

  it('falls back to a default duration when match end time is missing', () => {
    const matchWithoutEnd = {
      $id: 'match_2',
      start: '2025-10-13T05:00:00.000+00:00',
      losersBracket: false,
      matchId: 2,
      team1Seed: undefined,
      team2Seed: undefined,
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      previousLeftId: undefined,
      previousRightId: undefined,
      winnerNextMatchId: undefined,
      loserNextMatchId: undefined,
      field: baseField,
      event: undefined,
    } as unknown as Match;

    const entries = buildFieldCalendarEvents([
      {
        ...baseField,
        matches: [matchWithoutEnd],
        events: [],
      } as Field,
    ]);

    const matchEntry = entries.find((entry) => entry.metaType === 'match');
    expect(matchEntry).toBeDefined();
    const expectedStart = new Date(matchWithoutEnd.start);
    expect(matchEntry?.start.toISOString()).toBe(expectedStart.toISOString());
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);
    expect(matchEntry?.end.toISOString()).toBe(expectedEnd.toISOString());
  });
});
