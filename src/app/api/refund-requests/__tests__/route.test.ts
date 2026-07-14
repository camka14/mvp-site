/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripeRefundCreate = jest.fn();
const mockStripePaymentIntentRetrieve = jest.fn();

jest.mock('stripe', () => (
  jest.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
    },
    refunds: {
      create: (...args: unknown[]) => mockStripeRefundCreate(...args),
    },
  }))
));

const prismaMock = {
  refundRequests: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const canManageOrganizationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
}));

import { GET as LIST_GET } from '@/app/api/refund-requests/route';
import { PATCH } from '@/app/api/refund-requests/[id]/route';
import { buildRefundScopeSnapshot } from '@/server/refunds/refundExecution';

const jsonPatch = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const approvalPayload = (request: { scopeVersion: number; scopeHash: string }) => ({
  status: 'APPROVED' as const,
  expectedScopeVersion: request.scopeVersion,
  expectedScopeHash: request.scopeHash,
});

describe('refund request routes', () => {
  const existingTeamRequest = {
    id: 'refund_1',
    eventId: 'event_1',
    userId: 'requester_1',
    requestedByUserId: 'requester_1',
    hostId: 'host_1',
    teamId: 'team_1',
    organizationId: 'org_1',
    reason: 'team_refund_requested',
    status: 'WAITING',
    slotId: null,
    occurrenceDate: null,
  };

  beforeEach(() => {
    mockStripeRefundCreate.mockReset();
    mockStripePaymentIntentRetrieve.mockReset();
    requireSessionMock.mockReset();
    canManageEventMock.mockReset();
    canManageOrganizationMock.mockReset();
    prismaMock.refundRequests.findUnique.mockReset();
    prismaMock.refundRequests.findMany.mockReset();
    prismaMock.refundRequests.update.mockReset();
    prismaMock.refundRequests.create.mockReset();
    prismaMock.organizations.findUnique.mockReset();
    prismaMock.events.findUnique.mockReset();
    prismaMock.teams.findUnique.mockReset();
    prismaMock.bills.findMany.mockReset();
    prismaMock.billPayments.findMany.mockReset();
    prismaMock.billPayments.findUnique.mockReset();
    prismaMock.billPayments.update.mockReset();
    prismaMock.$transaction.mockReset();

    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    canManageOrganizationMock.mockResolvedValue(true);

    prismaMock.refundRequests.findUnique.mockResolvedValue(existingTeamRequest);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: 'org_1',
    });
    prismaMock.refundRequests.update.mockResolvedValue({
      ...existingTeamRequest,
      status: 'APPROVED',
      updatedAt: new Date('2026-02-25T12:00:00.000Z'),
      billIds: ['team_bill_1'],
      paymentIds: ['payment_team_1'],
      paymentScope: [{
        paymentId: 'payment_team_1',
        billId: 'team_bill_1',
        refundableAmountCents: 5000,
        currency: 'usd',
      }],
      requestedAmountCents: 5000,
      currency: 'usd',
      policyDecision: 'HOST_REVIEW_REQUIRED',
      scopeVersion: 2,
      scopeHash: 'scope_hash_1',
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: ['coach_1'],
      playerIds: ['player_1', 'player_2'],
      parentTeamId: 'parent_team_1',
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findUnique.mockResolvedValue(null);
    prismaMock.billPayments.update.mockResolvedValue({ id: 'payment_1', refundedAmountCents: 5000 });
    mockStripePaymentIntentRetrieve.mockResolvedValue({ id: 'pi_default', transfer_data: null });

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  describe('PATCH /api/refund-requests/[id]', () => {
    it('rejects users who cannot manage the event', async () => {
      canManageEventMock.mockResolvedValueOnce(false);

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.error).toBe('Forbidden');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('requires the reviewed scope version and hash before approval', async () => {
      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toContain('scope version and hash');
      expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
      expect(mockStripeRefundCreate).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an approval when the reviewed scope hash is stale', async () => {
      const scopedPayment = {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_team_1',
        payerUserId: 'requester_1',
      };
      const scopedRequest = {
        ...existingTeamRequest,
        ...buildRefundScopeSnapshot(existingTeamRequest as any, [scopedPayment], 'HOST_REVIEW_REQUIRED'),
      };
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce(scopedRequest);

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', {
          ...approvalPayload(scopedRequest),
          expectedScopeHash: 'stale_scope_hash',
        }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toContain('stale');
      expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
      expect(mockStripeRefundCreate).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an approval when the reviewed scope version is stale', async () => {
      const scopedPayment = {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_team_1',
        payerUserId: 'requester_1',
      };
      const scopedRequest = {
        ...existingTeamRequest,
        ...buildRefundScopeSnapshot(existingTeamRequest as any, [scopedPayment], 'HOST_REVIEW_REQUIRED'),
      };
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce(scopedRequest);

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', {
          ...approvalPayload(scopedRequest),
          expectedScopeVersion: scopedRequest.scopeVersion + 1,
        }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toContain('stale');
      expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
      expect(mockStripeRefundCreate).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('approves only the request payer snapshot for a team refund', async () => {
      const scopedPayment = {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_team_1',
        payerUserId: 'requester_1',
      };
      const scopedRequest = {
        ...existingTeamRequest,
        ...buildRefundScopeSnapshot(existingTeamRequest as any, [scopedPayment], 'HOST_REVIEW_REQUIRED'),
      };
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce(scopedRequest);
      prismaMock.billPayments.findMany.mockResolvedValueOnce([
        scopedPayment,
      ]);
      mockStripeRefundCreate.mockResolvedValueOnce({ id: 're_team_1' });
      prismaMock.billPayments.findUnique.mockResolvedValueOnce({
        id: 'payment_team_1', amountCents: 5000, refundedAmountCents: 0,
      });
      prismaMock.billPayments.update.mockResolvedValueOnce({ id: 'payment_team_1', refundedAmountCents: 5000 });

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', approvalPayload(scopedRequest)),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
      expect(mockStripeRefundCreate).toHaveBeenCalledTimes(1);
      expect(mockStripeRefundCreate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          payment_intent: 'pi_team_1',
          amount: 5000,
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_team_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_team_1',
        }),
      );
      expect(payload).toEqual(
        expect.objectContaining({
          status: 'APPROVED',
          billIds: ['team_bill_1'],
          paymentIds: ['payment_team_1'],
          paymentScope: [{
            paymentId: 'payment_team_1',
            billId: 'team_bill_1',
            refundableAmountCents: 5000,
            currency: 'usd',
          }],
          requestedAmountCents: 5000,
          currency: 'usd',
          policyDecision: 'HOST_REVIEW_REQUIRED',
          scopeVersion: 2,
          scopeHash: 'scope_hash_1',
          refundedAmountCents: 5000,
          stripeRefundIds: ['re_team_1'],
          refundedPaymentIds: ['payment_team_1'],
        }),
      );
      expect(prismaMock.refundRequests.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            billIds: true,
            paymentIds: true,
            paymentScope: true,
            requestedAmountCents: true,
            currency: true,
            policyDecision: true,
            scopeVersion: true,
            scopeHash: true,
          }),
        }),
      );
    });

    it('creates Stripe refunds and persists refunded bill payments when approving an individual refund', async () => {
      const individualRequest = {
        ...existingTeamRequest,
        teamId: null,
        userId: 'player_1',
        requestedByUserId: 'player_1',
        reason: 'requested_by_customer',
      };
      const individualPayment = {
        id: 'payment_1', billId: 'bill_1', amountCents: 5000, refundedAmountCents: 0,
        refundableAmountCents: 5000, paymentIntentId: 'pi_1', payerUserId: 'player_1',
      };
      const scopedIndividualRequest = {
        ...individualRequest,
        ...buildRefundScopeSnapshot(individualRequest as any, [individualPayment], 'HOST_REVIEW_REQUIRED'),
      };
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce(scopedIndividualRequest);
      prismaMock.billPayments.findMany.mockResolvedValueOnce([individualPayment]);
      mockStripeRefundCreate.mockResolvedValueOnce({ id: 're_1' });
      prismaMock.billPayments.findUnique.mockResolvedValueOnce({
        id: 'payment_1',
        amountCents: 5000,
        refundedAmountCents: 0,
      });
      prismaMock.billPayments.update.mockResolvedValueOnce({
        id: 'payment_1',
        refundedAmountCents: 5000,
      });

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', approvalPayload(scopedIndividualRequest)),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(mockStripeRefundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_1',
          amount: 5000,
          reason: 'requested_by_customer',
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_1',
        }),
      );
      expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payment_1' },
          data: expect.objectContaining({
            refundedAmountCents: 5000,
          }),
        }),
      );
      expect(payload).toEqual(
        expect.objectContaining({
          status: 'APPROVED',
          refundedAmountCents: 5000,
          stripeRefundIds: ['re_1'],
          refundedPaymentIds: ['payment_1'],
        }),
      );
    });

    it('rejects payment-level drift even when the aggregate refund amount is unchanged', async () => {
      const snapshotPayments = [
        {
          id: 'payment_1', billId: 'bill_1', amountCents: 1000, refundedAmountCents: 0,
          refundableAmountCents: 1000, paymentIntentId: 'pi_1', payerUserId: 'requester_1',
        },
        {
          id: 'payment_2', billId: 'bill_2', amountCents: 4000, refundedAmountCents: 0,
          refundableAmountCents: 4000, paymentIntentId: 'pi_2', payerUserId: 'requester_1',
        },
      ];
      const scopedRequest = {
        ...existingTeamRequest,
        ...buildRefundScopeSnapshot(existingTeamRequest as any, snapshotPayments, 'HOST_REVIEW_REQUIRED'),
      };
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce(scopedRequest);
      prismaMock.billPayments.findMany.mockResolvedValueOnce([
        {
          ...snapshotPayments[0],
          amountCents: 2000,
          refundableAmountCents: 2000,
        },
        {
          ...snapshotPayments[1],
          amountCents: 3000,
          refundableAmountCents: 3000,
        },
      ]);

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', approvalPayload(scopedRequest)),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toContain('changed after the request was submitted');
      expect(mockStripeRefundCreate).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/refund-requests', () => {
    it('defaults an unscoped non-admin list to the caller\'s own refund requests', async () => {
      prismaMock.refundRequests.findMany.mockResolvedValueOnce([]);

      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests'),
      );

      expect(response.status).toBe(200);
      expect(prismaMock.refundRequests.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'manager_1',
            reason: { not: 'team_refund_fanout' },
          },
        }),
      );
    });

    it('rejects host queries for another host', async () => {
      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests?hostId=host_1'),
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.error).toBe('Forbidden');
      expect(prismaMock.refundRequests.findMany).not.toHaveBeenCalled();
    });

    it('rejects organization queries when the caller cannot manage the organization', async () => {
      canManageOrganizationMock.mockResolvedValueOnce(false);

      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests?organizationId=org_1'),
      );
      const payload = await response.json();

      expect(response.status).toBe(403);
      expect(payload.error).toBe('Forbidden');
      expect(prismaMock.organizations.findUnique).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        select: { id: true, ownerId: true },
      });
      expect(prismaMock.refundRequests.findMany).not.toHaveBeenCalled();
    });

    it('filters legacy team fanout rows from the returned list', async () => {
      requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
      prismaMock.refundRequests.findMany.mockResolvedValueOnce([]);

      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests?hostId=host_1'),
      );

      expect(response.status).toBe(200);
      expect(prismaMock.refundRequests.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hostId: 'host_1',
            reason: { not: 'team_refund_fanout' },
          }),
        }),
      );
    });

    it('returns the immutable refund scope needed for a mobile approval preview', async () => {
      requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
      const previewRequest = {
        ...existingTeamRequest,
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T10:05:00.000Z'),
        slotId: 'slot_1',
        occurrenceDate: '2026-07-17',
      };
      const previewPayment = {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_1',
        payerUserId: 'requester_1',
      };
      const previewScope = buildRefundScopeSnapshot(previewRequest as any, [previewPayment], 'HOST_REVIEW_REQUIRED');
      prismaMock.refundRequests.findMany.mockResolvedValueOnce([{
        ...previewRequest,
        ...previewScope,
      }]);

      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests?hostId=host_1'),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.refunds[0]).toEqual(expect.objectContaining({
        id: 'refund_1',
        requestedByUserId: 'requester_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-07-17',
        billIds: ['bill_1'],
        paymentIds: ['payment_1'],
        paymentScope: [{
          paymentId: 'payment_1',
          billId: 'bill_1',
          refundableAmountCents: 5000,
          currency: 'usd',
        }],
        requestedAmountCents: 5000,
        currency: 'usd',
        policyDecision: 'HOST_REVIEW_REQUIRED',
        scopeVersion: 2,
        scopeHash: previewScope.scopeHash,
        approvalPreview: {
          paymentScope: [{
            paymentId: 'payment_1',
            billId: 'bill_1',
            refundableAmountCents: 5000,
            currency: 'usd',
          }],
          paymentCount: 1,
          billIds: ['bill_1'],
          paymentIds: ['payment_1'],
          refundableAmountCents: 5000,
          currency: 'usd',
          occurrence: {
            slotId: 'slot_1',
            occurrenceDate: '2026-07-17',
          },
          policyDecision: 'HOST_REVIEW_REQUIRED',
          scopeVersion: 2,
          scopeHash: previewScope.scopeHash,
          isValid: true,
        },
        createdAt: '2026-07-10T10:00:00.000Z',
      }));
      expect(payload.refunds[0]).not.toHaveProperty('$id');
      expect(payload.refunds[0]).not.toHaveProperty('$createdAt');
      expect(prismaMock.refundRequests.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            requestedByUserId: true,
            billIds: true,
            paymentIds: true,
            paymentScope: true,
            requestedAmountCents: true,
            currency: true,
            policyDecision: true,
            scopeVersion: true,
            scopeHash: true,
          }),
        }),
      );
    });
  });
});
