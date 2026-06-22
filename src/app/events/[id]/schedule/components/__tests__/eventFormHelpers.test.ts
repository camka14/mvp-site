import type { EventOfficialPosition, Field, TimeSlot } from '@/types';

import {
  buildSlotDivisionLookup,
  buildCompositeDivisionTypeId,
  buildDivisionTypeOptionsForEvent,
  buildDivisionTypeSelectOptions,
  buildPlayoffDivisionCapacityWarnings,
  buildPlayoffDivisionSelectOptions,
  deriveTournamentPoolSettingsByBracketId,
  divisionFieldIdsEqual,
  normalizeDivisionFieldIds,
  normalizeDivisionKeys,
  normalizePlayoffDivisionParticipantCount,
  normalizeSlotDivisionIdsWithLookup,
  parseCompositeDivisionTypeId,
  type DivisionDetailForm,
} from '../eventForm/divisionForm';
import {
  buildAvailableOfficialFieldOptions,
  buildOfficialPositionsFromTemplates,
  getEventOfficialUserIds,
  normalizeEventOfficials,
  normalizeEventOfficialPositions,
  normalizeOfficialSchedulingMode,
  normalizeSportOfficialPositionTemplates,
} from '../eventForm/officials';
import {
  normalizeImmutableFields,
  normalizeImmutableTimeSlots,
} from '../eventForm/immutableDefaults';
import {
  buildSportOptions,
  buildTemplateOptions,
  resolveSelectedSport,
  sportRequiresSets,
} from '../eventForm/formOptions';
import {
  canUseAutomaticRefunds,
} from '../eventForm/paymentPlanHelpers';
import {
  buildRentalBookingTimeSlot,
  buildRentalLeagueFieldOptions,
  buildRentalResourceFields,
  buildRentalResourceOptionsByFieldId,
  buildRentalResourceOptionsBySelectorId,
  buildRentalResourceSelectorFields,
  buildSelectedRentalFieldIds,
  getRentalBookingSelectorId,
  isRentalBookingSelectorId,
  isRentalLockedTimeSlot,
  mapRentalBookingsToResourceOptions,
  mergeRentalLockedTimeSlots,
  resolveSelectedRentalResourceOptions,
} from '../eventForm/rentalResources';
import {
  buildFacilityResourceGroups,
  buildFieldById,
  buildOrganizationResourcePool,
  buildResolvedOrganizationFieldSignature,
  fieldsEqual,
  isGeneratedLocalFieldPlaceholder,
  mergeFieldsById,
  mergeOrganizationFieldsIntoPool,
  removeOrganizationFieldsFromPool,
  resolveFieldsReferencedInSlots,
  resolveSelectedRentedFieldIds,
  toFieldIdList,
} from '../eventForm/resourceGroups';
import {
  createEmptyStaffInvite,
  formatStaffRoleLabel,
  formatStaffStatusLabel,
  getStaffStatusColor,
  getUserEmail,
  mapInviteStaffTypeToRole,
  mapRoleToInviteStaffType,
  normalizeInviteStaffTypes,
  normalizeInviteStatusToken,
  normalizePendingStaffInvite,
  normalizeRosterStaffTypes,
} from '../eventForm/staffInvites';
import {
  normalizeFieldIds,
  normalizeSlotFieldIds,
  normalizeWeekdays,
  timeSlotsEqual,
} from '../eventForm/slotForm';

const makeField = (overrides: Partial<Field> & { $id: string }): Field => ({
  $id: overrides.$id,
  name: overrides.name ?? overrides.$id,
  location: overrides.location ?? '',
  divisions: overrides.divisions ?? [],
  ...overrides,
} as Field);

const makeDivisionDetail = (overrides: Partial<DivisionDetailForm> & { id: string }): DivisionDetailForm => ({
  id: overrides.id,
  key: overrides.key ?? overrides.id,
  kind: overrides.kind ?? 'LEAGUE',
  name: overrides.name ?? overrides.id,
  divisionTypeId: overrides.divisionTypeId ?? 'skill_open_age_18plus',
  divisionTypeName: overrides.divisionTypeName ?? 'Open 18+',
  ratingType: overrides.ratingType ?? 'SKILL',
  gender: overrides.gender ?? 'C',
  skillDivisionTypeId: overrides.skillDivisionTypeId ?? 'open',
  skillDivisionTypeName: overrides.skillDivisionTypeName ?? 'Open',
  ageDivisionTypeId: overrides.ageDivisionTypeId ?? '18plus',
  ageDivisionTypeName: overrides.ageDivisionTypeName ?? '18+',
  price: overrides.price ?? 0,
  maxParticipants: overrides.maxParticipants ?? 10,
  playoffPlacementDivisionIds: overrides.playoffPlacementDivisionIds ?? [],
  allowPaymentPlans: overrides.allowPaymentPlans ?? false,
  installmentCount: overrides.installmentCount ?? 0,
  installmentDueDates: overrides.installmentDueDates ?? [],
  installmentDueRelativeDays: overrides.installmentDueRelativeDays ?? [],
  installmentAmounts: overrides.installmentAmounts ?? [],
  fieldIds: overrides.fieldIds ?? [],
  ...overrides,
});

