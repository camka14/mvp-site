/** @jest-environment node */

import { NextRequest } from 'next/server';

const stripePaymentIntentsCreateMock = jest.fn();

const prismaMock = {
  products: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  divisions: {
    findFirst: jest.fn(),
  },
  timeSlots: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const loadUserBillingProfileMock = jest.fn();
const resolvePurchaseContextMock = jest.fn();
const calculateTaxQuoteMock = jest.fn();
const buildDestinationTransferDataMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/billingAddress', () => ({
  loadUserBillingProfile: (...args: unknown[]) => loadUserBillingProfileMock(...args),
  resolveBillingAddressInput: jest.fn().mockReturnValue(null),
  upsertUserBillingAddress: jest.fn(),
  validateUsBillingAddress: jest.fn((value) => value),
}));
jest.mock('@/lib/purchaseContext', () => ({
  resolvePurchaseContext: (...args: unknown[]) => resolvePurchaseContextMock(...args),
}));
jest.mock('@/lib/stripeTax', () => ({
  INTERNAL_TAX_CATEGORIES: ['general'],
  calculateTaxQuote: (...args: unknown[]) => calculateTaxQuoteMock(...args),
}));
jest.mock('@/lib/stripeConnectAccounts', () => ({
  buildDestinationTransferData: (...args: unknown[]) => buildDestinationTransferDataMock(...args),
}));
jest.mock('@/lib/stripeCheckoutReuse', () => ({
  buildBillingAddressFingerprint: jest.fn().mockReturnValue('fp_123'),
  findReusableIncompleteProductPaymentIntent: jest.fn().mockResolvedValue(null),
  getCheckoutTaxCalculationIdFromMetadata: jest.fn(),
  getCheckoutTaxCategoryFromMetadata: jest.fn(),
}));
jest.mock('@/app/api/events/[eventId]/registrationDivisionUtils', () => ({
  resolveEventDivisionSelection: jest.fn().mockResolvedValue({ ok: true, selection: {
    divisionId: null,
    divisionTypeId: null,
    divisionTypeKey: null,
  } }),
}));
jest.mock('@/server/repositories/rentalCheckoutLocks', () => ({
  extractRentalCheckoutWindow: jest.fn(),
  releaseRentalCheckoutLocks: jest.fn(),
  reserveRentalCheckoutLocks: jest.fn(),
}));
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    paymentIntents: {
      create: (...args: unknown[]) => stripePaymentIntentsCreateMock(...args),
    },
  })),
}));

import { POST } from '@/app/api/billing/purchase-intent/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/purchase-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const toIsoDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

