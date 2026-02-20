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
  parentChildLinks: {
    findFirst: jest.fn(),
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
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);
    prismaMock.userData.findUnique.mockResolvedValue({
      firstName: 'Player',
      lastName: 'One',
      userName: 'player1',
    });
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

  it('filters parent/guardian templates for participant self-signing', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_participant',
        type: 'TEXT',
        title: 'Participant Waiver',
        content: 'Participant waiver',
        signOnce: false,
        requiredSignerType: 'PARTICIPANT',
      },
      {
        id: 'tmpl_parent',
        type: 'TEXT',
        title: 'Parent Waiver',
        content: 'Parent waiver',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN',
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_participant', 'tmpl_parent'],
      name: 'Weekend Open',
    });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        userId: 'user_1',
        signerContext: 'participant',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(data.signLinks[0]).toEqual(expect.objectContaining({
      templateId: 'tmpl_participant',
      requiredSignerType: 'PARTICIPANT',
    }));
  });

  it('returns parent/guardian templates when signing for a child registration', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_parent',
        type: 'TEXT',
        title: 'Parent Waiver',
        content: 'Parent waiver',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN',
      },
      {
        id: 'tmpl_child',
        type: 'TEXT',
        title: 'Child Waiver',
        content: 'Child waiver',
        signOnce: false,
        requiredSignerType: 'CHILD',
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_parent', 'tmpl_child'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(data.signLinks[0]).toEqual(expect.objectContaining({
      templateId: 'tmpl_parent',
      requiredSignerType: 'PARENT_GUARDIAN',
      requiredSignerLabel: 'Parent/Guardian',
    }));
  });

  it('returns parent/guardian+child templates with the combined signer label', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_parent_child',
        type: 'TEXT',
        title: 'Joint Waiver',
        content: 'Joint waiver',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_parent_child'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(data.signLinks[0]).toEqual(expect.objectContaining({
      templateId: 'tmpl_parent_child',
      requiredSignerType: 'PARENT_GUARDIAN_CHILD',
      requiredSignerLabel: 'Parent/Guardian + Child',
    }));
  });

  it('assigns all template roles when signing parent+child PDF templates from parent context', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_parent_child_pdf',
        templateId: 'bold_tmpl_parent_child',
        type: 'PDF',
        title: 'Parent + Child PDF Waiver',
        description: 'Parent and child must sign',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        roleIndex: 1,
        roleIndexes: [1, 2],
        signerRoles: ['Parent/Guardian', 'Child'],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_parent_child_pdf'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: { where: { userId?: string } }) => {
      if (where.userId === 'child_1') {
        return { email: null };
      }
      return { email: 'parent@example.com' };
    });
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_parent_child_1' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_parent_child_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(sendDocumentFromTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'bold_tmpl_parent_child',
        roleIndex: 1,
        signerRole: 'Parent/Guardian',
        roles: expect.arrayContaining([
          expect.objectContaining({
            roleIndex: 1,
            signerRole: 'Parent/Guardian',
            signerEmail: 'parent@example.com',
          }),
          expect.objectContaining({
            roleIndex: 2,
            signerRole: 'Child',
            signerEmail: 'parent@example.com',
          }),
        ]),
      }),
    );
  });

  it('uses the child signer role for child-context PDF signing', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_child_pdf',
        templateId: 'bold_tmpl_child',
        type: 'PDF',
        title: 'Child PDF Waiver',
        description: 'Child must sign',
        signOnce: false,
        requiredSignerType: 'CHILD',
        roleIndex: 1,
        roleIndexes: [1, 2],
        signerRoles: ['Parent/Guardian', 'Child'],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_child_pdf'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_child_1' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_child_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'child',
        childUserId: 'child_1',
        childEmail: 'child@example.com',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(data.signLinks[0]).toEqual(expect.objectContaining({
      templateId: 'tmpl_child_pdf',
      type: 'PDF',
      requiredSignerType: 'CHILD',
    }));
    expect(sendDocumentFromTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roleIndex: 2,
        signerRole: 'Child',
      }),
    );
  });

  it('falls back to parent email for child-context PDF signing when child email is missing', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_child_pdf',
        templateId: 'bold_tmpl_child',
        type: 'PDF',
        title: 'Child PDF Waiver',
        description: 'Child must sign',
        signOnce: false,
        requiredSignerType: 'CHILD',
        roleIndex: 1,
        roleIndexes: [1, 2],
        signerRoles: ['Parent/Guardian', 'Child'],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_child_pdf'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst
      .mockResolvedValueOnce({ id: 'link_1' })
      .mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: { where: { userId?: string } }) => {
      if (where.userId === 'child_1') {
        return { email: null };
      }
      if (where.userId === 'user_1') {
        return { email: 'parent@example.com' };
      }
      return null;
    });
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_child_2' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_child_2' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'child',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(sendDocumentFromTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signerEmail: 'parent@example.com',
        roleIndex: 2,
        signerRole: 'Child',
      }),
    );
  });
});
