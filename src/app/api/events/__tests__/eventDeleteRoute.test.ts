/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

const billsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const billPaymentsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const billPaymentProofsMock = {
  count: jest.fn(),
};

const refundRequestsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const signedDocumentsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const invitesMock = {
  deleteMany: jest.fn(),
};

const paymentIntentsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const templateDocumentsMock = {
  deleteMany: jest.fn(),
};

const divisionsMock = {
  deleteMany: jest.fn(),
};

const matchesMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const timeSlotsMock = {
  findMany: jest.fn(),
  update: jest.fn(),
  deleteMany: jest.fn(),
};

const fieldsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const eventRegistrationsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const rentalBookingsMock = {
  count: jest.fn(),
};

const rentalBookingItemsMock = {
  count: jest.fn(),
};

const eventStaffAssignmentsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const eventOfficialsMock = {
  count: jest.fn(),
  deleteMany: jest.fn(),
};

const eventTagAssignmentsMock = {
  deleteMany: jest.fn(),
};

const leagueScoringConfigsMock = {
  deleteMany: jest.fn(),
};

const txMock = {
  events: eventsMock,
  bills: billsMock,
  billPayments: billPaymentsMock,
  billPaymentProofs: billPaymentProofsMock,
  refundRequests: refundRequestsMock,
  signedDocuments: signedDocumentsMock,
  invites: invitesMock,
  paymentIntents: paymentIntentsMock,
  templateDocuments: templateDocumentsMock,
  divisions: divisionsMock,
  matches: matchesMock,
  timeSlots: timeSlotsMock,
  fields: fieldsMock,
  eventRegistrations: eventRegistrationsMock,
  rentalBookings: rentalBookingsMock,
  rentalBookingItems: rentalBookingItemsMock,
  eventStaffAssignments: eventStaffAssignmentsMock,
  eventOfficials: eventOfficialsMock,
  eventTagAssignments: eventTagAssignmentsMock,
  leagueScoringConfigs: leagueScoringConfigsMock,
};

const prismaMock = {
  ...txMock,
  $transaction: jest.fn(async (callback: any) => callback(txMock)),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
}));
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { DELETE as eventDelete } from '@/app/api/events/[eventId]/route';

const deleteRequest = (url: string) => new NextRequest(url, { method: 'DELETE' });

const setReferenceCounts = (count = 0) => {
  billPaymentsMock.count.mockResolvedValue(count);
  billPaymentProofsMock.count.mockResolvedValue(count);
  refundRequestsMock.count.mockResolvedValue(count);
  signedDocumentsMock.count.mockResolvedValue(count);
  eventRegistrationsMock.count.mockResolvedValue(count);
  matchesMock.count.mockResolvedValue(count);
  rentalBookingsMock.count.mockResolvedValue(count);
  rentalBookingItemsMock.count.mockResolvedValue(count);
  paymentIntentsMock.count.mockResolvedValue(count);
  eventStaffAssignmentsMock.count.mockResolvedValue(count);
  eventOfficialsMock.count.mockResolvedValue(count);
  eventsMock.count.mockResolvedValue(count);
};

describe('event DELETE route', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    setReferenceCounts(0);

    billsMock.findMany.mockResolvedValue([]);
    billsMock.deleteMany.mockResolvedValue({ count: 0 });
    billPaymentsMock.deleteMany.mockResolvedValue({ count: 0 });
    refundRequestsMock.deleteMany.mockResolvedValue({ count: 0 });
    signedDocumentsMock.deleteMany.mockResolvedValue({ count: 0 });
    invitesMock.deleteMany.mockResolvedValue({ count: 0 });
    paymentIntentsMock.deleteMany.mockResolvedValue({ count: 0 });
    templateDocumentsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    matchesMock.deleteMany.mockResolvedValue({ count: 0 });
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 0 });
    fieldsMock.deleteMany.mockResolvedValue({ count: 0 });
    eventRegistrationsMock.deleteMany.mockResolvedValue({ count: 0 });
    eventStaffAssignmentsMock.deleteMany.mockResolvedValue({ count: 0 });
    eventOfficialsMock.deleteMany.mockResolvedValue({ count: 0 });
    eventTagAssignmentsMock.deleteMany.mockResolvedValue({ count: 0 });
    leagueScoringConfigsMock.deleteMany.mockResolvedValue({ count: 0 });

    eventsMock.update.mockResolvedValue({});
    eventsMock.delete.mockResolvedValue({});
    timeSlotsMock.update.mockResolvedValue({});
    fieldsMock.findMany.mockResolvedValue([]);
    eventsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.findMany.mockResolvedValue([]);
  });

  it('archives referenced events and preserves local billing history', async () => {
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      fieldIds: ['field_1'],
      timeSlotIds: ['slot_1'],
      state: 'PUBLISHED',
      leagueScoringConfigId: null,
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    billsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.eventId === 'event_1') {
        return Promise.resolve([{ id: 'bill_1' }]);
      }
      return Promise.resolve([]);
    });
    billPaymentsMock.count.mockResolvedValue(1);
    billPaymentProofsMock.count.mockResolvedValue(1);

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      deleted: false,
      archived: true,
      action: 'archived',
      entityType: 'event',
      entityId: 'event_1',
      references: expect.arrayContaining([
        { type: 'bills', count: 1 },
        { type: 'bill_payments', count: 1 },
        { type: 'bill_payment_proofs', count: 1 },
      ]),
    }));

    expect(eventsMock.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: expect.objectContaining({
        archivedAt: expect.any(Date),
        archivedByUserId: 'host_1',
        archiveReason: 'delete_requested',
      }),
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(billPaymentsMock.deleteMany).not.toHaveBeenCalled();
    expect(billsMock.deleteMany).not.toHaveBeenCalled();
    expect(eventsMock.delete).not.toHaveBeenCalled();
  });

  it('hard deletes unreferenced events and event-owned cleanup rows', async () => {
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      fieldIds: ['local_field_1'],
      timeSlotIds: ['slot_1'],
      state: 'UNPUBLISHED',
      leagueScoringConfigId: 'cfg_1',
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    fieldsMock.findMany.mockResolvedValue([{ id: 'local_field_1' }]);

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      archived: false,
      deactivated: false,
      action: 'deleted',
      entityType: 'event',
      entityId: 'event_1',
      references: [],
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(matchesMock.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(divisionsMock.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(billPaymentsMock.deleteMany).not.toHaveBeenCalled();
    expect(billsMock.deleteMany).not.toHaveBeenCalled();
    expect(timeSlotsMock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['slot_1'] } } });
    expect(fieldsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['local_field_1'] },
        organizationId: null,
      },
    });
    expect(eventsMock.delete).toHaveBeenCalledWith({ where: { id: 'event_1' } });
    expect(leagueScoringConfigsMock.deleteMany).toHaveBeenCalledWith({ where: { id: 'cfg_1' } });
  });

  it('archives an already archived event idempotently', async () => {
    const archivedAt = new Date('2026-06-01T00:00:00.000Z');
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      fieldIds: [],
      timeSlotIds: [],
      state: 'UNPUBLISHED',
      leagueScoringConfigId: null,
      archivedAt,
      archivedByUserId: 'host_1',
      archiveReason: 'delete_requested',
    });

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      deleted: false,
      archived: true,
      action: 'archived',
      references: [],
    }));
    expect(eventsMock.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: expect.objectContaining({
        archivedAt,
        archivedByUserId: 'host_1',
        archiveReason: 'delete_requested',
      }),
    });
    expect(eventsMock.delete).not.toHaveBeenCalled();
  });
});
