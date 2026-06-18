/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripePaymentIntentCreate = jest.fn();
const StripeMock = jest.fn().mockImplementation(() => ({
  paymentIntents: {
    create: (...args: unknown[]) => mockStripePaymentIntentCreate(...args),
  },
}));

const prismaMock = {
  eventRegistrations: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
};

const assertPublicWidgetEventMock = jest.fn();
const verifyGuestRegistrationTokenMock = jest.fn();
const resolveEventRegistrationPriceCentsMock = jest.fn();
const buildDestinationTransferDataMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/publicGuestRegistration', () => {
  const actual = jest.requireActual('@/server/publicGuestRegistration');
  return {
    ...actual,
    assertPublicWidgetEvent: (...args: unknown[]) => assertPublicWidgetEventMock(...args),
    verifyGuestRegistrationToken: (...args: unknown[]) => verifyGuestRegistrationTokenMock(...args),
  };
});
jest.mock('@/server/paidRegistrationGate', () => ({
  resolveEventRegistrationPriceCents: (...args: unknown[]) => resolveEventRegistrationPriceCentsMock(...args),
}));
jest.mock('@/lib/stripeConnectAccounts', () => ({
  buildDestinationTransferData: (...args: unknown[]) => buildDestinationTransferDataMock(...args),
}));

import { POST } from '@/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route';

const requestFor = (body: unknown) => new NextRequest(
  'http://localhost/api/public/organizations/summit/events/event_1/guest-payment-intent',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

describe('public guest payment intent route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_guest';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_guest';
    verifyGuestRegistrationTokenMock.mockReturnValue({
      kind: 'guest_registration',
      organizationId: 'org_1',
      eventId: 'event_1',
      registrationId: 'registration_1',
      parentUserId: 'parent_1',
      registrantId: 'event_team_1',
      eventTeamId: 'event_team_1',
    });
    assertPublicWidgetEventMock.mockResolvedValue({
      organization: {
        id: 'org_1',
        slug: 'summit',
        name: 'Summit United',
      },
      event: {
        id: 'event_1',
        name: 'Spring League',
        eventType: 'LEAGUE',
        location: 'Court 1',
        organizationId: 'org_1',
        start: new Date('2026-04-01T12:00:00.000Z'),
      },
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'event_team_1',
      registrantType: 'TEAM',
      eventTeamId: 'event_team_1',
      status: 'STARTED',
      divisionId: 'division_1',
      divisionTypeId: 'u12',
      divisionTypeKey: 'coed_age_u12',
      slotId: null,
      occurrenceDate: null,
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'parent@test.com' });
    prismaMock.authUser.findUnique.mockResolvedValue({ email: 'parent@test.com' });
    resolveEventRegistrationPriceCentsMock.mockResolvedValue(2500);
    buildDestinationTransferDataMock.mockResolvedValue(null);
    mockStripePaymentIntentCreate.mockResolvedValue({
      id: 'pi_guest',
      client_secret: 'pi_guest_secret_123',
    });
  });

  it('creates a one-time guest PaymentIntent without attaching a Stripe customer', async () => {
    const response = await POST(
      requestFor({ registrationToken: 'guest.jwt' }),
      {
        params: Promise.resolve({
          slug: 'summit',
          eventId: 'event_1',
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paymentIntent).toBe('pi_guest_secret_123');
    expect(mockStripePaymentIntentCreate).toHaveBeenCalledTimes(1);
    const createPayload = mockStripePaymentIntentCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(createPayload.customer).toBeUndefined();
    expect(createPayload.setup_future_usage).toBeUndefined();
    expect(createPayload.receipt_email).toBe('parent@test.com');
    expect(createPayload.metadata).toEqual(expect.objectContaining({
      guest_checkout: 'true',
      purchase_type: 'event',
      team_id: 'event_team_1',
      event_id: 'event_1',
      organization_id: 'org_1',
      registration_id: 'registration_1',
      receipt_email: 'parent@test.com',
    }));
  });
});
