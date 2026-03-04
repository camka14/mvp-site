/** @jest-environment node */

import { NextRequest } from 'next/server';

const txBillsCreateMock = jest.fn();
const txBillPaymentsCreateMock = jest.fn();

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));

import { POST } from '@/app/api/events/[eventId]/teams/[teamId]/billing/bills/route';

const requestFor = (body: unknown) =>
  new NextRequest('http://localhost/api/events/event_1/teams/team_1/billing/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/teams/[teamId]/billing/bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      teamIds: ['team_1'],
      teamSignup: true,
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      name: 'Beach Aces',
      playerIds: ['user_2'],
      captainId: 'user_2',
      managerId: null,
      headCoachId: null,
      parentTeamId: null,
    });

    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => (
      callback({
        bills: {
          create: txBillsCreateMock,
        },
        billPayments: {
          create: txBillPaymentsCreateMock,
        },
      })
    ));
  });

  it('creates a team bill with line items and a pending bill payment', async () => {
    txBillsCreateMock.mockResolvedValue({
      id: 'bill_new_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      organizationId: 'org_1',
      totalAmountCents: 5150,
      paidAmountCents: 0,
      nextPaymentAmountCents: 5150,
      nextPaymentDue: new Date('2026-03-04T20:00:00.000Z'),
      parentBillId: null,
      allowSplit: true,
      status: 'OPEN',
      paymentPlanEnabled: false,
      createdBy: 'host_1',
      lineItems: [
        { id: 'line_1', type: 'EVENT', label: 'Beach Tournament Entry', amountCents: 5000 },
        { id: 'line_2', type: 'FEE', label: 'Processing fee', amountCents: 50 },
        { id: 'line_3', type: 'TAX', label: 'Tax', amountCents: 100 },
      ],
      createdAt: new Date('2026-03-04T20:00:00.000Z'),
      updatedAt: new Date('2026-03-04T20:00:00.000Z'),
    });
    txBillPaymentsCreateMock.mockResolvedValue({
      id: 'payment_new_1',
    });

    const response = await POST(
      requestFor({
        ownerType: 'TEAM',
        ownerId: 'team_1',
        eventAmountCents: 5000,
        taxAmountCents: 100,
        allowSplit: true,
        label: 'Beach Tournament Entry',
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(txBillsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          organizationId: 'org_1',
          totalAmountCents: 5150,
          nextPaymentAmountCents: 5150,
          allowSplit: true,
          status: 'OPEN',
          lineItems: [
            { id: 'line_1', type: 'EVENT', label: 'Beach Tournament Entry', amountCents: 5000 },
            { id: 'line_2', type: 'FEE', label: 'Processing fee', amountCents: 50 },
            { id: 'line_3', type: 'TAX', label: 'Tax', amountCents: 100 },
          ],
        }),
      }),
    );
    expect(txBillPaymentsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_new_1',
          sequence: 1,
          amountCents: 5150,
          status: 'PENDING',
          refundedAmountCents: 0,
        }),
      }),
    );
    expect(payload.bill).toEqual(expect.objectContaining({ id: 'bill_new_1', $id: 'bill_new_1' }));
  });

  it('rejects user owner ids that are not on the selected team', async () => {
    const response = await POST(
      requestFor({
        ownerType: 'USER',
        ownerId: 'user_not_on_team',
        eventAmountCents: 5000,
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('User bill owner must be on the selected team.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