describe('event form immutable default helpers', () => {
  it('sanitizes immutable fields and normalizes timeslots with fallback resource ids', () => {
    const field = makeField({
      $id: 'court_1',
      name: 'Court 1',
      matches: [{ $id: 'match_1' }],
    } as any);
    const immutableFields = normalizeImmutableFields([field, null as any]);
    const immutableSlots = normalizeImmutableTimeSlots([
      {
        $id: 'slot_1',
        startTimeMinutes: 540,
        endTimeMinutes: 600,
        event: { $id: 'event_1' },
      } as any,
    ], immutableFields);

    expect((immutableFields[0] as any).matches).toBeUndefined();
    expect(immutableSlots).toHaveLength(1);
    expect((immutableSlots[0] as any).event).toBeUndefined();
    expect(immutableSlots[0]).toMatchObject({
      scheduledFieldId: 'court_1',
      scheduledFieldIds: ['court_1'],
    });
  });
});

describe('event form option helpers', () => {
  it('builds sport and template select options with fallback labels', () => {
    expect(buildSportOptions([
      { $id: 'soccer', name: 'Soccer' },
      { $id: 'pickleball', name: 'Pickleball' },
    ] as any)).toEqual([
      { value: 'soccer', label: 'Soccer' },
      { value: 'pickleball', label: 'Pickleball' },
    ]);

    expect(buildTemplateOptions([
      {
        $id: 'template_1',
        organizationId: 'org_1',
        title: '',
        signOnce: true,
        type: 'TEXT',
        requiredSignerType: 'PARENT_GUARDIAN',
      },
    ])).toEqual([
      { value: 'template_1', label: 'Untitled Template (TEXT, Parent/Guardian)' },
    ]);
  });

  it('resolves selected sports from ids before fallback config and detects set scoring', () => {
    const catalogSport = { $id: 'volleyball', name: 'Volleyball', usePointsPerSetWin: true };
    const fallbackSport = { $id: 'custom', name: 'Custom', usePointsPerSetWin: false };
    const sportsById = new Map([[catalogSport.$id, catalogSport as any]]);

    expect(resolveSelectedSport({
      sportId: 'volleyball',
      sportConfig: fallbackSport as any,
      sportsById,
    })).toBe(catalogSport);
    expect(resolveSelectedSport({
      sportId: 'missing',
      sportConfig: fallbackSport as any,
      sportsById,
    })).toBe(fallbackSport);
    expect(sportRequiresSets(catalogSport as any)).toBe(true);
    expect(sportRequiresSets(null)).toBe(false);
  });
});

describe('event form payment helpers', () => {
  it('allows automatic refunds only when Stripe and paid pricing are available', () => {
    expect(canUseAutomaticRefunds({
      hasStripeAccount: false,
      singleDivision: true,
      price: 2500,
    })).toBe(false);
    expect(canUseAutomaticRefunds({
      hasStripeAccount: true,
      singleDivision: true,
      price: 0,
    })).toBe(false);
    expect(canUseAutomaticRefunds({
      hasStripeAccount: true,
      singleDivision: true,
      price: '2500',
    })).toBe(true);
    expect(canUseAutomaticRefunds({
      hasStripeAccount: true,
      singleDivision: false,
      divisionDetails: [{ price: 0 }, { price: '1500' }],
    })).toBe(true);
  });
});

