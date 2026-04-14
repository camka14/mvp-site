/** @jest-environment node */

import { NextRequest } from 'next/server';

const stripeInvoicesUpdateMock = jest.fn();
const stripeSubscriptionsRetrieveMock = jest.fn();
const syncManagedOrganizationStripeAccountMock = jest.fn();
const StripeMock = jest.fn(() => ({
  invoices: {
    update: (...args: any[]) => stripeInvoicesUpdateMock(...args),
  },
  subscriptions: {
    retrieve: (...args: any[]) => stripeSubscriptionsRetrieveMock(...args),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
}));

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  subscriptions: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  products: {
    findUnique: jest.fn(),
  },
  stripeAccounts: {
    findFirst: jest.fn(),
  },
  events: {
    update: jest.fn(),
  },
  eventRegistrations: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

const sendPurchaseReceiptEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/server/purchaseReceipts', () => ({
  sendPurchaseReceiptEmail: (...args: any[]) => sendPurchaseReceiptEmailMock(...args),
}));
jest.mock('@/server/organizationStripeVerification', () => ({
  syncManagedOrganizationStripeAccount: (...args: any[]) => syncManagedOrganizationStripeAccountMock(...args),
}));

import { POST } from '@/app/api/billing/webhook/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const buildPaymentIntentSucceededEvent = ({
  intentId,
  metadata,
  amount = 5000,
  amountReceived = amount,
}: {
  intentId: string;
  metadata: Record<string, string>;
  amount?: number;
  amountReceived?: number;
}) => ({
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: intentId,
      metadata,
      amount,
      amount_received: amountReceived,
    },
  },
});

