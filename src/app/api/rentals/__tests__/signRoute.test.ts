/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  boldSignSyncOperations: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const createDocumentSendOperationMock = jest.fn();
const findLatestBoldSignOperationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/boldsignWebhookSync', () => ({
  createDocumentSendOperation: (...args: any[]) => createDocumentSendOperationMock(...args),
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
    PENDING_RECONCILE: 'PENDING_RECONCILE',
    CONFIRMED: 'CONFIRMED',
    FAILED: 'FAILED',
    FAILED_RETRYABLE: 'FAILED_RETRYABLE',
    TIMED_OUT: 'TIMED_OUT',
  },
  findLatestBoldSignOperation: (...args: any[]) => findLatestBoldSignOperationMock(...args),
}));
jest.mock('@/lib/boldsignServer', () => ({
  isBoldSignConfigured: jest.fn(),
  getTemplateRoles: jest.fn(),
  sendDocumentFromTemplate: jest.fn(),
  getEmbeddedSignLink: jest.fn(),
}));

import { POST } from '@/app/api/rentals/sign/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/rentals/sign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValue({
      firstName: 'Player',
      lastName: 'One',
      userName: 'player1',
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'player@example.com' });
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.create.mockResolvedValue({ id: 'signed_1' });
    prismaMock.signedDocuments.update.mockResolvedValue({ id: 'signed_1' });
    prismaMock.boldSignSyncOperations.findFirst.mockResolvedValue(null);
    createDocumentSendOperationMock.mockResolvedValue({ id: 'op_1', status: 'PENDING_WEBHOOK' });
    findLatestBoldSignOperationMock.mockResolvedValue(null);
  });

  it('returns a TEXT signing step for a participant rental template', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_rental_1',
        type: 'TEXT',
        title: 'Rental Waiver',
        content: 'I accept the rental terms.',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
      },
    ]);

    const res = await POST(jsonPost('http://localhost/api/rentals/sign', {
      templateId: 'tmpl_rental_1',
      eventId: 'event_new_1',
      organizationId: 'org_1',
      userId: 'user_1',
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toEqual([
      expect.objectContaining({
        templateId: 'tmpl_rental_1',
        type: 'TEXT',
        content: 'I accept the rental terms.',
        signerContext: 'participant',
      }),
    ]);
    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: 'tmpl_rental_1',
          eventId: 'event_new_1',
          organizationId: 'org_1',
          signerRole: 'participant',
          status: 'UNSIGNED',
        }),
      }),
    );
  });

  it('rejects rental templates that are not participant-signer templates', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_child_only',
        type: 'TEXT',
        title: 'Child Consent',
        content: 'Child sign only.',
        signOnce: false,
        requiredSignerType: 'CHILD',
      },
    ]);

    const res = await POST(jsonPost('http://localhost/api/rentals/sign', {
      templateId: 'tmpl_child_only',
      eventId: 'event_new_2',
      userId: 'user_1',
    }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(String(data.error ?? '')).toContain('must use Participant signer type');
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
  });

  it('falls back to session user when non-admin payload userId mismatches', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_rental_1',
        type: 'TEXT',
        title: 'Rental Waiver',
        content: 'I accept the rental terms.',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
      },
    ]);

    const res = await POST(jsonPost('http://localhost/api/rentals/sign', {
      templateId: 'tmpl_rental_1',
      eventId: 'event_new_3',
      organizationId: 'org_1',
      userId: 'another_user',
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(prismaMock.userData.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: {
        firstName: true,
        lastName: true,
        userName: true,
      },
    });
    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
        }),
      }),
    );
  });
});
