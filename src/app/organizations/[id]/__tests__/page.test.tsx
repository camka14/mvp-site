import { buildFacilityCalendarSummary, buildFieldCalendarEvents } from '../fieldCalendar';
import type { Field, Match } from '@/types';
import { createSport } from '@/types/defaults';

describe('buildFieldCalendarEvents', () => {
  const baseField: Field = {
    $id: 'field_1',
    name: 'Court Alpha',
    location: '',
    lat: 0,
    long: 0,
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
        cancellationRefundHours: null,
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

    const matchEntry = entries.find((entry) => entry.metaType === 'booked');
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

    const matchEntry = entries.find((entry) => entry.metaType === 'booked');
    expect(matchEntry).toBeDefined();
    const expectedStart = new Date(matchWithoutEnd.start);
    expect(matchEntry?.start.toISOString()).toBe(expectedStart.toISOString());
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);
    expect(matchEntry?.end.toISOString()).toBe(expectedEnd.toISOString());
  });

  it('summarizes rentable inventory, utilization, revenue per court-hour, and conflicts by facility', () => {
    const range = {
      start: new Date('2026-03-10T00:00:00.000Z'),
      end: new Date('2026-03-11T00:00:00.000Z'),
    };
    const fields = [
      {
        ...baseField,
        $id: 'field_1',
        name: 'Court 1',
        facilityId: 'facility_river_city',
        facility: {
          $id: 'facility_river_city',
          name: 'River City Sports Complex',
        },
        rentalSlots: [
          {
            $id: 'slot_1',
            repeating: false,
            startDate: '2026-03-10T10:00:00.000Z',
            endDate: '2026-03-10T12:00:00.000Z',
            scheduledFieldId: 'field_1',
            scheduledFieldIds: ['field_1'],
            price: 5000,
          },
        ],
        events: [
          {
            $id: 'event_1',
            name: 'League night',
            eventType: 'EVENT',
            start: '2026-03-10T10:30:00.000Z',
            end: '2026-03-10T11:30:00.000Z',
          },
        ],
        matches: [],
      },
      {
        ...baseField,
        $id: 'field_2',
        name: 'Court 2',
        facilityId: 'facility_river_city',
        facility: {
          $id: 'facility_river_city',
          name: 'River City Sports Complex',
        },
        rentalSlots: [
          {
            $id: 'slot_2',
            repeating: false,
            startDate: '2026-03-10T12:00:00.000Z',
            endDate: '2026-03-10T14:00:00.000Z',
            scheduledFieldId: 'field_2',
            scheduledFieldIds: ['field_2'],
            price: 3000,
          },
        ],
        events: [],
        matches: [],
      },
    ] as unknown as Field[];

    const summary = buildFacilityCalendarSummary(fields, range);

    expect(summary.fieldCount).toBe(2);
    expect(summary.rentalSlotCount).toBe(2);
    expect(summary.rentalInventoryHours).toBe(4);
    expect(summary.bookedInventoryHours).toBe(1);
    expect(summary.openInventoryHours).toBe(3);
    expect(summary.conflictCount).toBe(1);
    expect(summary.utilizationPercent).toBe(25);
    expect(summary.potentialRevenueCents).toBe(16000);
    expect(summary.revenuePerCourtHourCents).toBe(4000);
    expect(summary.facilities).toHaveLength(1);
    expect(summary.facilities[0]).toEqual(expect.objectContaining({
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      utilizationPercent: 25,
      openInventoryHours: 3,
      conflictCount: 1,
    }));
    expect(summary.conflicts[0]).toEqual(expect.objectContaining({
      fieldId: 'field_1',
      fieldName: 'River City Sports Complex - Court 1',
      bookingTitle: 'League night',
      hours: 1,
    }));
  });
});