describe('POST /api/billing/webhook', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    sendPurchaseReceiptEmailMock.mockResolvedValue({ sent: true });
    delete process.env.STRIPE_SECRET_KEY;
    stripeInvoicesUpdateMock.mockResolvedValue({});
    stripeSubscriptionsRetrieveMock.mockResolvedValue({
      id: 'sub_123',
      metadata: {
        purchase_type: 'product_subscription',
        product_id: 'product_1',
        user_id: 'user_1',
        organization_id: 'org_1',
      },
      items: {
        data: [
          {
            metadata: { line_type: 'product_base' },
            price: { unit_amount: 2500 },
          },
          {
            metadata: { line_type: 'platform_fee' },
            price: { unit_amount: 303 },
          },
        ],
      },
    });

    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      totalAmountCents: 5000,
      status: 'OPEN',
      parentBillId: null,
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.bills.update.mockResolvedValue({});
    prismaMock.bills.create.mockResolvedValue({ id: 'bill_created_1' });

    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'bill_payment_1',
        amountCents: 5000,
        status: 'PAID',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        paymentIntentId: 'pi_bill_1',
      },
    ]);
    prismaMock.billPayments.update.mockResolvedValue({});
    prismaMock.billPayments.findFirst.mockResolvedValue(null);
    prismaMock.billPayments.create.mockResolvedValue({ id: 'bill_payment_created_1' });

    prismaMock.subscriptions.findFirst.mockResolvedValue(null);
    prismaMock.subscriptions.create.mockResolvedValue({});
    prismaMock.products.findUnique.mockResolvedValue({
      id: 'product_1',
      priceCents: 1200,
      period: 'MONTH',
      organizationId: 'org_1',
    });
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });
    prismaMock.events.update.mockResolvedValue({});
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prismaMock.eventRegistrations.create.mockResolvedValue({});
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    syncManagedOrganizationStripeAccountMock.mockResolvedValue({ verificationStatus: 'PENDING' });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: ['team_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);

    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        bills: {
          create: prismaMock.bills.create,
        },
        billPayments: {
          findFirst: prismaMock.billPayments.findFirst,
          create: prismaMock.billPayments.create,
        },
        events: {
          update: prismaMock.events.update,
        },
        eventRegistrations: {
          findUnique: prismaMock.eventRegistrations.findUnique,
          create: prismaMock.eventRegistrations.create,
          update: prismaMock.eventRegistrations.update,
        },
        $queryRaw: prismaMock.$queryRaw,
      };
      return callback(tx);
    });
  });

  afterAll(() => {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  });

  it('creates a paid bill and bill payment for an instant event purchase and sends a receipt', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(null);

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          organizationId: 'org_1',
          totalAmountCents: 4700,
          paidAmountCents: 4700,
          status: 'PAID',
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_instant_1',
          amountCents: 4700,
          status: 'PAID',
          paymentIntentId: 'pi_event_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          teamIds: ['team_1'],
          waitListIds: [],
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event_1__team__team_1',
          eventId: 'event_1',
          registrantId: 'team_1',
          registrantType: 'TEAM',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'event',
        userId: 'user_1',
        teamId: 'team_1',
        eventId: 'event_1',
        billId: 'bill_instant_1',
        billPaymentId: 'bill_payment_instant_1',
      }),
    );
  });

  it('syncs managed organization verification when Stripe sends account.updated', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    prismaMock.stripeAccounts.findFirst.mockResolvedValueOnce({ organizationId: 'org_1' });

    const response = await POST(
      jsonPost({
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_org_123',
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(syncManagedOrganizationStripeAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        accountId: 'acct_org_123',
      }),
    );
  });

  it('skips event registration activation when reservation metadata is present but registration is missing', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_missing_res_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_missing_res_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce(null);

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_missing_reservation_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          registration_id: 'event_1__team__team_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
  });

  it('activates an existing weekly team reservation using occurrence-aware registration ids', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_weekly_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_weekly_1' });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        teamSignup: true,
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({ status: 'STARTED' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_weekly_team_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'weekly_parent',
          organization_id: 'org_1',
          registration_id: 'weekly_parent__team__team_1__slot_1__2026-04-14',
          occurrence_slot_id: 'slot_1',
          occurrence_date: '2026-04-14',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'weekly_parent__team__team_1__slot_1__2026-04-14' },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for repeated instant webhook events by payment intent id', async () => {
    prismaMock.billPayments.findFirst.mockResolvedValueOnce({
      id: 'bill_payment_existing_1',
      billId: 'bill_existing_1',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_duplicate_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          amount_cents: '4500',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.bills.create).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.create).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('creates a paid bill for a single-purchase product without creating a subscription record', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_product_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_product_1' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_product_1',
        metadata: {
          purchase_type: 'product',
          user_id: 'user_1',
          organization_id: 'org_1',
          product_id: 'product_1',
          product_name: 'Day pass',
          amount_cents: '2000',
        },
        amount: 2150,
        amountReceived: 2150,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'USER',
          ownerId: 'user_1',
          organizationId: 'org_1',
          totalAmountCents: 2150,
          paidAmountCents: 2150,
          status: 'PAID',
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              type: 'PRODUCT',
              label: 'Day pass',
            }),
          ]),
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_product_1',
          amountCents: 2150,
          status: 'PAID',
          paymentIntentId: 'pi_product_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.subscriptions.create).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'product',
        productId: 'product_1',
        billId: 'bill_product_1',
        billPaymentId: 'bill_payment_product_1',
      }),
    );
  });

  it('marks bill installments paid and sends a receipt on first successful bill payment', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_payment_1' },
        data: expect.objectContaining({
          status: 'PAID',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'bill',
        billId: 'bill_1',
        billPaymentId: 'bill_payment_1',
      }),
    );
  });

  it('does not send duplicate receipt emails when bill payment is already marked paid', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PAID',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_already_paid_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('configures renewal invoices for connected-account destination charges on invoice.created', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const response = await POST(
      jsonPost({
        type: 'invoice.created',
        data: {
          object: {
            id: 'in_123',
            status: 'draft',
            total: 2978,
            parent: {
              subscription_details: {
                subscription: 'sub_123',
              },
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(stripeSubscriptionsRetrieveMock).toHaveBeenCalledWith('sub_123', {
      expand: ['items.data.price'],
    });
    expect(stripeInvoicesUpdateMock).toHaveBeenCalledWith('in_123', {
      application_fee_amount: 478,
      transfer_data: {
        destination: 'acct_connected_123',
      },
    });
  });
});