describe('event form rental resource helpers', () => {
  it('maps reserved rental booking items into selectable resource options with facility metadata', () => {
    const options = mapRentalBookingsToResourceOptions({
      bookings: [
        {
          $id: 'booking_1',
          items: [
            {
              $id: 'item_late',
              fieldId: 'court_2',
              start: '2026-06-26T11:00:00.000Z',
              end: '2026-06-26T13:00:00.000Z',
              priceCents: 7500,
              facilityId: 'facility_rented',
              facility: {
                $id: 'facility_rented',
                name: 'Example Clubhouse',
                address: '800 Waterfront Way',
              } as any,
              field: makeField({
                $id: 'court_2',
                name: 'Court 2',
                organization: 'owner_org',
              }),
            },
            {
              $id: 'item_early',
              fieldId: 'court_1',
              start: '2026-06-24T15:00:00.000Z',
              end: '2026-06-24T17:00:00.000Z',
              timeZone: 'America/Los_Angeles',
              priceCents: 5000,
              requiredTemplateIds: ['template_1'],
              hostRequiredTemplateIds: ['host_template_1'],
              eventId: 'event_1',
              eventTimeSlotId: 'slot_1',
              facilityId: 'facility_rented',
              facility: {
                $id: 'facility_rented',
                name: 'Example Clubhouse',
                address: '800 Waterfront Way',
              } as any,
              field: makeField({
                $id: 'court_1',
                name: 'Court 1',
                organization: 'owner_org',
              }),
            },
            {
              $id: 'missing_start',
              fieldId: 'court_3',
              end: '2026-06-24T17:00:00.000Z',
              field: makeField({ $id: 'court_3', name: 'Court 3' }),
            },
          ],
        },
      ],
    });

    expect(options.map((option) => option.bookingItemId)).toEqual(['item_early', 'item_late']);
    expect(options[0]).toMatchObject({
      selectorId: 'rental:item_early',
      bookingId: 'booking_1',
      fieldId: 'court_1',
      start: '2026-06-24T15:00:00.000Z',
      end: '2026-06-24T17:00:00.000Z',
      timeZone: 'America/Los_Angeles',
      priceCents: 5000,
      requiredTemplateIds: ['template_1'],
      hostRequiredTemplateIds: ['host_template_1'],
      eventId: 'event_1',
      eventTimeSlotId: 'slot_1',
    });
    expect(options[0].field).toMatchObject({
      facilityId: 'facility_rented',
      rentalResource: true,
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'item_early',
      rentalStart: '2026-06-24T15:00:00.000Z',
      rentalEnd: '2026-06-24T17:00:00.000Z',
    });
    expect(options[0].selectorField).toMatchObject({
      $id: 'rental:item_early',
    });
  });

  it('builds locked non-repeating timeslots from rental booking options', () => {
    const [option] = mapRentalBookingsToResourceOptions({
      bookings: [
        {
          $id: 'booking_1',
          items: [
            {
              $id: 'item_1',
              fieldId: 'court_1',
              start: '2026-06-24T15:00:00',
              end: '2026-06-24T17:00:00',
              timeZone: 'America/Los_Angeles',
              priceCents: 5000,
              requiredTemplateIds: ['template_1'],
              hostRequiredTemplateIds: ['host_template_1'],
              field: makeField({ $id: 'court_1', name: 'Court 1' }),
            },
          ],
        },
      ],
    });

    const slot = buildRentalBookingTimeSlot(option, ['Open', 'open', ''], 'UTC');

    expect(slot).toMatchObject({
      $id: 'rental-slot-item_1',
      dayOfWeek: 2,
      daysOfWeek: [2],
      divisions: ['open'],
      startTimeMinutes: 900,
      endTimeMinutes: 1020,
      scheduledFieldId: 'court_1',
      scheduledFieldIds: ['court_1'],
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'item_1',
      rentalLocked: true,
      price: 5000,
      requiredTemplateIds: ['template_1'],
      hostRequiredTemplateIds: ['host_template_1'],
    });
    expect(isRentalLockedTimeSlot(slot)).toBe(true);
    expect(isRentalLockedTimeSlot({ rentalBookingItemId: 'item_1' })).toBe(true);
    expect(isRentalLockedTimeSlot({ sourceType: 'ORGANIZATION' } as any)).toBe(false);
  });

  it('builds rental selector maps and league field options from booking resources', () => {
    const options = mapRentalBookingsToResourceOptions({
      bookings: [
        {
          $id: 'booking_1',
          items: [
            {
              $id: 'item_early',
              fieldId: 'court_1',
              start: '2026-06-24T15:00:00.000Z',
              end: '2026-06-24T17:00:00.000Z',
              field: makeField({ $id: 'court_1', name: 'Court 1' }),
            },
            {
              $id: 'item_late',
              fieldId: 'court_1',
              start: '2026-06-26T11:00:00.000Z',
              end: '2026-06-26T13:00:00.000Z',
              field: makeField({ $id: 'court_1', name: 'Court 1' }),
            },
          ],
        },
      ],
    });
    const optionsBySelectorId = buildRentalResourceOptionsBySelectorId(options);
    const optionsByFieldId = buildRentalResourceOptionsByFieldId(options);

    expect(buildRentalResourceFields(options).map((field) => field.$id)).toEqual(['court_1']);
    expect(buildRentalResourceSelectorFields(options).map((field) => field.$id)).toEqual([
      'rental:item_early',
      'rental:item_late',
    ]);
    expect(optionsBySelectorId.get('rental:item_early')?.bookingItemId).toBe('item_early');
    expect(optionsByFieldId.get('court_1')?.map((option) => option.bookingItemId)).toEqual(['item_early', 'item_late']);

    const selectedRentalOptions = resolveSelectedRentalResourceOptions({
      selectedFieldIds: ['rental:item_early', 'court_1'],
      optionsBySelectorId,
      optionsByFieldId,
    });
    expect(selectedRentalOptions.map((option) => option.bookingItemId)).toEqual(['item_early', 'item_late']);
    expect(buildSelectedRentalFieldIds(selectedRentalOptions)).toEqual(['court_1']);

    expect(buildRentalLeagueFieldOptions({
      rentalResourceOptions: options,
      selectedFields: [
        makeField({ $id: 'owned_1', name: 'Owned 1' }),
        options[0].field,
      ],
    }).map((option) => option.value)).toEqual(['owned_1', 'rental:item_early', 'rental:item_late']);
  });

  it('deduplicates and sorts rental-locked slots by booking item and start date', () => {
    const slots = mergeRentalLockedTimeSlots([
      {
        $id: 'later',
        startDate: '2026-06-26T11:00:00.000Z',
        endDate: '2026-06-26T13:00:00.000Z',
        scheduledFieldIds: ['court_1'],
        rentalBookingItemId: 'item_later',
      } as TimeSlot,
      {
        $id: 'first_version',
        startDate: '2026-06-24T15:00:00.000Z',
        endDate: '2026-06-24T17:00:00.000Z',
        scheduledFieldIds: ['court_1'],
        rentalBookingItemId: 'item_early',
        price: 1000,
      } as TimeSlot,
      {
        $id: 'replacement_version',
        startDate: '2026-06-24T15:00:00.000Z',
        endDate: '2026-06-24T17:00:00.000Z',
        scheduledFieldIds: ['court_1'],
        rentalBookingItemId: 'item_early',
        price: 2000,
      } as TimeSlot,
    ]);

    expect(slots.map((slot) => slot.$id)).toEqual(['replacement_version', 'later']);
    expect(slots[0].price).toBe(2000);
  });

  it('normalizes rental selector ids', () => {
    expect(getRentalBookingSelectorId('item_1')).toBe('rental:item_1');
    expect(isRentalBookingSelectorId(' rental:item_1 ')).toBe(true);
    expect(isRentalBookingSelectorId('court_1')).toBe(false);
  });
});

