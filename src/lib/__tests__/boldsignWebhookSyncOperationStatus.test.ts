/** @jest-environment node */

const prismaMock = {
  signedDocuments: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  templateDocuments: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
};

const findLatestBoldSignOperationMock = jest.fn();
const updateBoldSignOperationByIdMock = jest.fn();
const createOrUpdateBoldSignOperationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: jest.fn(),
}));
jest.mock('@/lib/boldsignServer', () => ({
  getDocumentProperties: jest.fn(),
  getTemplateProperties: jest.fn(),
  isBoldSignForbiddenError: jest.fn(() => false),
  isBoldSignInvalidTemplateIdError: jest.fn(() => false),
  isBoldSignNotFoundError: jest.fn(() => false),
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
  BOLDSIGN_OPERATION_TYPES: {
    DOCUMENT_SEND: 'DOCUMENT_SEND',
    TEMPLATE_CREATE: 'TEMPLATE_CREATE',
    TEMPLATE_DELETE: 'TEMPLATE_DELETE',
  },
  BOLDSIGN_SYNC_TIMEOUT_MS: 24 * 60 * 60 * 1000,
  createOrUpdateBoldSignOperation: (...args: any[]) => createOrUpdateBoldSignOperationMock(...args),
  findLatestBoldSignOperation: (...args: any[]) => findLatestBoldSignOperationMock(...args),
  getBoldSignOperationById: jest.fn(),
  listBoldSignOperationsForReconcile: jest.fn(),
  updateBoldSignOperationById: (...args: any[]) => updateBoldSignOperationByIdMock(...args),
}));

import {
  parseBoldSignWebhookEvent,
  processBoldSignWebhookEvent,
} from '@/lib/boldsignWebhookSync';

describe('boldsignWebhookSync operation status projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findLatestBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      operationType: 'DOCUMENT_SEND',
      status: 'PENDING_WEBHOOK',
      documentId: 'doc_1',
      templateDocumentId: 'template_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerRole: 'parent_guardian',
      eventId: 'event_1',
      payload: {},
    });
    prismaMock.signedDocuments.findUnique.mockResolvedValue(null);
    prismaMock.signedDocuments.findFirst.mockResolvedValue(null);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.create.mockResolvedValue({ id: 'signed_row_1' });
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 1 });
    createOrUpdateBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      status: 'PENDING_RECONCILE',
    });
    updateBoldSignOperationByIdMock.mockResolvedValue(undefined);
  });

  it('keeps document-send operations pending for unsigned lifecycle events', async () => {
    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'Sent',
        documentId: 'doc_1',
        status: 'Sent',
      },
      rawBody: JSON.stringify({ eventType: 'Sent', documentId: 'doc_1' }),
      headerEventType: 'Sent',
    });

    await processBoldSignWebhookEvent(event);

    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_1',
          status: 'UNSIGNED',
        }),
      }),
    );
    expect(updateBoldSignOperationByIdMock).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({
        status: 'PENDING_RECONCILE',
        completedAt: null,
      }),
    );
  });

  it('confirms document-send operations for completed signature events', async () => {
    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'Completed',
        documentId: 'doc_1',
        status: 'Completed',
      },
      rawBody: JSON.stringify({ eventType: 'Completed', documentId: 'doc_1' }),
      headerEventType: 'Completed',
    });

    await processBoldSignWebhookEvent(event);

    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_1',
          status: 'SIGNED',
        }),
      }),
    );
    expect(updateBoldSignOperationByIdMock).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({
        status: 'CONFIRMED',
        completedAt: expect.any(Date),
      }),
    );
  });

  it('does not downgrade already confirmed operations when late sent events arrive', async () => {
    findLatestBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      operationType: 'DOCUMENT_SEND',
      status: 'CONFIRMED',
      documentId: 'doc_1',
      templateDocumentId: 'template_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerRole: 'parent_guardian',
      eventId: 'event_1',
      payload: {},
      signedDocumentRecordId: 'signed_row_1',
    });

    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'Sent',
        documentId: 'doc_1',
        status: 'Sent',
      },
      rawBody: JSON.stringify({ eventType: 'Sent', documentId: 'doc_1' }),
      headerEventType: 'Sent',
    });

    await processBoldSignWebhookEvent(event);

    expect(updateBoldSignOperationByIdMock).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({
        status: 'CONFIRMED',
      }),
    );
  });

  it('projects revoked webhook events and marks operation as failed', async () => {
    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'Revoked',
        documentId: 'doc_1',
        status: 'Revoked',
      },
      rawBody: JSON.stringify({ eventType: 'Revoked', documentId: 'doc_1' }),
      headerEventType: 'Revoked',
    });

    await processBoldSignWebhookEvent(event);

    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_1',
          status: 'REVOKED',
        }),
      }),
    );
    expect(updateBoldSignOperationByIdMock).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({
        status: 'FAILED',
      }),
    );
  });

  it('creates signer rows and bootstraps a sync operation for manual sent webhooks', async () => {
    findLatestBoldSignOperationMock.mockResolvedValueOnce(null);
    prismaMock.templateDocuments.findFirst.mockResolvedValue({
      id: 'template_1',
      organizationId: 'org_1',
      title: 'Child Consent',
    });
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.email === 'parent@example.test') {
        return { userId: 'parent_1' };
      }
      if (where?.email === 'child@example.test') {
        return { userId: 'child_1' };
      }
      return null;
    });
    prismaMock.events.findMany.mockResolvedValue([
      { id: 'event_1', organizationId: 'org_1' },
    ]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      eventId: 'event_1',
    });

    const event = parseBoldSignWebhookEvent({
      payload: {
        eventType: 'Sent',
        templateId: 'bold_template_1',
        documentId: 'doc_manual_1',
        data: {
          status: 'InProgress',
          signerDetails: [
            { order: 1, signerRole: 'Parent/Guardian', signerEmail: 'parent@example.test', status: 'NotCompleted' },
            { order: 2, signerRole: 'Child', signerEmail: 'child@example.test', status: 'NotCompleted' },
          ],
        },
      },
      rawBody: JSON.stringify({ eventType: 'Sent', documentId: 'doc_manual_1' }),
      headerEventType: 'Sent',
    });

    await processBoldSignWebhookEvent(event);

    expect(prismaMock.signedDocuments.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.signedDocuments.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_manual_1',
          userId: 'parent_1',
          signerRole: 'parent_guardian',
          status: 'UNSIGNED',
        }),
      }),
    );
    expect(prismaMock.signedDocuments.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_manual_1',
          userId: 'child_1',
          signerRole: 'child',
          status: 'UNSIGNED',
        }),
      }),
    );
    expect(createOrUpdateBoldSignOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'webhook-document:doc_manual_1',
        status: 'PENDING_RECONCILE',
        signedDocumentRecordId: 'signed_row_1',
      }),
    );
  });
});
