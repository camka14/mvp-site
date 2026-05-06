/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  bills: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  billPayments: {
    create: jest.fn(),
  },
};

const prismaMock = {
  bills: {
    findMany: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  timeSlots: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET, POST } from '@/app/api/billing/bills/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);
    txMock.bills.findFirst.mockResolvedValue(null);
    txMock.bills.create.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      totalAmountCents: 12000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
      status: 'OPEN',
    });
    txMock.billPayments.create.mockImplementation(async ({ data }) => data);
    txMock.bills.update.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      totalAmountCents: 12000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
      status: 'OPEN',
      nextPaymentAmountCents: 6000,
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      eventType: 'EVENT',
      parentEvent: null,
      divisions: [],
      timeSlotIds: [],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) => callback(txMock));
  });

  it('creates a payment-plan bill and installments', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        paymentPlanEnabled: true,
        installmentAmounts: [6000, 6000],
        installmentDueDates: ['2026-03-01', '2026-04-01'],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.bill).toEqual(expect.objectContaining({ $id: 'bill_1' }));
    expect(txMock.bills.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          parentBillId: null,
          paymentPlanEnabled: true,
        }),
      }),
    );
    expect(txMock.bills.create).toHaveBeenCalled();
    expect(txMock.billPayments.create).toHaveBeenCalledTimes(2);
  });

  it('stores TEAM bills on the parent team when an event team id is supplied', async () => {
    prismaMock.teams.findUnique.mockResolvedValueOnce({ parentTeamId: 'team_parent' });
    txMock.bills.update.mockResolvedValueOnce({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_parent',
      eventId: 'event_1',
      totalAmountCents: 12000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
      status: 'OPEN',
      nextPaymentAmountCents: 12000,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'event_team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        paymentPlanEnabled: true,
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.bills.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: { in: ['team_parent', 'event_team_1'] },
          eventId: 'event_1',
          parentBillId: null,
          paymentPlanEnabled: true,
        }),
      }),
    );
    expect(txMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_parent',
        }),
      }),
    );
  });

  it('creates weekly payment-plan installments from occurrence-relative due days', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      divisions: ['open'],
      timeSlotIds: ['slot_1'],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      daysOfWeek: [0],
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: null,
      startTimeMinutes: 600,
      divisions: ['open'],
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-08-03',
        paymentPlanEnabled: true,
        installmentAmounts: [6000, 6000],
        installmentDueRelativeDays: [-1, 0],
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.bills.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          parentBillId: null,
          paymentPlanEnabled: true,
          slotId: 'slot_1',
          occurrenceDate: '2026-08-03',
        }),
      }),
    );
    expect(txMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slotId: 'slot_1',
          occurrenceDate: '2026-08-03',
        }),
      }),
    );
    const firstDueDate = txMock.billPayments.create.mock.calls[0]?.[0]?.data?.dueDate as Date;
    const secondDueDate = txMock.billPayments.create.mock.calls[1]?.[0]?.data?.dueDate as Date;
    expect(firstDueDate.getFullYear()).toBe(2026);
    expect(firstDueDate.getMonth()).toBe(7);
    expect(firstDueDate.getDate()).toBe(2);
    expect(secondDueDate.getFullYear()).toBe(2026);
    expect(secondDueDate.getMonth()).toBe(7);
    expect(secondDueDate.getDate()).toBe(3);
  });

  it('rejects duplicate payment plans for the same event and owner', async () => {
    txMock.bills.findFirst.mockResolvedValueOnce({ id: 'bill_existing' });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        paymentPlanEnabled: true,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('A payment plan already exists for this owner and event.');
    expect(payload.billId).toBe('bill_existing');
    expect(txMock.bills.create).not.toHaveBeenCalled();
    expect(txMock.billPayments.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate weekly payment plans for the same selected occurrence', async () => {
    txMock.bills.findFirst.mockResolvedValueOnce({ id: 'bill_existing' });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      divisions: ['open'],
      timeSlotIds: ['slot_1'],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      daysOfWeek: [0],
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: null,
      startTimeMinutes: 600,
      divisions: ['open'],
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-08-03',
        paymentPlanEnabled: true,
        installmentAmounts: [6000, 6000],
        installmentDueRelativeDays: [-1, 0],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.billId).toBe('bill_existing');
    expect(txMock.bills.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slotId: 'slot_1',
          occurrenceDate: '2026-08-03',
        }),
      }),
    );
    expect(txMock.bills.create).not.toHaveBeenCalled();
    expect(txMock.billPayments.create).not.toHaveBeenCalled();
  });

  it('rejects weekly payment plans without occurrence-relative due days', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      divisions: ['open'],
      timeSlotIds: ['slot_1'],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      daysOfWeek: [0],
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: null,
      startTimeMinutes: 600,
      divisions: ['open'],
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-08-03',
        paymentPlanEnabled: true,
        installmentAmounts: [6000, 6000],
        installmentDueDates: ['2026-08-03', '2026-09-03'],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Weekly payment plans require installmentDueRelativeDays.');
    expect(txMock.bills.create).not.toHaveBeenCalled();
    expect(txMock.billPayments.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/billing/bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.bills.findMany.mockResolvedValue([]);
  });

  it('includes event-team bills when listing bills for a parent team', async () => {
    prismaMock.teams.findMany.mockResolvedValueOnce([
      { id: 'event_team_1' },
    ]);
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_event_team_1',
        ownerType: 'TEAM',
        ownerId: 'event_team_1',
        totalAmountCents: 5000,
        paidAmountCents: 0,
        status: 'OPEN',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/billing/bills?ownerType=TEAM&ownerId=team_parent&limit=100'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.teams.findMany).toHaveBeenCalledWith({
      where: { parentTeamId: 'team_parent' },
      select: { id: true },
    });
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerType: 'TEAM',
          ownerId: { in: ['team_parent', 'event_team_1'] },
        },
      }),
    );
    expect(payload.bills).toEqual([
      expect.objectContaining({
        id: 'bill_event_team_1',
        $id: 'bill_event_team_1',
      }),
    ]);
  });

  it('includes parent-team bills when listing bills for an event team', async () => {
    prismaMock.teams.findUnique.mockResolvedValueOnce({ parentTeamId: 'team_parent' });
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_parent_team_1',
        ownerType: 'TEAM',
        ownerId: 'team_parent',
        totalAmountCents: 5000,
        paidAmountCents: 0,
        status: 'OPEN',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/billing/bills?ownerType=TEAM&ownerId=event_team_1&limit=100'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerType: 'TEAM',
          ownerId: { in: ['event_team_1', 'team_parent'] },
        },
      }),
    );
    expect(payload.bills[0]).toEqual(expect.objectContaining({ $id: 'bill_parent_team_1' }));
  });
});