describe('event form resource grouping helpers', () => {
  it('groups owned and rented resources by facility with rented facilities sorted after owned facilities', () => {
    const groups = buildFacilityResourceGroups([
      makeField({
        $id: 'main_2',
        name: 'Main 2',
        organization: 'host_org',
        facilityId: 'facility_main',
        facility: { $id: 'facility_main', name: 'Main Facility', address: '100 Main St' } as any,
      }),
      makeField({
        $id: 'rented_1',
        name: 'Rented 1',
        organization: 'owner_org',
        facilityId: 'facility_rented',
        facility: { $id: 'facility_rented', name: 'Example Clubhouse', address: '800 Waterfront Way' } as any,
      }),
      makeField({
        $id: 'main_1',
        name: 'Main 1',
        organization: 'host_org',
        facilityId: 'facility_main',
        facility: { $id: 'facility_main', name: 'Main Facility', address: '100 Main St' } as any,
      }),
    ], 'host_org');

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: 'facility:facility_main',
      label: 'Main Facility',
      description: '100 Main St',
      isRental: false,
    });
    expect(groups[0].resources.map((field) => field.$id)).toEqual(['main_1', 'main_2']);
    expect(groups[1]).toMatchObject({
      key: 'rental:facility_rented',
      label: 'Example Clubhouse',
      description: '800 Waterfront Way',
      isRental: true,
    });
  });

  it('merges and removes organization-owned fields without dropping local placeholders', () => {
    const current = [
      makeField({ $id: 'local_1', name: 'Field 1' }),
      makeField({ $id: 'old_org_field', name: 'Old Org', organization: 'host_org' }),
    ];
    const merged = mergeOrganizationFieldsIntoPool(current, [
      makeField({ $id: 'org_2', name: 'Org 2', $createdAt: '2026-01-02T00:00:00.000Z' } as any),
      makeField({ $id: 'org_1', name: 'Org 1', $createdAt: '2026-01-01T00:00:00.000Z' } as any),
    ], 'host_org');

    expect(toFieldIdList(merged)).toEqual(['org_1', 'org_2', 'local_1']);
    expect(merged[0].organization).toBe('host_org');
    expect(removeOrganizationFieldsFromPool(merged, 'host_org').map((field) => field.$id)).toEqual(['local_1']);
    expect(isGeneratedLocalFieldPlaceholder(makeField({ $id: 'local_1', name: 'Field 1' }), 0)).toBe(true);
    expect(isGeneratedLocalFieldPlaceholder(makeField({ $id: 'local_1', name: 'Custom Court' }), 0)).toBe(false);
  });

  it('resolves selected fields referenced by slots and falls back to immutable fields when restricted', () => {
    const main = makeField({ $id: 'main', name: 'Main' });
    const side = makeField({ $id: 'side', name: 'Side' });
    const immutable = makeField({ $id: 'locked', name: 'Locked' });

    expect(resolveFieldsReferencedInSlots({
      selectedFields: [main, side],
      immutableFields: [immutable],
      slots: [
        { scheduledFieldIds: ['side', 'main', 'side'] },
        { scheduledFieldId: 'missing' },
      ],
      hasRestrictedImmutableFields: true,
    }).map((field) => field.$id)).toEqual(['side', 'main']);

    expect(resolveFieldsReferencedInSlots({
      selectedFields: [],
      immutableFields: [immutable],
      slots: [],
      hasRestrictedImmutableFields: true,
    })).toEqual([immutable]);
  });

  it('resolves selected rented fields and builds organization resource pools', () => {
    const owned = makeField({ $id: 'owned_1', name: 'Owned 1', organization: 'host_org' });
    const rented = makeField({ $id: 'rented_1', name: 'Rented 1', organization: 'owner_org' });
    const rentalSelector = makeField({ $id: 'rental:item_1', name: 'Rented 1 - Jun 24', organization: 'owner_org' });

    expect(buildFieldById([owned]).get('owned_1')).toBe(owned);
    expect(resolveSelectedRentedFieldIds({
      organizationHostedEventId: 'host_org',
      selectedFieldIds: ['owned_1', 'rented_1'],
      selectedRentalFieldIds: ['rental_base'],
      fields: [owned, rented],
      activeEventFields: [],
      immutableFields: [],
      rentalResourceFields: [],
    })).toEqual(['rental_base', 'rented_1']);

    expect(buildOrganizationResourcePool({
      organizationHostedEventId: 'host_org',
      fields: [owned, rented],
      rentalResourceFields: [rented],
      rentalResourceSelectorFields: [rentalSelector],
      selectedFieldIds: [],
    }).map((field) => field.$id)).toEqual(['owned_1', 'rental:item_1']);

    expect(buildOrganizationResourcePool({
      organizationHostedEventId: 'host_org',
      fields: [owned, rented],
      rentalResourceFields: [rented],
      rentalResourceSelectorFields: [rentalSelector],
      selectedFieldIds: ['rented_1'],
    }).map((field) => field.$id)).toEqual(['owned_1', 'rented_1', 'rental:item_1']);
  });

  it('builds stable organization field signatures from id, created date, and name', () => {
    expect(buildResolvedOrganizationFieldSignature([
      makeField({ $id: 'field_b', name: ' B ', $createdAt: '2026-01-02T00:00:00.000Z' } as any),
      makeField({ $id: 'field_a', name: 'A', createdAt: '2026-01-01T00:00:00.000Z' } as any),
    ])).toBe('field_a:2026-01-01T00:00:00.000Z:A|field_b:2026-01-02T00:00:00.000Z:B');
    expect(buildResolvedOrganizationFieldSignature(null)).toBe('');
  });

  it('compares fields with division sets independent of division order', () => {
    const left = [
      makeField({ $id: 'field_1', name: 'Field 1', divisions: ['open', 'advanced'], lat: 45, long: -122 }),
    ];
    const right = [
      makeField({ $id: 'field_1', name: 'Field 1', divisions: ['advanced', 'open'], lat: 45, long: -122 }),
    ];

    expect(fieldsEqual(left, right)).toBe(true);
    expect(fieldsEqual(left, [makeField({ ...right[0], location: 'new location' })])).toBe(false);
    expect(mergeFieldsById(left, [makeField({ $id: 'field_1', name: 'Replacement' })])[0].name).toBe('Replacement');
  });
});

