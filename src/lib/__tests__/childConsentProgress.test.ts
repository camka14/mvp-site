/** @jest-environment node */

const prismaMock = {
  eventRegistrations: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
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
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { syncChildRegistrationConsentStatus } from '@/lib/childConsentProgress';

describe('syncChildRegistrationConsentStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'registration_1',
      parentId: 'parent_1',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      requiredTemplateIds: ['template_1'],
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({
      email: 'child@example.com',
    });
  });

  it('counts sign-once child signatures from other events', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        signOnce: true,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        templateId: 'template_1',
        status: 'SIGNED',
        userId: 'parent_1',
        signerRole: 'parent_guardian',
      },
      {
        templateId: 'template_1',
        status: 'SIGNED',
        userId: 'child_1',
        signerRole: 'child',
      },
    ]);

    await syncChildRegistrationConsentStatus({
      eventId: 'event_1',
      childUserId: 'child_1',
    });

    const where = prismaMock.signedDocuments.findMany.mock.calls[0][0]?.where ?? {};
    expect(where).toEqual(expect.objectContaining({
      templateId: { in: ['template_1'] },
    }));
    expect(where).not.toHaveProperty('eventId');

    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration_1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        consentStatus: 'completed',
      }),
    }));
  });

  it('keeps event-scoped templates tied to the current event', async () => {
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        requiredSignerType: 'PARENT_GUARDIAN_CHILD',
        signOnce: false,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        templateId: 'template_1',
        status: 'SIGNED',
        userId: 'parent_1',
        signerRole: 'parent_guardian',
      },
    ]);

    await syncChildRegistrationConsentStatus({
      eventId: 'event_1',
      childUserId: 'child_1',
    });

    const where = prismaMock.signedDocuments.findMany.mock.calls[0][0]?.where ?? {};
    expect(where).toEqual(expect.objectContaining({
      templateId: { in: ['template_1'] },
      eventId: 'event_1',
    }));

    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration_1' },
      data: expect.objectContaining({
        status: 'PENDINGCONSENT',
        consentStatus: 'parentSigned',
      }),
    }));
  });
});