describe('POST /api/billing/purchase-intent duplicate event registration guards', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_mock';

    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    loadUserBillingProfileMock.mockResolvedValue({
      email: 'user@example.com',
      billingAddress: {
        line1: '123 Main St',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        country: 'US',
      },
    });
    resolvePurchaseContextMock.mockResolvedValue({
      purchaseType: 'event',
      amountCents: 2500,
      taxCategory: 'general',
      eventType: 'EVENT',
      organizationId: null,
      product: null,
    });
    calculateTaxQuoteMock.mockResolvedValue({
      subtotalCents: 2500,
      stripeFeeCents: 90,
      processingFeeCents: 90,
      taxAmountCents: 0,
      totalChargeCents: 2590,
      hostReceivesCents: 2500,
      feePercentage: 0.01,
      purchaseType: 'event',
      taxCategory: 'general',
      calculationId: 'tax_calc_1',
      customerId: 'cus_1',
      stripeProcessingFeeCents: 90,
      stripeTaxServiceFeeCents: 0,
    });
    buildDestinationTransferDataMock.mockResolvedValue(null);
    stripePaymentIntentsCreateMock.mockResolvedValue({
      id: 'pi_1',
      client_secret: 'pi_1_secret',
    });

    prismaMock.products.findUnique.mockResolvedValue(null);
    prismaMock.teams.findUnique.mockResolvedValue({ id: 'team_1' });
    prismaMock.divisions.findFirst.mockResolvedValue(null);
    prismaMock.timeSlots.findUnique.mockResolvedValue({
      id: 'slot_1',
      divisions: ['div_a'],
      daysOfWeek: [1],
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.create.mockResolvedValue({});
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    prismaMock.eventRegistrations.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'event_1',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: ['div_a'],
        maxParticipants: 20,
        teamSignup: false,
        eventType: 'EVENT',
        parentEvent: null,
        timeSlotIds: [],
      },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
      $queryRaw: prismaMock.$queryRaw,
      teams: {
        findUnique: prismaMock.teams.findUnique,
      },
      divisions: {
        findFirst: prismaMock.divisions.findFirst,
      },
      timeSlots: {
        findUnique: prismaMock.timeSlots.findUnique,
      },
      eventRegistrations: {
        findMany: prismaMock.eventRegistrations.findMany,
        findUnique: prismaMock.eventRegistrations.findUnique,
        create: prismaMock.eventRegistrations.create,
        update: prismaMock.eventRegistrations.update,
        deleteMany: prismaMock.eventRegistrations.deleteMany,
      },
    }));
  });

  it('rejects a second individual checkout before creating a payment intent', async () => {
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: 'event_1__self__user_1',
      status: 'ACTIVE',
      createdAt: new Date('2026-03-18T12:00:00.000Z'),
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
    });

    const response = await POST(jsonPost({
      user: { $id: 'user_1' },
      event: { $id: 'event_1', price: 2500, eventType: 'EVENT' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error ?? '')).toContain('already registered');
    expect(stripePaymentIntentsCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });

  it('rejects a second weekly team checkout for the same occurrence before creating a payment intent', async () => {
    const futureOccurrence = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    futureOccurrence.setHours(0, 0, 0, 0);
    const futureOccurrenceDate = toIsoDateString(futureOccurrence);
    const slotStartDate = new Date(futureOccurrence.getTime() - 7 * 24 * 60 * 60 * 1000);
    const slotEndDate = new Date(futureOccurrence.getTime() + 7 * 24 * 60 * 60 * 1000);

    resolvePurchaseContextMock.mockResolvedValueOnce({
      purchaseType: 'event',
      amountCents: 2500,
      taxCategory: 'general',
      eventType: 'WEEKLY_EVENT',
      organizationId: null,
      product: null,
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'weekly_parent',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: ['div_a'],
        maxParticipants: 20,
        teamSignup: true,
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        timeSlotIds: ['slot_1'],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: `weekly_parent__team__team_1__slot_1__${futureOccurrenceDate}`,
      status: 'STARTED',
      createdAt: new Date('2026-03-18T12:00:00.000Z'),
      divisionId: null,
      divisionTypeId: null,
      divisionTypeKey: null,
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      divisions: ['div_a'],
      daysOfWeek: [toMondayIndex(futureOccurrence)],
      startDate: toIsoDateString(slotStartDate),
      endDate: toIsoDateString(slotEndDate),
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
    });

    const response = await POST(jsonPost({
      user: { $id: 'user_1' },
      team: { $id: 'team_1' },
      event: {
        $id: 'weekly_parent',
        price: 2500,
        eventType: 'WEEKLY_EVENT',
        teamSignup: true,
        timeSlotIds: ['slot_1'],
      },
      slotId: 'slot_1',
      occurrenceDate: futureOccurrenceDate,
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error ?? '')).toContain('already registered');
    expect(stripePaymentIntentsCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });

  it('rejects weekly checkout for an occurrence that has already started', async () => {
    const pastOccurrence = new Date(Date.now() - 24 * 60 * 60 * 1000);
    pastOccurrence.setHours(0, 0, 0, 0);
    const pastOccurrenceDate = toIsoDateString(pastOccurrence);
    const slotStartDate = new Date(pastOccurrence.getTime() - 7 * 24 * 60 * 60 * 1000);
    const slotEndDate = new Date(pastOccurrence.getTime() + 7 * 24 * 60 * 60 * 1000);

    resolvePurchaseContextMock.mockResolvedValueOnce({
      purchaseType: 'event',
      amountCents: 2500,
      taxCategory: 'general',
      eventType: 'WEEKLY_EVENT',
      organizationId: null,
      product: null,
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'weekly_parent',
        start: new Date('2026-03-18T12:00:00.000Z'),
        minAge: null,
        maxAge: null,
        sportId: null,
        registrationByDivisionType: false,
        divisions: ['div_a'],
        maxParticipants: 20,
        teamSignup: true,
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        timeSlotIds: ['slot_1'],
      },
    ]);
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      divisions: ['div_a'],
      daysOfWeek: [toMondayIndex(pastOccurrence)],
      startDate: toIsoDateString(slotStartDate),
      endDate: toIsoDateString(slotEndDate),
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
    });

    const response = await POST(jsonPost({
      user: { $id: 'user_1' },
      team: { $id: 'team_1' },
      event: {
        $id: 'weekly_parent',
        price: 2500,
        eventType: 'WEEKLY_EVENT',
        teamSignup: true,
        timeSlotIds: ['slot_1'],
      },
      slotId: 'slot_1',
      occurrenceDate: pastOccurrenceDate,
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error ?? '')).toContain('already started');
    expect(stripePaymentIntentsCreateMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });
});