describe('event form slot helpers', () => {
  it('normalizes weekdays and scheduled resource ids from legacy and multi-resource shapes', () => {
    expect(normalizeWeekdays({ dayOfWeek: 3 })).toEqual([3]);
    expect(normalizeWeekdays({ dayOfWeek: 3, daysOfWeek: [5, 2, 5, -1, 7] })).toEqual([2, 5]);
    expect(normalizeFieldIds([' court_1 ', '', 'court_2', 'court_1'])).toEqual(['court_1', 'court_2']);
    expect(normalizeSlotFieldIds({ scheduledFieldId: 'legacy_field' })).toEqual(['legacy_field']);
    expect(normalizeSlotFieldIds({ scheduledFieldId: 'legacy_field', scheduledFieldIds: ['court_1'] })).toEqual(['court_1']);
  });

  it('compares timeslots using normalized resource, weekday, and division sets', () => {
    const baseSlot = {
      $id: 'slot_1',
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      daysOfWeek: [2, 1],
      scheduledFieldIds: ['court_2', 'court_1'],
      divisions: ['advanced', 'open'],
      repeating: true,
    } as TimeSlot;
    const sameSlot = {
      ...baseSlot,
      daysOfWeek: [1, 2],
      scheduledFieldIds: ['court_1', 'court_2'],
      divisions: ['open', 'advanced'],
    } as TimeSlot;
    const changedSlot = {
      ...baseSlot,
      sourceType: 'RENTAL_BOOKING',
    } as TimeSlot;

    expect(timeSlotsEqual([baseSlot], [sameSlot])).toBe(true);
    expect(timeSlotsEqual([baseSlot], [changedSlot])).toBe(false);
  });
});

