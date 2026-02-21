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

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: syncChildRegistrationConsentStatusMock,
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
  });

  it('syncs consent status for the current event for non sign-once templates', async () => {
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

    expect(response.status).toBe(200);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledTimes(1);
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      childUserId: 'child_1',
    });
  });

  it('syncs all pending/active child registrations when a sign-once template is signed', async () => {
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
      type: 'PDF',
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

