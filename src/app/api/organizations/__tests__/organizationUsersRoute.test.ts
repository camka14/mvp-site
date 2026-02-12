/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/organizations/[id]/users/route';

describe('GET /api/organizations/[id]/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 for users who are not part of the organization', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      refIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'League Night',
        start: new Date('2026-01-10T18:00:00.000Z'),
        end: new Date('2026-01-10T20:00:00.000Z'),
        userIds: ['player_1'],
      },
    ]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.userData.findMany).not.toHaveBeenCalled();
  });

  it('returns aggregated users with events and signed documents', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      refIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'League Night',
        start: new Date('2026-01-10T18:00:00.000Z'),
        end: new Date('2026-01-10T20:00:00.000Z'),
        userIds: ['player_1'],
      },
      {
        id: 'event_2',
        name: 'Weekend Ladder',
        start: new Date('2026-02-14T16:00:00.000Z'),
        end: new Date('2026-02-14T19:00:00.000Z'),
        userIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_1',
        registrantId: 'player_1',
        status: 'ACTIVE',
      },
      {
        eventId: 'event_2',
        registrantId: 'player_1',
        status: 'PENDINGCONSENT',
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'player_1',
        firstName: 'Pat',
        lastName: 'Lee',
        userName: 'plee',
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_pdf',
        title: 'Liability Waiver',
        type: 'PDF',
        content: null,
      },
      {
        id: 'tmpl_text',
        title: 'Code of Conduct',
        type: 'TEXT',
        content: 'I agree to follow the code of conduct.',
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_pdf_1',
        signedDocumentId: 'doc_pdf_1',
        templateId: 'tmpl_pdf',
        userId: 'player_1',
        documentName: 'Signed Document',
        eventId: 'event_1',
        status: 'SIGNED',
        signedAt: '2026-01-10T19:00:00.000Z',
        createdAt: new Date('2026-01-10T19:00:00.000Z'),
      },
      {
        id: 'signed_text_1',
        signedDocumentId: 'doc_text_1',
        templateId: 'tmpl_text',
        userId: 'player_1',
        documentName: 'Text Waiver',
        eventId: 'event_2',
        status: 'SIGNED',
        signedAt: '2026-02-14T18:30:00.000Z',
        createdAt: new Date('2026-02-14T18:30:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(1);
    expect(payload.users[0]).toEqual(expect.objectContaining({
      userId: 'player_1',
      fullName: 'Pat Lee',
      userName: 'plee',
    }));
    expect(payload.users[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: 'event_1', eventName: 'League Night', status: 'ACTIVE' }),
      expect.objectContaining({ eventId: 'event_2', eventName: 'Weekend Ladder', status: 'PENDINGCONSENT' }),
    ]));
    expect(payload.users[0].documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signedDocumentRecordId: 'signed_pdf_1',
        type: 'PDF',
        viewUrl: '/api/documents/signed/signed_pdf_1/file',
      }),
      expect.objectContaining({
        signedDocumentRecordId: 'signed_text_1',
        type: 'TEXT',
        content: 'I agree to follow the code of conduct.',
      }),
    ]));
  });
});