describe('event form staff invite helpers', () => {
  it('normalizes pending staff invites and maps invite roles', () => {
    expect(createEmptyStaffInvite()).toEqual({
      firstName: '',
      lastName: '',
      email: '',
      roles: [],
    });
    expect(normalizePendingStaffInvite({
      firstName: ' Sam ',
      lastName: ' Raz ',
      email: ' SAM@EXAMPLE.COM ',
      roles: ['OFFICIAL', 'OFFICIAL', 'ASSISTANT_HOST', 'BAD_ROLE' as any],
    })).toEqual({
      firstName: 'Sam',
      lastName: 'Raz',
      email: 'sam@example.com',
      roles: ['OFFICIAL', 'ASSISTANT_HOST'],
    });
    expect(mapRoleToInviteStaffType('OFFICIAL')).toBe('OFFICIAL');
    expect(mapRoleToInviteStaffType('ASSISTANT_HOST')).toBe('HOST');
    expect(mapInviteStaffTypeToRole('HOST')).toBe('ASSISTANT_HOST');
    expect(mapInviteStaffTypeToRole('STAFF')).toBeNull();
  });

  it('normalizes roster statuses, types, labels, colors, and user email', () => {
    expect(normalizeInviteStatusToken(' failed ')).toBe('failed');
    expect(normalizeInviteStatusToken('unknown')).toBe('active');
    expect(normalizeInviteStaffTypes(['host', 'OFFICIAL', 'HOST', 'staff'])).toEqual(['HOST', 'OFFICIAL']);
    expect(normalizeRosterStaffTypes(['host', 'STAFF', 'OFFICIAL', 'bad'])).toEqual(['HOST', 'STAFF', 'OFFICIAL']);
    expect(getUserEmail({ email: ' USER@EXAMPLE.COM ' } as any)).toBe('user@example.com');
    expect(formatStaffRoleLabel('ASSISTANT_HOST')).toBe('Assistant Host');
    expect(formatStaffStatusLabel('email_invite')).toBe('Email invite');
    expect(getStaffStatusColor('failed')).toBe('red');
    expect(getStaffStatusColor('pending')).toBe('blue');
    expect(getStaffStatusColor('active')).toBe('teal');
  });
});

