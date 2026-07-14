jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import {
  buildSeedEventFromTemplate,
  serializeSeedEvent,
  mapSourceEventToTemplateBundle,
} from '@/server/eventTemplates';
import {
  getTemplateRentalResourceHintsFromEvent,
  isTemplateRentalResourceSourceType,
} from '@/lib/templateRentalResources';
import type { Event, Field, TimeSlot } from '@/types';

const baseSport = { $id: 'sport_1', name: 'Volleyball' } as any;

const buildSourceEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event_1',
  name: 'Complex League',
  description: 'Reusable setup',
  start: '2026-01-05T10:00:00',
  end: '2026-01-05T14:00:00',
  timeZone: 'America/Denver',
  location: 'Denver',
  address: '100 Main St',
  coordinates: [39.7392, -104.9903],
  price: 2500,
  registrationPaymentMode: 'MANUAL',
  manualPaymentLinks: [
    { id: 'pay_1', provider: 'VENMO', label: 'Venmo', url: 'https://venmo.example/test' },
  ],
  manualPaymentInstructions: 'Pay before check-in.',
  imageId: '',
  hostId: 'host_1',
  noFixedEndDateTime: false,
  state: 'PUBLISHED',
  maxParticipants: 24,
  teamSizeLimit: 6,
  teamSignup: true,
  singleDivision: false,
  waitListIds: ['wait_1'],
  freeAgentIds: ['free_1'],
  teamIds: ['team_1'],
  userIds: ['user_1'],
  assistantHostIds: ['staff_1'],
  cancellationRefundHours: 12,
  registrationCutoffHours: 2,
  seedColor: 0,
  $createdAt: '',
  $updatedAt: '',
  eventType: 'LEAGUE',
  sport: baseSport,
  sportId: baseSport.$id,
  organizationId: null,
  requiredTemplateIds: ['doc_1'],
  allowPaymentPlans: true,
  installmentCount: 2,
  installmentDueDates: ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
  installmentDueRelativeDays: [0, 14],
  installmentAmounts: [1250, 1250],
  divisions: ['open'],
  divisionDetails: [{ id: 'open', name: 'Open', teamIds: ['team_1'] } as any],
  timeSlots: [],
  fieldIds: [],
  timeSlotIds: [],
  fields: [],
  matches: [{ $id: 'match_1' } as any],
  teams: [{ $id: 'team_1' } as any],
  players: [{ $id: 'user_1' } as any],
  officials: [],
  officialIds: [],
  officialSchedulingMode: 'SCHEDULE',
  officialPositions: [{ id: 'pos_1', name: 'R1', count: 1, order: 0 }],
  eventOfficials: [],
  attendees: 1,
  gamesPerOpponent: 2,
  includePlayoffs: true,
  playoffTeamCount: 4,
  usesSets: true,
  matchDurationMinutes: 60,
  setDurationMinutes: null,
  setsPerMatch: 3,
  doTeamsOfficiate: true,
  teamOfficialsMaySwap: true,
  pointsToVictory: [25, 25, 15],
  leagueScoringConfig: {
    id: 'scoring_1',
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    pointsPerSetWin: 0.5,
    pointsPerSetLoss: 0,
    pointsPerGameWin: null,
    pointsPerGameLoss: null,
    pointsPerGoalScored: null,
    pointsPerGoalConceded: null,
  } as any,
  ...overrides,
});

