/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/boldsignServer', () => ({
  isBoldSignConfigured: jest.fn(),
  getTemplateRoles: jest.fn(),
  sendDocumentFromTemplate: jest.fn(),
  getEmbeddedSignLink: jest.fn(),
}));

import { POST } from '@/app/api/events/[eventId]/sign/route';
import {
  getEmbeddedSignLink,
  getTemplateRoles,
  isBoldSignConfigured,
  sendDocumentFromTemplate,
} from '@/lib/boldsignServer';

const isBoldSignConfiguredMock = isBoldSignConfigured as jest.MockedFunction<typeof isBoldSignConfigured>;
const getTemplateRolesMock = getTemplateRoles as jest.MockedFunction<typeof getTemplateRoles>;
const sendDocumentFromTemplateMock = sendDocumentFromTemplate as jest.MockedFunction<typeof sendDocumentFromTemplate>;
const getEmbeddedSignLinkMock = getEmbeddedSignLink as jest.MockedFunction<typeof getEmbeddedSignLink>;

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/sign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_1'],
      name: 'Weekend Open',
    });
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'player@example.com' });
    prismaMock.authUser.findUnique.mockResolvedValue(null);
  });

  it('returns text sign step for TEXT templates', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        type: 'TEXT',
        title: 'Text Waiver',
        content: 'I agree to the waiver.',
        signOnce: false,
      },
    ]);

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        userId: 'user_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toEqual([
      expect.objectContaining({
        templateId: 'tmpl_1',
        type: 'TEXT',
        content: 'I agree to the waiver.',
      }),
    ]);
  });

  it('returns embedded pdf sign step for PDF templates', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        templateId: 'bold_tmpl_1',
        type: 'PDF',
        title: 'PDF Waiver',
        description: 'Please sign this waiver.',
        signOnce: false,
        roleIndex: 1,
        roleIndexes: [1],
        signerRoles: ['Participant'],
      },
    ]);
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([{ roleIndex: 2, signerRole: 'Participant' }]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_1' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        userId: 'user_1',
        user: { firstName: 'Player', lastName: 'One' },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toEqual([
      expect.objectContaining({
        templateId: 'tmpl_1',
        type: 'PDF',
        documentId: 'doc_1',
        url: 'https://app.boldsign.com/sign/doc_1',
      }),
    ]);
    expect(sendDocumentFromTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'bold_tmpl_1',
        signerEmail: 'player@example.com',
        roleIndex: 2,
      }),
    );
  });
});
