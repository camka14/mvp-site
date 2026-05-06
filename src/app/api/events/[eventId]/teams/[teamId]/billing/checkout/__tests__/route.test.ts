/** @jest-environment node */

import { NextRequest } from 'next/server';

const stripeCheckoutSessionsCreateMock = jest.fn();
const StripeMock = jest.fn(() => ({
  checkout: {
    sessions: {
      create: (...args: unknown[]) => stripeCheckoutSessionsCreateMock(...args),
    },
  },
}));

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const getEventParticipantIdsForEventMock = jest.fn();
const buildDestinationTransferDataMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));
jest.mock('@/server/events/eventRegistrations', () => ({
  getEventParticipantIdsForEvent: (...args: unknown[]) => getEventParticipantIdsForEventMock(...args),
}));
jest.mock('@/lib/stripeConnectAccounts', () => ({
  buildDestinationTransferData: (...args: unknown[]) => buildDestinationTransferDataMock(...args),
}));

import { POST } from '@/app/api/events/[eventId]/teams/[teamId]/billing/checkout/route';

const requestFor = (body: unknown) =>
  new NextRequest('http://localhost/api/events/event_1/teams/team_1/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/teams/[teamId]/billing/checkout', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    getEventParticipantIdsForEventMock.mockResolvedValue({
      teamIds: ['team_1'],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    buildDestinationTransferDataMock.mockResolvedValue({
      destination: 'acct_123',
      amount: 5000,
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Beach Tournament',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      teamSignup: true,
      eventType: 'EVENT',
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Beachside Blockers',
      managerId: 'manager_1',
      captainId: 'captain_1',
      headCoachId: null,
      parentTeamId: null,
    });
    stripeCheckoutSessionsCreateMock.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
  });

  afterAll(() => {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  });

  it('creates a team Checkout Session with event_payment metadata and a QR URL', async () => {
    const response = await POST(
      requestFor({
        ownerType: 'TEAM',
        ownerId: 'team_1',
        eventAmountCents: 5000,
        divisionId: 'open',
        label: 'Event registration - Open',
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      amountCents: 5232,
      eventAmountCents: 5000,
      billOwnerType: 'TEAM',
      billOwnerId: 'team_1',
      payerUserId: 'manager_1',
      checkoutSessionId: 'cs_test_1',
    }));
    expect(payload.qrCodeUrl).toContain('/api/billing/checkout-qr?url=');
    expect(stripeCheckoutSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 5232,
            }),
          }),
        ],
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({
            purchase_type: 'event_payment',
            event_id: 'event_1',
            team_id: 'team_1',
            event_team_id: 'team_1',
            user_id: 'manager_1',
            amount_cents: '5000',
            total_charge_cents: '5232',
            division_id: 'open',
          }),
          transfer_data: {
            destination: 'acct_123',
            amount: 5000,
          },
        }),
      }),
    );
    expect(buildDestinationTransferDataMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      hostUserId: 'host_1',
      transferAmountCents: 5000,
    });
  });

  it('uses parentTeamId as the bill owner for event team checkout payments', async () => {
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Beachside Blockers',
      managerId: 'manager_1',
      captainId: 'captain_1',
      headCoachId: null,
      parentTeamId: 'team_parent',
    });

    const response = await POST(
      requestFor({
        ownerType: 'TEAM',
        ownerId: 'team_1',
        eventAmountCents: 5000,
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      billOwnerType: 'TEAM',
      billOwnerId: 'team_parent',
      payerUserId: 'manager_1',
    }));
    expect(stripeCheckoutSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({
            team_id: 'team_parent',
            event_team_id: 'team_1',
          }),
        }),
      }),
    );
  });

  it('rejects user owner type for a team event', async () => {
    const response = await POST(
      requestFor({
        ownerType: 'USER',
        ownerId: 'user_1',
        eventAmountCents: 5000,
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Team events can only receive payment for teams.');
    expect(stripeCheckoutSessionsCreateMock).not.toHaveBeenCalled();
  });

  it('creates a user Checkout Session for non-team event participants', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Singles Ladder',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      teamSignup: false,
      eventType: 'EVENT',
    });
    getEventParticipantIdsForEventMock.mockResolvedValueOnce({
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
    });
    buildDestinationTransferDataMock.mockResolvedValueOnce(null);

    const response = await POST(
      new NextRequest('http://localhost/api/events/event_1/teams/user_1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType: 'USER',
          ownerId: 'user_1',
          eventAmountCents: 2500,
          label: 'Event registration',
        }),
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'user_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      billOwnerType: 'USER',
      billOwnerId: 'user_1',
      payerUserId: 'user_1',
    }));
    expect(prismaMock.teams.findUnique).not.toHaveBeenCalled();
    expect(stripeCheckoutSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          metadata: expect.not.objectContaining({
            team_id: expect.any(String),
          }),
        }),
      }),
    );
    expect(stripeCheckoutSessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({
            purchase_type: 'event_payment',
            event_id: 'event_1',
            user_id: 'user_1',
            amount_cents: '2500',
          }),
        }),
      }),
    );
  });
});