describe('dedicated event templates', () => {
  it('stores reusable event parameters, slot offsets, and rental resource hints without live event state', () => {
    const regularField: Field = {
      $id: 'field_regular',
      name: 'Court 1',
      location: 'Main Gym',
      lat: 39,
      long: -104,
      organizationId: 'org_regular',
    };
    const rentalFieldA: Field = {
      $id: 'field_rental_a',
      name: 'Rental Court A',
      location: 'Rental Facility',
      lat: 40,
      long: -105,
      organization: { $id: 'org_rental', publicSlug: 'rental-facility' } as any,
    };
    const rentalFieldB: Field = {
      $id: 'field_rental_b',
      name: 'Rental Court B',
      location: 'Rental Facility',
      lat: 40,
      long: -105,
      organization: { $id: 'org_rental', publicSlug: 'rental-facility' } as any,
    };
    const regularSlot: TimeSlot = {
      $id: 'slot_regular',
      dayOfWeek: 0,
      daysOfWeek: [0],
      startTimeMinutes: 11 * 60,
      endTimeMinutes: 12 * 60,
      startDate: '2026-01-05T11:00:00',
      endDate: '2026-01-05T12:00:00',
      repeating: false,
      scheduledFieldId: 'field_regular',
      scheduledFieldIds: ['field_regular'],
      requiredTemplateIds: ['slot_doc'],
    };
    const rentalSlot: TimeSlot = {
      $id: 'slot_rental',
      dayOfWeek: 0,
      daysOfWeek: [0],
      startTimeMinutes: 12 * 60,
      endTimeMinutes: 14 * 60,
      startDate: '2026-01-05T12:00:00',
      endDate: '2026-01-05T14:00:00',
      repeating: false,
      scheduledFieldId: 'field_rental_a',
      scheduledFieldIds: ['field_rental_a', 'field_rental_b'],
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'item_1',
      rentalLocked: true,
      price: 5000,
    };
    const source = buildSourceEvent({
      fields: [regularField, rentalFieldA, rentalFieldB],
      fieldIds: ['field_regular', 'field_rental_a', 'field_rental_b'],
      timeSlots: [regularSlot, rentalSlot],
      timeSlotIds: ['slot_regular', 'slot_rental'],
    });

    const bundle = mapSourceEventToTemplateBundle(source, {
      templateId: 'template_1',
      createdByUserId: 'host_1',
    });

    expect(bundle.template).toEqual(expect.objectContaining({
      id: 'template_1',
      name: 'Complex League',
      sourceEventId: 'event_1',
      ownerUserId: 'host_1',
      assistantHostIds: ['staff_1'],
      registrationPaymentMode: 'MANUAL',
      manualPaymentInstructions: 'Pay before check-in.',
      allowPaymentPlans: true,
      installmentDueRelativeDays: [0, 14],
      endOffsetMinutesFromEventStart: 240,
    }));
    expect(bundle.template).not.toHaveProperty('teamIds');
    expect(bundle.template).not.toHaveProperty('userIds');
    expect(bundle.template).not.toHaveProperty('matches');
    expect(bundle.resources).toHaveLength(1);
    expect(bundle.resources[0]).toEqual(expect.objectContaining({
      sourceResourceId: 'field_regular',
      name: 'Court 1',
    }));
    expect(bundle.rentalHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceResourceId: 'field_rental_a', name: 'Rental Court A' }),
      expect.objectContaining({ sourceResourceId: 'field_rental_b', name: 'Rental Court B' }),
    ]));
    expect(bundle.rentalHints).toHaveLength(2);
    expect(bundle.timeSlots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTimeSlotId: 'slot_regular',
        startOffsetMinutesFromEventStart: 60,
        endOffsetMinutesFromEventStart: 120,
        templateResourceIds: [bundle.resources[0].id],
        rentalResourceHintIds: [],
        requiredTemplateIds: ['slot_doc'],
      }),
      expect.objectContaining({
        sourceTimeSlotId: 'slot_rental',
        startOffsetMinutesFromEventStart: 120,
        endOffsetMinutesFromEventStart: 240,
        templateResourceIds: [],
        rentalResourceHintIds: expect.arrayContaining(bundle.rentalHints.map((hint) => hint.id)),
        price: null,
      }),
    ]));
    expect(bundle.leagueScoringConfig).toEqual(expect.objectContaining({
      eventTemplateId: 'template_1',
      pointsForWin: 3,
      pointsPerSetWin: 0.5,
    }));

    const seeded = buildSeedEventFromTemplate(bundle, {
      newEventId: 'event_new',
      newStartDate: new Date('2026-02-02T10:00:00'),
      hostId: 'host_2',
    });

    expect(seeded.$id).toBe('event_new');
    expect(seeded.state).toBe('DRAFT');
    expect(seeded.hostId).toBe('host_2');
    expect(seeded.start).toBe('2026-02-02T10:00:00');
    expect(seeded.end).toBe('2026-02-02T14:00:00');
    expect(seeded.teamIds).toEqual([]);
    expect(seeded.userIds).toEqual([]);
    expect(seeded.waitListIds).toEqual([]);
    expect(seeded.freeAgentIds).toEqual([]);
    expect(seeded.matches).toEqual([]);
    expect(seeded.teams).toEqual([]);
    expect(seeded.fieldIds).toEqual(['field_regular']);
    expect(seeded.registrationPaymentMode).toBe('MANUAL');
    expect(seeded.allowPaymentPlans).toBe(true);
    expect(seeded.leagueScoringConfig).toEqual(expect.objectContaining({
      pointsForWin: 3,
      pointsPerSetWin: 0.5,
    }));
    const seededRentalSlot = seeded.timeSlots?.find((slot) => isTemplateRentalResourceSourceType(slot.sourceType));
    expect(seededRentalSlot).toEqual(expect.objectContaining({
      startDate: '2026-02-02T12:00:00',
      endDate: '2026-02-02T14:00:00',
      scheduledFieldIds: [],
      rentalBookingId: null,
      rentalBookingItemId: null,
      rentalLocked: false,
    }));
    expect(getTemplateRentalResourceHintsFromEvent(seeded)).toEqual([
      expect.objectContaining({ fieldId: 'field_rental_a', fieldName: 'Rental Court A' }),
    ]);

    const responseEvent = serializeSeedEvent(seeded);
    expect(responseEvent.id).toBe('event_new');
    expect(responseEvent.sport).toEqual(expect.objectContaining({ id: 'sport_1' }));
    expect(responseEvent.timeSlots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String) }),
    ]));
    expect(JSON.stringify(responseEvent)).not.toMatch(/"\$/);
  });
});
