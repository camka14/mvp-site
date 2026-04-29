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
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const refundRequestsMock = {
  deleteMany: jest.fn(),
};

const signedDocumentsMock = {
  deleteMany: jest.fn(),
};

const invitesMock = {
  deleteMany: jest.fn(),
};

const paymentIntentsMock = {
  deleteMany: jest.fn(),
};

const templateDocumentsMock = {
  deleteMany: jest.fn(),
};

const divisionsMock = {
  deleteMany: jest.fn(),
};

const matchesMock = {
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
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const teamsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const leagueScoringConfigsMock = {
  deleteMany: jest.fn(),
};

const txMock = {
  events: eventsMock,
  bills: billsMock,
  billPayments: billPaymentsMock,
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
  teams: teamsMock,
  leagueScoringConfigs: leagueScoringConfigsMock,
};

const prismaMock = {
  events: eventsMock,
  bills: billsMock,
  billPayments: billPaymentsMock,
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
  teams: teamsMock,
  leagueScoringConfigs: leagueScoringConfigsMock,
  $transaction: jest.fn(async (callback: any) => callback(txMock)),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

const stripeRefundCreateMock = jest.fn();
const stripePaymentIntentRetrieveMock = jest.fn();
const stripePaymentIntentCancelMock = jest.fn();
const StripeMock = jest.fn(() => ({
  refunds: {
    create: stripeRefundCreateMock,
  },
  paymentIntents: {
    retrieve: stripePaymentIntentRetrieveMock,
    cancel: stripePaymentIntentCancelMock,
  },
}));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
}));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

import { DELETE as eventDelete } from '@/app/api/events/[eventId]/route';

const deleteRequest = (url: string) => new NextRequest(url, { method: 'DELETE' });

