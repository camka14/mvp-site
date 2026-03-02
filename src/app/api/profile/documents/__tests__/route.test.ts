/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/profile/documents/route';

describe('GET /api/profile/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'user@example.com' });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        start: new Date('2026-03-01T10:00:00.000Z'),
        organizationId: 'org_1',
        requiredTemplateIds: ['tmpl_1'],
        userIds: ['user_1'],
        teamIds: [],
        freeAgentIds: [],
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        organizationId: 'org_1',
        title: 'Minor 7 Parent Waiver',
        type: 'PDF',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
        content: null,
      },
    ]);
    prismaMock.organizations.findMany.mockResolvedValue([
      {
        id: 'org_1',
        name: 'Soccer Club',
      },
    ]);
  });

  it('suppresses a scope from unsigned and signed lists when the latest status is revoked', async () => {
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_old',
        signedDocumentId: 'doc_signed_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
      {
        id: 'revoked_new',
        signedDocumentId: 'doc_revoked_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'REVOKED',
        signedAt: null,
        createdAt: new Date('2026-03-02T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unsigned).toEqual([]);
    expect(json.signed).toEqual([]);
  });

  it('keeps normal signed documents visible when they are not revoked', async () => {
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_1',
        signedDocumentId: 'doc_signed_1',
        templateId: 'tmpl_1',
        eventId: 'event_1',
        userId: 'user_1',
        hostId: null,
        signerRole: 'participant',
        status: 'SIGNED',
        signedAt: '2026-03-01T12:00:00.000Z',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/documents'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.unsigned).toEqual([]);
    expect(json.signed).toHaveLength(1);
    expect(json.signed[0]).toEqual(expect.objectContaining({
      id: 'signed_1',
      status: 'SIGNED',
      templateId: 'tmpl_1',
    }));
  });
});
