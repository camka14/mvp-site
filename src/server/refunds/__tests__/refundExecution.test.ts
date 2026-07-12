/** @jest-environment node */

import {
  resolveRefundablePaymentsForRequest,
  type RefundRequestRow,
} from '@/server/refunds/refundExecution';

type TestBill = {
  id: string;
  eventId: string | null;
  ownerType: 'TEAM' | 'USER';
  ownerId: string;
  parentBillId: string | null;
  slotId: string | null;
  occurrenceDate: string | null;
};

type TestPayment = {
  id: string;
  billId: string;
  amountCents: number;
  refundedAmountCents: number | null;
  paymentIntentId: string | null;
  payerUserId: string | null;
  status: 'PAID';
};

type IdFilter = string | { in: string[] } | undefined;

const matchesIdFilter = (value: string | null, filter: IdFilter): boolean => {
  if (typeof filter === 'undefined') {
    return true;
  }
  if (typeof filter === 'string') {
    return value === filter;
  }
  return filter.in.includes(value ?? '');
};

const createClient = (params: {
  bills: TestBill[];
  payments: TestPayment[];
}) => {
  const billsFindMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
    params.bills
      .filter((bill) => (
        (typeof where.eventId === 'undefined' || bill.eventId === where.eventId)
        && (typeof where.ownerType === 'undefined' || bill.ownerType === where.ownerType)
        && matchesIdFilter(bill.ownerId, where.ownerId as IdFilter)
        && matchesIdFilter(
          bill.parentBillId,
          where.parentBillId as { in: string[] } | undefined,
        )
        && (typeof where.slotId === 'undefined' || bill.slotId === where.slotId)
        && (typeof where.occurrenceDate === 'undefined'
          || bill.occurrenceDate === where.occurrenceDate)
      ))
      .map((bill) => ({ id: bill.id }))
  ));
  const paymentsFindMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
    params.payments.filter((payment) => (
      matchesIdFilter(payment.billId, where.billId as { in: string[] })
      && (typeof where.status === 'undefined' || payment.status === where.status)
      && (typeof where.payerUserId === 'undefined' || payment.payerUserId === where.payerUserId)
      && (where.paymentIntentId !== null || payment.paymentIntentId !== null)
    ))
  ));

  return {
    client: {
      teams: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team_1',
          captainId: 'manager_1',
          managerId: 'manager_1',
          headCoachId: null,
          coachIds: [],
          playerIds: ['child_1', 'child_2'],
          parentTeamId: null,
        }),
      },
      bills: {
        findMany: billsFindMany,
      },
      billPayments: {
        findMany: paymentsFindMany,
      },
    } as any,
    billsFindMany,
    paymentsFindMany,
  };
};

const individualTeamRequest = (): RefundRequestRow => ({
  id: 'refund_1',
  eventId: 'event_1',
  teamId: 'team_1',
  userId: 'child_1',
  requestedByUserId: 'parent_1',
  hostId: 'host_1',
  organizationId: 'org_1',
  reason: 'requested_by_customer',
  status: 'WAITING',
  slotId: 'slot_1',
  occurrenceDate: '2026-07-20',
});

const occurrenceBills: TestBill[] = [
  {
    id: 'team_bill_1',
    eventId: 'event_1',
    ownerType: 'TEAM',
    ownerId: 'team_1',
    parentBillId: null,
    slotId: 'slot_1',
    occurrenceDate: '2026-07-20',
  },
  {
    id: 'child_1_split_bill',
    eventId: 'event_1',
    ownerType: 'USER',
    ownerId: 'child_1',
    parentBillId: 'team_bill_1',
    slotId: 'slot_1',
    occurrenceDate: '2026-07-20',
  },
  {
    id: 'child_2_split_bill',
    eventId: 'event_1',
    ownerType: 'USER',
    ownerId: 'child_2',
    parentBillId: 'team_bill_1',
    slotId: 'slot_1',
    occurrenceDate: '2026-07-20',
  },
  {
    id: 'parent_direct_bill',
    eventId: 'event_1',
    ownerType: 'USER',
    ownerId: 'parent_1',
    parentBillId: null,
    slotId: 'slot_1',
    occurrenceDate: '2026-07-20',
  },
  {
    id: 'child_1_other_occurrence_bill',
    eventId: 'event_1',
    ownerType: 'USER',
    ownerId: 'child_1',
    parentBillId: 'team_bill_1',
    slotId: 'slot_1',
    occurrenceDate: '2026-07-27',
  },
];