describe('event DELETE route', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;

    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);

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
    teamsMock.deleteMany.mockResolvedValue({ count: 0 });
    leagueScoringConfigsMock.deleteMany.mockResolvedValue({ count: 0 });

    eventsMock.update.mockResolvedValue({});
    eventsMock.delete.mockResolvedValue({});
    eventsMock.count.mockResolvedValue(0);
    timeSlotsMock.update.mockResolvedValue({});
  });

  afterAll(() => {
    if (typeof originalStripeSecret === 'string') {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it('refunds paid bill intents and deletes event-linked entities including divisions and local fields', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      fieldIds: ['field_local_1', 'field_org_1'],
      timeSlotIds: ['slot_1'],
      teamIds: ['team_slot_1'],
      state: 'TEMPLATE',
      leagueScoringConfigId: 'cfg_1',
    });
    eventsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.requiredTemplateIds?.has === 'event_1') {
        return Promise.resolve([
          { id: 'event_2', requiredTemplateIds: ['event_1', 'template_other'] },
        ]);
      }
      if (Array.isArray(args?.where?.OR)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    billsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.eventId === 'event_1') {
        return Promise.resolve([{ id: 'bill_root_1' }]);
      }
      const parentIds = args?.where?.parentBillId?.in ?? [];
      if (Array.isArray(parentIds) && parentIds.includes('bill_root_1')) {
        return Promise.resolve([{ id: 'bill_child_1' }]);
      }
      if (Array.isArray(parentIds) && parentIds.includes('bill_child_1')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    billPaymentsMock.findMany.mockResolvedValue([
      { id: 'bill_payment_paid', billId: 'bill_root_1', paymentIntentId: 'pi_paid_1', status: 'PAID' },
      { id: 'bill_payment_pending', billId: 'bill_child_1', paymentIntentId: 'pi_pending_1', status: 'PENDING' },
    ]);
    stripeRefundCreateMock.mockResolvedValue({ id: 're_1' });
    stripePaymentIntentRetrieveMock
      .mockResolvedValueOnce({
        id: 'pi_paid_1',
        transfer_data: { destination: 'acct_connected_123' },
      })
      .mockResolvedValueOnce({ id: 'pi_pending_1', status: 'requires_payment_method' });
    stripePaymentIntentCancelMock.mockResolvedValue({ id: 'pi_pending_1', status: 'canceled' });

    timeSlotsMock.findMany.mockResolvedValue([
      { id: 'slot_2', requiredTemplateIds: ['event_1'] },
    ]);
    fieldsMock.findMany.mockResolvedValue([
      { id: 'field_local_1' },
    ]);
    eventRegistrationsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.eventId === 'event_1') {
        return Promise.resolve([
          { registrantId: 'team_slot_1', registrantType: 'TEAM' },
        ]);
      }
      if (args?.where?.eventId?.not === 'event_1') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    teamsMock.findMany.mockResolvedValue([
      { id: 'team_slot_1', parentTeamId: 'team_canonical_1', captainId: 'captain_1', name: 'Slot Team 1' },
      { id: 'team_slot_1_child', parentTeamId: 'team_slot_1', captainId: 'captain_2', name: 'Slot Team 1 Child' },
    ]);

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });

    expect(StripeMock).toHaveBeenCalledTimes(1);
    expect(stripeRefundCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_paid_1',
        reverse_transfer: true,
      }),
    );
    expect(stripePaymentIntentCancelMock).toHaveBeenCalledWith('pi_pending_1');

    expect(divisionsMock.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event_1' },
    });
    expect(matchesMock.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event_1' },
    });
    expect(billPaymentsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        billId: { in: ['bill_root_1', 'bill_child_1'] },
      },
    });
    expect(billsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['bill_root_1', 'bill_child_1'] },
      },
    });
    expect(fieldsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['field_local_1'] },
        organizationId: null,
      },
    });
    expect(timeSlotsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['slot_1'] },
      },
    });
    expect(teamsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['team_slot_1', 'team_slot_1_child'] },
      },
    });
    expect(eventsMock.update).toHaveBeenCalledWith({
      where: { id: 'event_2' },
      data: {
        requiredTemplateIds: ['template_other'],
        updatedAt: expect.any(Date),
      },
    });
    expect(timeSlotsMock.update).toHaveBeenCalledWith({
      where: { id: 'slot_2' },
      data: {
        requiredTemplateIds: [],
        hostRequiredTemplateIds: [],
        updatedAt: expect.any(Date),
      },
    });
    expect(eventsMock.delete).toHaveBeenCalledWith({
      where: { id: 'event_1' },
    });
    expect(leagueScoringConfigsMock.deleteMany).toHaveBeenCalledWith({
      where: { id: 'cfg_1' },
    });
  });

  it('blocks deletion when paid bill intents exist but Stripe is not configured', async () => {
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      fieldIds: [],
      timeSlotIds: [],
      teamIds: [],
      state: 'UNPUBLISHED',
      leagueScoringConfigId: null,
    });
    billsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.eventId === 'event_1') {
        return Promise.resolve([{ id: 'bill_root_1' }]);
      }
      const parentIds = args?.where?.parentBillId?.in ?? [];
      if (Array.isArray(parentIds) && parentIds.includes('bill_root_1')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    billPaymentsMock.findMany.mockResolvedValue([
      { id: 'bill_payment_paid', billId: 'bill_root_1', paymentIntentId: 'pi_paid_1', status: 'PAID' },
    ]);

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(String(payload?.error ?? '')).toContain('Stripe is not configured');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventsMock.delete).not.toHaveBeenCalled();
  });

  it('deletes copied and placeholder teams even when those team ids are referenced elsewhere', async () => {
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      fieldIds: [],
      timeSlotIds: [],
      state: 'UNPUBLISHED',
      leagueScoringConfigId: null,
    });
    billsMock.findMany.mockResolvedValue([]);
    eventRegistrationsMock.findMany.mockImplementation((args: any) => {
      if (args?.where?.eventId === 'event_1') {
        return Promise.resolve([
          { registrantId: 'team_copy_1', registrantType: 'TEAM' },
          { registrantId: 'team_placeholder_1', registrantType: 'TEAM' },
          { registrantId: 'team_canonical_keep', registrantType: 'TEAM' },
        ]);
      }
      if (args?.where?.eventId?.not === 'event_1') {
        return Promise.resolve([
          { registrantId: 'team_canonical_keep' },
        ]);
      }
      return Promise.resolve([]);
    });
    teamsMock.findMany.mockResolvedValue([
      { id: 'team_copy_1', parentTeamId: 'team_parent_1', captainId: 'captain_copy_1', name: 'Copy Team 1' },
      { id: 'team_placeholder_1', parentTeamId: null, captainId: '', name: 'Place Holder 1' },
      { id: 'team_canonical_keep', parentTeamId: null, captainId: 'captain_keep_1', name: 'Canonical Team' },
    ]);

    const response = await eventDelete(
      deleteRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(teamsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['team_copy_1', 'team_placeholder_1'] },
      },
    });
  });
});