describe('event form official helpers', () => {
  it('builds official field options from selected and local event resources', () => {
    const owned = makeField({ $id: 'owned_1', name: 'Owned 1', organization: 'host_org' });
    const selected = makeField({ $id: 'selected_1', name: 'Selected 1', organization: 'host_org' });
    const local = makeField({ $id: 'local_1', name: 'Local 1' });

    expect(buildAvailableOfficialFieldOptions([owned, selected, local], ['selected_1']).map((option) => option.value)).toEqual([
      'selected_1',
      'local_1',
    ]);
    expect(buildAvailableOfficialFieldOptions([owned], []).map((option) => option.value)).toEqual(['owned_1']);
  });

  it('normalizes scheduling mode aliases and position templates', () => {
    expect(normalizeOfficialSchedulingMode('NONE')).toBe('OFF');
    expect(normalizeOfficialSchedulingMode('STAFFING')).toBe('STAFFING');
    expect(normalizeOfficialSchedulingMode('bad')).toBe('SCHEDULE');
    expect(normalizeSportOfficialPositionTemplates([
      { name: ' Referee ', count: 2.8 },
      { name: 'Scorekeeper', count: 0 },
      { name: '' },
      null,
    ])).toEqual([
      { name: 'Referee', count: 2 },
      { name: 'Scorekeeper', count: 1 },
    ]);
  });

  it('normalizes official positions and event official assignments', () => {
    const positions = normalizeEventOfficialPositions([
      { id: 'line', name: 'Line Judge', count: 2, order: 2 },
      { id: 'ref', name: 'Referee', count: 1, order: 1 },
    ]);

    expect(positions.map((position) => position.id)).toEqual(['ref', 'line']);
    expect(positions.map((position) => position.order)).toEqual([0, 1]);

    const officials = normalizeEventOfficials([
      {
        id: 'existing',
        userId: 'user_1',
        positionIds: ['line', 'missing'],
        fieldIds: [' court_1 ', 'court_1', 'court_2'],
        isActive: false,
      },
      {
        userId: 'user_2',
      },
    ], [], positions);

    expect(officials).toHaveLength(2);
    expect(officials[0]).toMatchObject({
      id: 'existing',
      userId: 'user_1',
      positionIds: ['line'],
      fieldIds: ['court_1', 'court_2'],
      isActive: false,
    });
    expect(officials[1]).toMatchObject({
      userId: 'user_2',
      positionIds: ['ref', 'line'],
      fieldIds: [],
      isActive: true,
    });
    expect(getEventOfficialUserIds(officials)).toEqual(['user_1', 'user_2']);
  });

  it('falls back to templates and legacy official ids', () => {
    const positions = normalizeEventOfficialPositions([], [
      { name: 'Referee', count: 2 },
    ]);
    const officials = normalizeEventOfficials(null, [' user_1 ', '', 'user_1'], positions);

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      name: 'Referee',
      count: 2,
      order: 0,
    });
    expect(officials).toHaveLength(1);
    expect(officials[0]).toMatchObject({
      userId: 'user_1',
      positionIds: [positions[0].id],
      isActive: true,
    });
    expect(buildOfficialPositionsFromTemplates([{ name: 'Scorekeeper', count: 0 }])[0]).toMatchObject({
      name: 'Scorekeeper',
      count: 1,
      order: 0,
    });
  });
});

