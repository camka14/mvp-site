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
    create: jest.fn(),
    update: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
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
    delete process.env.BOLDSIGN_DEV_REDIRECT_BASE_URL;
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_1'],
      name: 'Weekend Open',
    });
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.create.mockResolvedValue({
      id: 'signed_doc_1',
      signedDocumentId: 'doc_1',
    });
    prismaMock.signedDocuments.update.mockResolvedValue({
      id: 'signed_doc_1',
      signedDocumentId: 'doc_1',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
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
    process.env.BOLDSIGN_DEV_REDIRECT_BASE_URL = 'https://mvp-dev.ngrok-free.app';

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        userId: 'user_1',
        user: { firstName: 'Player', lastName: 'One' },
        redirectUrl: 'http://localhost:3000/discover',
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
    expect(getEmbeddedSignLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: 'https://mvp-dev.ngrok-free.app/discover',
      }),
    );
  });

  it('does not force a redirect URL when the client did not request one', async () => {
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
        requiredSignerType: 'PARTICIPANT',
      },
    ]);
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([{ roleIndex: 2, signerRole: 'Participant' }]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_1' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_1' });
    process.env.BOLDSIGN_DEV_REDIRECT_BASE_URL = 'https://mvp-dev.ngrok-free.app';

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
    expect(getEmbeddedSignLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: undefined,
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

  it('returns no sign links when the parent has already signed for the same child context', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_parent',
        templateId: 'bold_tmpl_parent',
        type: 'PDF',
        title: 'Parent Waiver',
        description: 'Parent waiver',
        signOnce: false,
        requiredSignerType: 'PARENT_GUARDIAN',
        roleIndex: 1,
        roleIndexes: [1],
        signerRoles: ['Parent/Guardian'],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_parent'],
      name: 'Weekend Open',
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_doc_parent_1',
        signedDocumentId: 'doc_parent_1',
        status: 'SIGNED',
      },
    ]);
    isBoldSignConfiguredMock.mockReturnValue(true);

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toEqual([]);
    expect(sendDocumentFromTemplateMock).not.toHaveBeenCalled();
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
        return { email: 'child@example.com' };
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
        enableSigningOrder: false,
        roles: expect.arrayContaining([
          expect.objectContaining({
            roleIndex: 1,
            signerRole: 'Parent/Guardian',
            signerEmail: 'parent@example.com',
          }),
          expect.objectContaining({
            roleIndex: 2,
            signerRole: 'Child',
            signerEmail: 'child@example.com',
          }),
        ]),
      }),
    );
  });

  it('enables signing order when parent and child share the same email on parent+child templates', async () => {
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
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'shared@example.com' });
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_parent_child_shared' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_parent_child_shared' });

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
        enableSigningOrder: true,
        roles: expect.arrayContaining([
          expect.objectContaining({
            roleIndex: 1,
            signerOrder: 1,
            signerEmail: 'shared@example.com',
          }),
          expect.objectContaining({
            roleIndex: 2,
            signerOrder: 2,
            signerEmail: 'shared@example.com',
          }),
        ]),
      }),
    );
  });

  it('reuses the shared parent+child document when child signs after parent', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
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
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({ parentId: 'user_1' });
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: { where: { userId?: string } }) => {
      if (where.userId === 'child_1') {
        return { email: 'child@example.com' };
      }
      return { email: 'parent@example.com' };
    });
    prismaMock.signedDocuments.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'signed_doc_parent_1',
          signedDocumentId: 'doc_parent_child_1',
          status: 'SIGNED',
        },
      ]);
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_parent_child_1' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'child',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toEqual([
      expect.objectContaining({
        templateId: 'tmpl_parent_child_pdf',
        documentId: 'doc_parent_child_1',
      }),
    ]);
    expect(sendDocumentFromTemplateMock).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signedDocumentId: 'doc_parent_child_1',
          userId: 'child_1',
          signerRole: 'child',
          signerEmail: 'child@example.com',
        }),
      }),
    );
  });

  it('uses the child signer role for child-context PDF signing by the child account', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
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
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: { where: { userId?: string } }) => {
      if (where.userId === 'child_1') {
        return { email: 'child@example.com' };
      }
      return { email: 'parent@example.com' };
    });
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
        signerEmail: 'child@example.com',
      }),
    );
  });

  it('forbids parent accounts from initiating child-context signatures', async () => {
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
    prismaMock.sensitiveUserData.findFirst.mockImplementation(async ({ where }: { where: { userId?: string } }) => {
      if (where.userId === 'child_1') {
        return { email: 'child@example.com' };
      }
      return { email: 'parent@example.com' };
    });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'child',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('child account');
  });

  it('allows parent accounts to initiate child-context signatures when parent and child share email', async () => {
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
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({ parentId: 'user_1' });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'shared@example.com' });
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([
      { roleIndex: 1, signerRole: 'Parent/Guardian' },
      { roleIndex: 2, signerRole: 'Child' },
    ]);
    sendDocumentFromTemplateMock.mockResolvedValue({ documentId: 'doc_child_shared' });
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_child_shared' });

    const res = await POST(
      jsonPost('http://localhost/api/events/event_1/sign', {
        signerContext: 'child',
        childUserId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.signLinks).toHaveLength(1);
    expect(data.signLinks[0]).toEqual(expect.objectContaining({
      templateId: 'tmpl_child_pdf',
      type: 'PDF',
    }));
  });

  it('returns a child-email error for child-context PDF signing when child email is missing', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
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
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('signer email');
    expect(sendDocumentFromTemplateMock).not.toHaveBeenCalled();
  });

  it('reuses an existing unsigned document instead of creating a new BoldSign document', async () => {
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
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_doc_pending',
        signedDocumentId: 'doc_pending_1',
        status: 'UNSIGNED',
      },
    ]);
    isBoldSignConfiguredMock.mockReturnValue(true);
    getTemplateRolesMock.mockResolvedValue([{ roleIndex: 1, signerRole: 'Participant' }]);
    getEmbeddedSignLinkMock.mockResolvedValue({ signLink: 'https://app.boldsign.com/sign/doc_pending_1' });

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
        documentId: 'doc_pending_1',
        url: 'https://app.boldsign.com/sign/doc_pending_1',
      }),
    ]);
    expect(sendDocumentFromTemplateMock).not.toHaveBeenCalled();
    expect(prismaMock.signedDocuments.create).not.toHaveBeenCalled();
  });
});
