/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  signedDocuments: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const syncChildRegistrationConsentStatusMock = jest.fn();
const findLatestBoldSignOperationMock = jest.fn();
const createOrUpdateBoldSignOperationMock = jest.fn();
const updateBoldSignOperationByIdMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: syncChildRegistrationConsentStatusMock,
}));
jest.mock('@/lib/boldsignSyncOperations', () => ({
  BOLDSIGN_OPERATION_STATUSES: {
    PENDING_WEBHOOK: 'PENDING_WEBHOOK',
  },
  BOLDSIGN_OPERATION_TYPES: {
    DOCUMENT_SEND: 'DOCUMENT_SEND',
  },
  findLatestBoldSignOperation: (...args: any[]) => findLatestBoldSignOperationMock(...args),
  createOrUpdateBoldSignOperation: (...args: any[]) => createOrUpdateBoldSignOperationMock(...args),
  updateBoldSignOperationById: (...args: any[]) => updateBoldSignOperationByIdMock(...args),
}));

import { POST } from '@/app/api/documents/record-signature/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/documents/record-signature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({ organizationId: 'org_1' });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.signedDocuments.findFirst.mockResolvedValue(null);
    prismaMock.signedDocuments.create.mockResolvedValue({ id: 'signed_1' });
    prismaMock.templateDocuments.findUnique.mockResolvedValue({ signOnce: false });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    syncChildRegistrationConsentStatusMock.mockResolvedValue(undefined);
    findLatestBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      status: 'PENDING_WEBHOOK',
      payload: {},
      templateDocumentId: 'template_1',
      eventId: 'event_1',
    });
    createOrUpdateBoldSignOperationMock.mockResolvedValue({
      id: 'op_1',
      status: 'PENDING_WEBHOOK',
      payload: {},
      templateDocumentId: 'template_1',
      eventId: 'event_1',
    });
    updateBoldSignOperationByIdMock.mockResolvedValue(undefined);
  });

  it('acknowledges PDF callbacks without mutating signedDocuments directly', async () => {
    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'PDF',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      ok: true,
      operationId: 'op_1',
      syncStatus: 'PENDING_WEBHOOK',
    }));
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.update).not.toHaveBeenCalled();
    expect(syncChildRegistrationConsentStatusMock).not.toHaveBeenCalled();
    expect(updateBoldSignOperationByIdMock).toHaveBeenCalled();
  });

  it('stores text acknowledgements as signed immediately', async () => {
    await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SIGNED',
          signedAt: expect.any(String),
          signerRole: 'parent_guardian',
        }),
      }),
    );
  });

  it('does not downgrade an already signed text row when receiving another text callback', async () => {
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      organizationId: 'org_1',
      status: 'SIGNED',
      signedAt: '2026-03-01T01:02:03.000Z',
    });

    await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(prismaMock.signedDocuments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'signed_1' },
        data: expect.objectContaining({
          status: 'SIGNED',
          signedAt: '2026-03-01T01:02:03.000Z',
        }),
      }),
    );
  });

  it('syncs all pending/active child registrations when a sign-once text template is signed', async () => {
    prismaMock.templateDocuments.findUnique.mockResolvedValue({ signOnce: true });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      { eventId: 'event_1', parentId: 'parent_1' },
      { eventId: 'event_2', parentId: 'parent_1' },
      { eventId: 'event_2', parentId: 'parent_1' },
      { eventId: 'event_3', parentId: null },
    ]);

    const response = await POST(jsonPost('http://localhost/api/documents/record-signature', {
      templateId: 'template_1',
      documentId: 'document_1',
      eventId: 'event_1',
      userId: 'parent_1',
      childUserId: 'child_1',
      signerContext: 'parent_guardian',
      user: { email: 'parent@example.com' },
      type: 'TEXT',
    }));

    expect(response.status).toBe(200);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledTimes(3);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      childUserId: 'child_1',
      parentUserId: 'parent_1',
    });
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_2',
      childUserId: 'child_1',
      parentUserId: 'parent_1',
    });
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_3',
      childUserId: 'child_1',
      parentUserId: undefined,
    });
  });
});
