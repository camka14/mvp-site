/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { GET } from '@/app/api/events/[eventId]/teams/compliance/route';

describe('GET /api/events/[eventId]/teams/compliance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Test League',
      start: new Date('2026-08-01T12:00:00.000Z'),
      teamSignup: true,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      teamIds: ['slot_1'],
      requiredTemplateIds: [],
    });
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        name: 'Slot Team',
        playerIds: [],
        parentTeamId: 'team_canonical',
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
  });

  it('uses parent team bills when event team is a slot with parentTeamId', async () => {
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_parent_team',
        ownerId: 'team_canonical',
        totalAmountCents: 12000,
        paidAmountCents: 3000,
        status: 'PENDING',
        parentBillId: null,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          ownerType: 'TEAM',
          ownerId: { in: expect.arrayContaining(['slot_1', 'team_canonical']) },
        }),
      }),
    );
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0].teamId).toBe('slot_1');
    expect(payload.teams[0].payment).toMatchObject({
      hasBill: true,
      billId: 'bill_parent_team',
      totalAmountCents: 12000,
      paidAmountCents: 3000,
      inheritedFromTeamBill: true,
    });
  });

  it('falls back to slot-team bill when parent team bill is not present', async () => {
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_slot_team',
        ownerId: 'slot_1',
        totalAmountCents: 9000,
        paidAmountCents: 9000,
        status: 'PAID',
        parentBillId: null,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/teams/compliance'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0].payment).toMatchObject({
      hasBill: true,
      billId: 'bill_slot_team',
      totalAmountCents: 9000,
      paidAmountCents: 9000,
      isPaidInFull: true,
      inheritedFromTeamBill: false,
    });
  });
});

