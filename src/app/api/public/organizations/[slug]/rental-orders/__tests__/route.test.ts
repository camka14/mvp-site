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

  it('rejects paid rental creation when Stripe verification is unavailable', async () => {
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
});
