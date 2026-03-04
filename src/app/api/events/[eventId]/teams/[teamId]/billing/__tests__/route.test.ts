/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));

import { GET } from '@/app/api/events/[eventId]/teams/[teamId]/billing/route';

const requestFor = () => new NextRequest('http://localhost/api/events/event_1/teams/team_1/billing');

describe('GET /api/events/[eventId]/teams/[teamId]/billing', () => {
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
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'user_2',
        firstName: 'Alex',
        lastName: 'Morgan',
        userName: 'amorgan',
      },
    ]);
    prismaMock.bills.findMany
      .mockResolvedValueOnce([
        {
          id: 'bill_team_1',
          ownerType: 'TEAM',
          ownerId: 'team_1',
          totalAmountCents: 10000,
          paidAmountCents: 0,
          status: 'OPEN',
          allowSplit: true,
          lineItems: null,
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          updatedAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'bill_user_1',
          ownerType: 'USER',
          ownerId: 'user_2',
          parentBillId: 'bill_team_1',
          totalAmountCents: 5000,
          paidAmountCents: 0,
          status: 'OPEN',
          allowSplit: false,
          lineItems: null,
          createdAt: new Date('2026-03-01T10:30:00.000Z'),
          updatedAt: new Date('2026-03-01T10:30:00.000Z'),
        },
      ]);
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'payment_team_1',
        billId: 'bill_team_1',
        sequence: 1,
        dueDate: new Date('2026-03-02T10:00:00.000Z'),
        amountCents: 10000,
        status: 'PAID',
        paidAt: new Date('2026-03-02T10:00:00.000Z'),
        paymentIntentId: 'pi_team_1',
        payerUserId: 'user_2',
        refundedAmountCents: 2500,
        createdAt: new Date('2026-03-02T10:00:00.000Z'),
        updatedAt: new Date('2026-03-03T10:00:00.000Z'),
      },
      {
        id: 'payment_user_1',
        billId: 'bill_user_1',
        sequence: 1,
        dueDate: new Date('2026-03-03T10:00:00.000Z'),
        amountCents: 5000,
        status: 'PENDING',
        paidAt: null,
        paymentIntentId: null,
        payerUserId: null,
        refundedAmountCents: 0,
        createdAt: new Date('2026-03-03T10:00:00.000Z'),
        updatedAt: new Date('2026-03-03T10:00:00.000Z'),
      },
    ]);
  });

  it('returns billing totals with refundable calculations for team participants', async () => {
    const response = await GET(requestFor(), {
      params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.team).toEqual(
      expect.objectContaining({
        id: 'team_1',
        name: 'Beach Aces',
      }),
    );
    expect(payload.totals).toEqual({
      paidAmountCents: 10000,
      refundedAmountCents: 2500,
      refundableAmountCents: 7500,
    });
    expect(payload.bills).toHaveLength(2);
    expect(payload.bills[0]).toEqual(
      expect.objectContaining({
        id: 'bill_team_1',
        ownerName: 'Beach Aces',
        paidAmountCents: 10000,
        refundedAmountCents: 2500,
        refundableAmountCents: 7500,
      }),
    );
    expect(payload.bills[0].payments[0]).toEqual(
      expect.objectContaining({
        id: 'payment_team_1',
        refundedAmountCents: 2500,
        refundableAmountCents: 7500,
        isRefundable: true,
      }),
    );
  });
});
