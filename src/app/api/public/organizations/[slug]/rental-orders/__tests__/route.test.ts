/** @jest-environment node */

import { NextRequest } from 'next/server';

const organizationsFindUniqueMock = jest.fn();
const fieldsFindManyMock = jest.fn();
const facilitiesFindManyMock = jest.fn();
const timeSlotsFindManyMock = jest.fn();
const prismaTransactionMock = jest.fn();
const requireSessionMock = jest.fn();
const assertNoEventFieldSchedulingConflictsMock = jest.fn();
const txRentalBookingsFindUniqueMock = jest.fn();
const txRentalBookingsCreateMock = jest.fn();
const txRentalBookingItemsFindManyMock = jest.fn();
const txRentalBookingItemsCreateMock = jest.fn();
const txBillsCreateMock = jest.fn();
const txBillsUpdateMock = jest.fn();
const txBillPaymentsFindFirstMock = jest.fn();
const txBillPaymentsCreateMock = jest.fn();
const stripePaymentIntentsRetrieveMock = jest.fn();
const StripeMock = jest.fn().mockImplementation(() => ({
  paymentIntents: {
    retrieve: (...args: unknown[]) => stripePaymentIntentsRetrieveMock(...args),
  },
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organizations: {
      findUnique: (...args: any[]) => organizationsFindUniqueMock(...args),
    },
    fields: {
      findMany: (...args: any[]) => fieldsFindManyMock(...args),
    },
    facilities: {
      findMany: (...args: any[]) => facilitiesFindManyMock(...args),
    },
    timeSlots: {
      findMany: (...args: any[]) => timeSlotsFindManyMock(...args),
    },
    $transaction: (...args: any[]) => prismaTransactionMock(...args),
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

class MockEventFieldConflictError extends Error {
  conflicts: unknown;

  constructor(message: string, conflicts?: unknown) {
    super(message);
    this.conflicts = conflicts;
  }
}

jest.mock('@/server/repositories/events', () => ({
  EventFieldConflictError: MockEventFieldConflictError,
  assertNoEventFieldSchedulingConflicts: (...args: any[]) => (
    assertNoEventFieldSchedulingConflictsMock(...args)
  ),
}));

import { POST } from '@/app/api/public/organizations/[slug]/rental-orders/route';

const createRequest = (body: unknown) => new NextRequest('http://localhost/api/public/organizations/summit/rental-orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const params = Promise.resolve({ slug: 'summit' });

const baseSelection = {
  scheduledFieldIds: ['field_1'],
  startDate: '2099-04-21T17:00:00.000Z',
  endDate: '2099-04-21T18:00:00.000Z',
};

const mockPaidRentalInventory = () => {
  organizationsFindUniqueMock.mockResolvedValue({
    id: 'org_1',
    name: 'Summit',
    logoId: 'file_logo_1',
    sports: ['Indoor Volleyball'],
    location: 'Main Gym',
    address: '123 Main St',
    coordinates: [-122.4, 37.8],
    ownerId: 'owner_1',
    publicPageEnabled: true,
  });
  fieldsFindManyMock.mockResolvedValue([
    {
      id: 'field_1',
      name: 'Court 1',
      rentalSlotIds: ['slot_1'],
      location: '',
      facilityId: 'facility_1',
      long: -122.4,
      lat: 37.8,
    },
  ]);
  facilitiesFindManyMock.mockResolvedValue([
    {
      id: 'facility_1',
      name: 'Main Gym',
      location: 'Main Gym',
    },
  ]);
  timeSlotsFindManyMock.mockResolvedValue([
    {
      id: 'slot_1',
      startDate: '2099-04-21T16:00:00.000Z',
      endDate: '2099-04-21T19:00:00.000Z',
      repeating: false,
      price: 2400,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
    },
  ]);
};

const mockRecurringOvernightRentalInventory = ({
  endDate = '2030-06-30T00:00:00.000Z',
  endTimeMinutes = 2 * 60,
}: {
  endDate?: string;
  endTimeMinutes?: number;
} = {}) => {
  organizationsFindUniqueMock.mockResolvedValue({
    id: 'org_1',
    name: 'Summit',
    sports: ['Indoor Volleyball'],
    location: 'Main Gym',
    address: '123 Main St',
    coordinates: [-122.4, 37.8],
    ownerId: 'owner_1',
    publicPageEnabled: true,
  });
  fieldsFindManyMock.mockResolvedValue([
    {
      id: 'field_1',
      name: 'Court 1',
      rentalSlotIds: ['slot_1'],
      location: '',
      facilityId: 'facility_1',
      long: -122.4,
      lat: 37.8,
    },
  ]);
  facilitiesFindManyMock.mockResolvedValue([
    {
      id: 'facility_1',
      name: 'Main Gym',
      location: 'Main Gym',
    },
  ]);
  timeSlotsFindManyMock.mockResolvedValue([
    {
      id: 'slot_1',
      startDate: '2030-06-03T00:00:00.000Z',
      endDate,
      repeating: true,
      dayOfWeek: 0,
      daysOfWeek: [0],
      startTimeMinutes: 22 * 60,
      endTimeMinutes,
      timeZone: 'UTC',
      price: 0,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
    },
  ]);
};

const mockOverlappingRentalInventory = (slots: Array<Record<string, unknown>>) => {
  organizationsFindUniqueMock.mockResolvedValue({
    id: 'org_1',
    name: 'Summit',
    sports: ['Indoor Volleyball'],
    location: 'Main Gym',
    address: '123 Main St',
    coordinates: [-122.4, 37.8],
    ownerId: 'owner_1',
    publicPageEnabled: true,
  });
  fieldsFindManyMock.mockResolvedValue([
    {
      id: 'field_1',
      name: 'Court 1',
      rentalSlotIds: slots.map((slot) => String(slot.id)),
      location: '',
      facilityId: 'facility_1',
      long: -122.4,
      lat: 37.8,
    },
  ]);
  facilitiesFindManyMock.mockResolvedValue([
    {
      id: 'facility_1',
      name: 'Main Gym',
      location: 'Main Gym',
    },
  ]);
  timeSlotsFindManyMock.mockResolvedValue(slots);
};

describe('/api/public/organizations/[slug]/rental-orders POST', () => {
  const originalStripeSecretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    facilitiesFindManyMock.mockResolvedValue([]);
    timeSlotsFindManyMock.mockResolvedValue([]);
    assertNoEventFieldSchedulingConflictsMock.mockResolvedValue(undefined);
    txRentalBookingsFindUniqueMock.mockResolvedValue(null);
    txRentalBookingsCreateMock.mockImplementation(async ({ data }) => ({
      id: data.id,
      billId: data.billId,
      eventId: data.eventId,
      totalAmountCents: data.totalAmountCents,
      paymentIntentId: data.paymentIntentId,
    }));
    txRentalBookingItemsFindManyMock.mockResolvedValue([]);
    txRentalBookingItemsCreateMock.mockResolvedValue({});
    txBillsCreateMock.mockResolvedValue({ id: 'bill_1' });
    txBillsUpdateMock.mockResolvedValue({});
    txBillPaymentsFindFirstMock.mockResolvedValue(null);
    txBillPaymentsCreateMock.mockResolvedValue({ id: 'bill_payment_1' });
    prismaTransactionMock.mockImplementation(async (callback: any) => callback({
      rentalBookings: {
        findUnique: txRentalBookingsFindUniqueMock,
        create: txRentalBookingsCreateMock,
      },
      rentalBookingItems: {
        findMany: txRentalBookingItemsFindManyMock,
        create: txRentalBookingItemsCreateMock,
      },
      bills: {
        create: txBillsCreateMock,
        update: txBillsUpdateMock,
      },
      billPayments: {
        findFirst: txBillPaymentsFindFirstMock,
        create: txBillPaymentsCreateMock,
      },
    }));
  });

  afterAll(() => {
    if (originalStripeSecretKey) {
      process.env.STRIPE_SECRET_KEY = originalStripeSecretKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it('returns 400 when the requested sport is not configured for the organization', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      sports: ['Indoor Volleyball'],
      location: null,
      address: null,
      coordinates: null,
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: 'Indoor Soccer',
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/not available/i);
    expect(fieldsFindManyMock).not.toHaveBeenCalled();
  });

  it('rejects rental selections that start in the past', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      sports: ['Indoor Volleyball'],
      location: 'Main Gym',
      address: '123 Main St',
      coordinates: [-122.4, 37.8],
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });
    fieldsFindManyMock.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court 1',
        rentalSlotIds: ['slot_1'],
        location: '',
        facilityId: 'facility_1',
      },
    ]);
    timeSlotsFindManyMock.mockResolvedValue([
      {
        id: 'slot_1',
        startDate: '2001-04-21T16:00:00.000Z',
        endDate: '2001-04-21T19:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2001-04-21T17:00:00.000Z',
        endDate: '2001-04-21T18:00:00.000Z',
      }],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Rental selections must start in the future.');
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it('creates a confirmed rental booking without creating a private event', async () => {
    organizationsFindUniqueMock.mockResolvedValue({
      id: 'org_1',
      name: 'Summit',
      logoId: 'file_logo_1',
      sports: ['Indoor Volleyball'],
      location: 'Main Gym',
      address: '123 Main St',
      coordinates: [-122.4, 37.8],
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });
    fieldsFindManyMock.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court 1',
        rentalSlotIds: ['slot_1'],
        location: '',
        facilityId: 'facility_1',
        long: -122.4,
        lat: 37.8,
      },
    ]);
    facilitiesFindManyMock.mockResolvedValue([
      {
        id: 'facility_1',
        name: 'Main Gym',
        location: 'Main Gym',
      },
    ]);
    timeSlotsFindManyMock.mockResolvedValue([
      {
        id: 'slot_1',
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T19:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'event_1',
      selections: [baseSelection],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toMatchObject({
      bookingId: 'event_1',
      billId: null,
      eventId: null,
      totalCents: 0,
      items: [
        expect.objectContaining({
          id: 'event_1__item_1',
          fieldId: 'field_1',
          start: '2099-04-21T17:00:00.000Z',
          end: '2099-04-21T18:00:00.000Z',
        }),
      ],
    });
    expect(json.createEventUrl).toBe('/events/event_1/schedule?create=1');
    expect(txRentalBookingsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'event_1',
        organizationId: 'org_1',
        renterType: 'USER',
        renterUserId: 'user_1',
        status: 'CONFIRMED',
        totalAmountCents: 0,
      }),
    }));
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'event_1__item_1',
        bookingId: 'event_1',
        organizationId: 'org_1',
        facilityId: 'facility_1',
        fieldId: 'field_1',
        availabilitySlotId: 'slot_1',
        status: 'CONFIRMED',
        timeZone: 'America/Los_Angeles',
        start: new Date('2099-04-21T17:00:00.000Z'),
        end: new Date('2099-04-21T18:00:00.000Z'),
      }),
    }));
    expect(txBillsCreateMock).not.toHaveBeenCalled();
    expect(assertNoEventFieldSchedulingConflictsMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: expect.stringMatching(/^rental-booking-conflict:/),
    }));
    expect(assertNoEventFieldSchedulingConflictsMock).not.toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
    }));
  });

  it('checks disjoint selections independently so a booking in the gap does not conflict', async () => {
    mockPaidRentalInventory();
    timeSlotsFindManyMock.mockResolvedValue([{
      id: 'slot_1',
      startDate: '2099-04-21T09:00:00.000Z',
      endDate: '2099-04-21T17:00:00.000Z',
      repeating: false,
      price: 0,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
    }]);
    const gapStart = new Date('2099-04-21T12:00:00.000Z');
    const gapEnd = new Date('2099-04-21T14:00:00.000Z');
    assertNoEventFieldSchedulingConflictsMock.mockImplementation(async ({ start, end }) => {
      if (start < gapEnd && end > gapStart) {
        throw new MockEventFieldConflictError('The gap is occupied.');
      }
    });

    const response = await POST(createRequest({
      eventId: 'event_disjoint',
      selections: [
        {
          scheduledFieldIds: ['field_1'],
          startDate: '2099-04-21T10:00:00.000Z',
          endDate: '2099-04-21T11:00:00.000Z',
        },
        {
          scheduledFieldIds: ['field_1'],
          startDate: '2099-04-21T15:00:00.000Z',
          endDate: '2099-04-21T16:00:00.000Z',
        },
      ],
    }), { params });

    expect(response.status).toBe(201);
    expect(assertNoEventFieldSchedulingConflictsMock).toHaveBeenCalledTimes(2);
    expect(assertNoEventFieldSchedulingConflictsMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      fieldIds: ['field_1'],
      start: new Date('2099-04-21T10:00:00.000Z'),
      end: new Date('2099-04-21T11:00:00.000Z'),
      noFixedEndDateTime: false,
    }));
    expect(assertNoEventFieldSchedulingConflictsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fieldIds: ['field_1'],
      start: new Date('2099-04-21T15:00:00.000Z'),
      end: new Date('2099-04-21T16:00:00.000Z'),
      noFixedEndDateTime: false,
    }));
  });

  it('selects the shortest covering slot before field order or price', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_rental';
    mockOverlappingRentalInventory([
      {
        id: 'slot_long',
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T20:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_short',
        startDate: '2099-04-21T17:00:00.000Z',
        endDate: '2099-04-21T19:00:00.000Z',
        repeating: false,
        price: 1200,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);
    stripePaymentIntentsRetrieveMock.mockResolvedValue({
      status: 'succeeded',
      amount: 1200,
      amount_received: 1200,
      metadata: {
        purchase_type: 'rental',
        event_id: 'booking_shortest_slot',
        organization_id: 'org_1',
        user_id: 'user_1',
        amount_cents: '1200',
        total_charge_cents: '1200',
      },
    });

    const response = await POST(createRequest({
      eventId: 'booking_shortest_slot',
      selections: [baseSelection],
      sportId: null,
      paymentIntentId: 'pi_shortest_slot',
    }), { params });

    expect(response.status).toBe(201);
    expect(stripePaymentIntentsRetrieveMock).toHaveBeenCalledWith('pi_shortest_slot');
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_short',
        priceCents: 1200,
      }),
    }));
  });

  it('uses elapsed duration to select the shorter overlapping multi-day explicit slot', async () => {
    mockOverlappingRentalInventory([
      {
        id: 'slot_26_hours',
        startDate: '2099-04-20T16:00:00.000Z',
        endDate: '2099-04-21T18:00:00.000Z',
        repeating: false,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_24_hours',
        startDate: '2099-04-20T17:00:00.000Z',
        endDate: '2099-04-21T17:00:00.000Z',
        repeating: false,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'booking_shortest_elapsed_slot',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T16:30:00.000Z',
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });

    expect(response.status).toBe(201);
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_24_hours',
      }),
    }));
  });

  it('uses zero before null price and slot ID to resolve an otherwise equal overlap', async () => {
    mockOverlappingRentalInventory([
      {
        id: 'slot_null_price',
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T19:00:00.000Z',
        repeating: false,
        price: null,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_z',
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T19:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_a',
        startDate: '2099-04-21T16:00:00.000Z',
        endDate: '2099-04-21T19:00:00.000Z',
        repeating: false,
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'booking_stable_slot',
      selections: [baseSelection],
      sportId: null,
    }), { params });

    expect(response.status).toBe(201);
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_a',
        priceCents: 0,
      }),
    }));
  });

  it('derives nullable recurring bounds for both coverage and duration ordering', async () => {
    mockOverlappingRentalInventory([
      {
        id: 'slot_longer',
        startDate: '2030-06-03T19:00:00.000Z',
        endDate: '2030-06-25T05:00:00.000Z',
        repeating: true,
        daysOfWeek: [0],
        startTimeMinutes: null,
        endTimeMinutes: null,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_short_non_covering',
        startDate: '2030-06-03T22:00:00.000Z',
        endDate: '2030-06-25T02:00:00.000Z',
        repeating: true,
        daysOfWeek: [0],
        startTimeMinutes: null,
        endTimeMinutes: null,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
      {
        id: 'slot_long',
        startDate: '2030-06-03T20:00:00.000Z',
        endDate: '2030-06-25T04:00:00.000Z',
        repeating: true,
        daysOfWeek: [0],
        startTimeMinutes: null,
        endTimeMinutes: null,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'booking_nullable_bounds',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2030-06-10T21:00:00.000Z',
        endDate: '2030-06-10T23:00:00.000Z',
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });

    expect(response.status).toBe(201);
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_long',
      }),
    }));
  });

  it('rejects a recurring rental slot without a usable nullable end bound', async () => {
    mockOverlappingRentalInventory([
      {
        id: 'slot_without_end',
        startDate: '2030-06-03T20:00:00.000Z',
        endDate: null,
        repeating: true,
        daysOfWeek: [0],
        startTimeMinutes: null,
        endTimeMinutes: null,
        timeZone: 'UTC',
        price: 0,
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
      },
    ]);

    const response = await POST(createRequest({
      eventId: 'booking_missing_nullable_end',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2030-06-10T21:00:00.000Z',
        endDate: '2030-06-10T22:00:00.000Z',
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/not available for the selected time/i);
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ['midnight', '2030-06-11T00:00:00.000Z'],
    ['1:00 AM', '2030-06-11T01:00:00.000Z'],
  ])('accepts a Monday overnight recurring rental ending at %s Tuesday', async (_label, endDate) => {
    mockRecurringOvernightRentalInventory();

    const response = await POST(createRequest({
      eventId: 'booking_overnight',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2030-06-10T22:00:00.000Z',
        endDate,
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });

    expect(response.status).toBe(201);
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_1',
        start: new Date('2030-06-10T22:00:00.000Z'),
        end: new Date(endDate),
      }),
    }));
  });

  it('allows an overnight occurrence to end the day after its final recurrence anchor', async () => {
    mockRecurringOvernightRentalInventory({
      endDate: '2030-06-10T00:00:00.000Z',
    });

    const response = await POST(createRequest({
      eventId: 'booking_final_anchor',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2030-06-10T22:00:00.000Z',
        endDate: '2030-06-11T02:00:00.000Z',
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });

    expect(response.status).toBe(201);
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        availabilitySlotId: 'slot_1',
        start: new Date('2030-06-10T22:00:00.000Z'),
        end: new Date('2030-06-11T02:00:00.000Z'),
      }),
    }));
  });

  it('rejects a recurring rental slot with equal start and end minutes', async () => {
    mockRecurringOvernightRentalInventory({ endTimeMinutes: 22 * 60 });

    const response = await POST(createRequest({
      eventId: 'booking_equal_times',
      selections: [{
        scheduledFieldIds: ['field_1'],
        startDate: '2030-06-10T22:00:00.000Z',
        endDate: '2030-06-10T22:30:00.000Z',
        timeZone: 'UTC',
      }],
      sportId: null,
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/not available for the selected time/i);
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it('rejects paid rental creation when Stripe verification is unavailable', async () => {
    mockPaidRentalInventory();

    const response = await POST(createRequest({
      eventId: 'booking_1',
      selections: [baseSelection],
      sportId: null,
      paymentIntentId: 'pi_rental_1',
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toMatch(/payment processing is unavailable/i);
    expect(txBillsCreateMock).not.toHaveBeenCalled();
    expect(txBillPaymentsCreateMock).not.toHaveBeenCalled();
    expect(txRentalBookingsCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a processing PaymentIntent without creating paid rental state', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_rental';
    mockPaidRentalInventory();
    stripePaymentIntentsRetrieveMock.mockResolvedValue({ status: 'processing' });

    const response = await POST(createRequest({
      eventId: 'booking_1',
      selections: [baseSelection],
      sportId: null,
      paymentIntentId: 'pi_rental_processing',
    }), { params });
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json.error).toBe('Payment has not completed yet.');
    expect(stripePaymentIntentsRetrieveMock).toHaveBeenCalledWith('pi_rental_processing');
    expect(txBillsCreateMock).not.toHaveBeenCalled();
    expect(txBillPaymentsCreateMock).not.toHaveBeenCalled();
    expect(txRentalBookingsCreateMock).not.toHaveBeenCalled();
    expect(txRentalBookingItemsCreateMock).not.toHaveBeenCalled();
  });

  it('creates paid rental state only after a succeeded PaymentIntent', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_rental';
    mockPaidRentalInventory();
    stripePaymentIntentsRetrieveMock.mockResolvedValue({
      status: 'succeeded',
      amount: 2400,
      amount_received: 2400,
      metadata: {
        purchase_type: 'rental',
        event_id: 'booking_1',
        organization_id: 'org_1',
        user_id: 'user_1',
        amount_cents: '2400',
        total_charge_cents: '2400',
      },
    });

    const response = await POST(createRequest({
      eventId: 'booking_1',
      selections: [baseSelection],
      sportId: null,
      paymentIntentId: 'pi_rental_succeeded',
    }), { params });

    expect(response.status).toBe(201);
    expect(txBillsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PAID',
        paidAmountCents: 2400,
      }),
    }));
    expect(txBillPaymentsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PAID', paymentIntentId: 'pi_rental_succeeded' }),
    }));
    expect(txRentalBookingsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CONFIRMED', paymentIntentId: 'pi_rental_succeeded' }),
    }));
    expect(txRentalBookingItemsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CONFIRMED' }),
    }));
  });
});