describe('event form division helpers', () => {
  it('merges catalog and persisted division type options for selects', () => {
    const options = buildDivisionTypeOptionsForEvent('soccer', [
      makeDivisionDetail({
        id: 'division_1',
        skillDivisionTypeId: 'custom_skill',
        skillDivisionTypeName: 'Custom Skill',
        ageDivisionTypeId: 'u21',
        ageDivisionTypeName: 'U21',
      }),
      makeDivisionDetail({
        id: 'division_2',
        skillDivisionTypeId: 'custom_skill',
        skillDivisionTypeName: 'Custom Skill Duplicate',
        ageDivisionTypeId: 'u21',
        ageDivisionTypeName: 'U21 Duplicate',
      }),
    ]);

    expect(options.some((option) => option.ratingType === 'SKILL' && option.id === 'custom_skill')).toBe(true);
    expect(options.filter((option) => option.ratingType === 'SKILL' && option.id === 'custom_skill')).toHaveLength(1);
    expect(buildDivisionTypeSelectOptions(options, 'AGE').some((option) => option.value === 'u21')).toBe(true);
  });

  it('builds playoff division options and capacity warnings', () => {
    const playoffDivisions = [
      {
        id: 'gold',
        key: 'gold',
        kind: 'PLAYOFF',
        name: 'Gold',
        maxParticipants: 1,
        playoffConfig: {} as any,
      },
      {
        id: 'silver',
        key: 'silver',
        kind: 'PLAYOFF',
        name: 'Silver',
        maxParticipants: 4,
        playoffConfig: {} as any,
      },
    ];

    expect(buildPlayoffDivisionSelectOptions(playoffDivisions)).toEqual([
      { value: 'gold', label: 'Gold' },
      { value: 'silver', label: 'Silver' },
    ]);
    expect(buildPlayoffDivisionCapacityWarnings({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: true,
      divisionDetails: [
        makeDivisionDetail({
          id: 'division_1',
          playoffTeamCount: 2,
          playoffPlacementDivisionIds: ['gold', 'gold'],
        }),
      ],
      playoffDivisionDetails: playoffDivisions,
    })).toEqual(['Gold has 2 mapped teams but only 1 slots.']);
    expect(buildPlayoffDivisionCapacityWarnings({
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: true,
      divisionDetails: [],
      playoffDivisionDetails: playoffDivisions,
    })).toEqual([]);
  });

  it('normalizes composite division ids and participant counts', () => {
    const compositeId = buildCompositeDivisionTypeId(' Open Skill ', '18+');

    expect(compositeId).toBe('skill_open_skill_age_18');
    expect(parseCompositeDivisionTypeId(compositeId)).toEqual({
      skillDivisionTypeId: 'open_skill',
      ageDivisionTypeId: '18',
    });
    expect(parseCompositeDivisionTypeId('bad')).toBeNull();
    expect(normalizeDivisionKeys([' Open ', 'open', 'null', 'undefined', 12, null])).toEqual(['open', '12']);
    expect(normalizePlayoffDivisionParticipantCount('')).toBeNull();
    expect(normalizePlayoffDivisionParticipantCount('3.9')).toBe(3);
  });

  it('builds division lookup mappings and normalizes slot divisions by id or label', () => {
    const lookup = buildSlotDivisionLookup([
      makeDivisionDetail({ id: 'division_open', name: 'Open Division' }),
      makeDivisionDetail({ id: 'division_advanced', name: 'Advanced Division' }),
    ], [
      {
        id: 'playoff_1',
        key: 'playoff_1',
        kind: 'PLAYOFF',
        name: 'Playoff Bracket',
        maxParticipants: 4,
        playoffConfig: {} as any,
      },
    ]);

    expect(lookup.keys).toEqual(['division_open', 'division_advanced', 'playoff_1']);
    expect(lookup.options.map((option) => option.label)).toEqual([
      'Advanced Division',
      'Open Division',
      'Playoff Bracket',
    ]);
    expect(normalizeSlotDivisionIdsWithLookup([
      'Open Division',
      'division_advanced',
      'Playoff Bracket',
      'missing',
      'Open Division',
    ], lookup)).toEqual(['division_open', 'division_advanced', 'playoff_1', 'missing']);
  });

  it('normalizes division field assignments and compares field maps by set', () => {
    const normalized = normalizeDivisionFieldIds({
      open: ['court_1', 'bad', 'court_1'],
      advanced: [],
    }, ['open', 'advanced'], ['court_1', 'court_2']);

    expect(normalized).toEqual({
      open: ['court_1'],
      advanced: ['court_1', 'court_2'],
    });
    expect(divisionFieldIdsEqual(
      { open: ['court_2', 'court_1'] },
      { open: ['court_1', 'court_2'] },
    )).toBe(true);
    expect(divisionFieldIdsEqual(
      { open: ['court_1'] },
      { open: ['court_2'] },
    )).toBe(false);
  });

  it('derives tournament pool settings grouped by bracket placement ids', () => {
    const settings = deriveTournamentPoolSettingsByBracketId([
      makeDivisionDetail({
        id: 'pool_a',
        maxParticipants: 4,
        playoffPlacementDivisionIds: ['bracket_1'],
      }),
      makeDivisionDetail({
        id: 'pool_b',
        maxParticipants: 4,
        playoffPlacementDivisionIds: ['bracket_1'],
      }),
      makeDivisionDetail({
        id: 'pool_c',
        maxParticipants: 3,
        playoffPlacementDivisionIds: ['bracket_2'],
      }),
      makeDivisionDetail({
        id: 'pool_d',
        maxParticipants: 5,
        playoffPlacementDivisionIds: ['bracket_2'],
      }),
    ]);

    expect(settings.get('bracket_1')).toEqual({
      poolCount: 2,
      poolTeamCount: 4,
    });
    expect(settings.get('bracket_2')).toEqual({
      poolCount: 2,
      poolTeamCount: 4,
    });
  });
});