const occurrencePayments: TestPayment[] = [
  {
    id: 'shared_team_payment_paid_by_parent',
    billId: 'team_bill_1',
    amountCents: 5000,
    refundedAmountCents: 0,
    paymentIntentId: 'pi_team_parent',
    payerUserId: 'parent_1',
    status: 'PAID',
  },
  {
    id: 'child_1_allocation_paid_by_parent',
    billId: 'child_1_split_bill',
    amountCents: 2500,
    refundedAmountCents: 0,
    paymentIntentId: 'pi_child_1',
    payerUserId: 'parent_1',
    status: 'PAID',
  },
  {
    id: 'child_2_allocation',
    billId: 'child_2_split_bill',
    amountCents: 2500,
    refundedAmountCents: 0,
    paymentIntentId: 'pi_child_2',
    payerUserId: 'child_2',
    status: 'PAID',
  },
  {
    id: 'parent_unrelated_payment',
    billId: 'parent_direct_bill',
    amountCents: 4000,
    refundedAmountCents: 0,
    paymentIntentId: 'pi_parent_direct',
    payerUserId: 'parent_1',
    status: 'PAID',
  },
  {
    id: 'child_1_other_occurrence_payment',
    billId: 'child_1_other_occurrence_bill',
    amountCents: 2500,
    refundedAmountCents: 0,
    paymentIntentId: 'pi_child_1_other_occurrence',
    payerUserId: 'parent_1',
    status: 'PAID',
  },
];

describe('resolveRefundablePaymentsForRequest', () => {
  it('limits an individual team refund to the target allocation for the selected occurrence', async () => {
    const { client, billsFindMany, paymentsFindMany } = createClient({
      bills: occurrenceBills,
      payments: occurrencePayments,
    });

    const payments = await resolveRefundablePaymentsForRequest(
      client,
      individualTeamRequest(),
      { scopeMode: 'INDIVIDUAL' },
    );

    expect(payments.map((payment) => payment.id)).toEqual([
      'child_1_allocation_paid_by_parent',
    ]);
    expect(billsFindMany).toHaveBeenCalledTimes(2);
    expect(billsFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        ownerType: 'TEAM',
        ownerId: { in: ['team_1'] },
        slotId: 'slot_1',
        occurrenceDate: '2026-07-20',
      }),
    }));
    expect(billsFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        ownerType: 'USER',
        ownerId: 'child_1',
        parentBillId: { in: ['team_bill_1'] },
        slotId: 'slot_1',
        occurrenceDate: '2026-07-20',
      }),
    }));
    expect(billsFindMany.mock.calls.some(([args]) => (
      args.where.ownerType === 'USER' && !args.where.parentBillId
    ))).toBe(false);
    expect(paymentsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ billId: { in: ['child_1_split_bill'] } }),
    }));
  });

  it('keeps authorized team payments and split allocations in an explicit team-wide refund', async () => {
    const { client } = createClient({
      bills: occurrenceBills,
      payments: occurrencePayments,
    });
    const request: RefundRequestRow = {
      ...individualTeamRequest(),
      userId: 'manager_1',
      requestedByUserId: 'manager_1',
      authorizedPayerUserIds: ['manager_1', 'parent_1', 'child_1', 'child_2'],
    };
    const payments = await resolveRefundablePaymentsForRequest(
      client,
      request,
      { scopeMode: 'TEAM_WIDE' },
    );

    expect(payments.map((payment) => payment.id)).toEqual([
      'shared_team_payment_paid_by_parent',
      'child_1_allocation_paid_by_parent',
      'child_2_allocation',
    ]);
  });

  it('keeps a target-owned individual bill refundable without expanding to the requester', async () => {
    const { client, billsFindMany } = createClient({
      bills: [
        {
          id: 'child_direct_bill',
          eventId: 'event_1',
          ownerType: 'USER',
          ownerId: 'child_1',
          parentBillId: null,
          slotId: null,
          occurrenceDate: null,
        },
        {
          id: 'parent_direct_bill',
          eventId: 'event_1',
          ownerType: 'USER',
          ownerId: 'parent_1',
          parentBillId: null,
          slotId: null,
          occurrenceDate: null,
        },
      ],
      payments: [
        {
          id: 'child_direct_payment',
          billId: 'child_direct_bill',
          amountCents: 2500,
          refundedAmountCents: 0,
          paymentIntentId: 'pi_child_direct',
          payerUserId: 'parent_1',
          status: 'PAID',
        },
        {
          id: 'parent_direct_payment',
          billId: 'parent_direct_bill',
          amountCents: 4000,
          refundedAmountCents: 0,
          paymentIntentId: 'pi_parent_direct',
          payerUserId: 'parent_1',
          status: 'PAID',
        },
      ],
    });
    const request: RefundRequestRow = {
      ...individualTeamRequest(),
      teamId: null,
      slotId: null,
      occurrenceDate: null,
    };

    const payments = await resolveRefundablePaymentsForRequest(client, request);

    expect(payments.map((payment) => payment.id)).toEqual(['child_direct_payment']);
    expect(billsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        ownerType: 'USER',
        ownerId: 'child_1',
      }),
    }));
  });
});
