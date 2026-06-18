/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  eventRegistrations: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  templateDocuments: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  signedDocuments: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

const assertPublicWidgetEventMock = jest.fn();
const verifyGuestRegistrationTokenMock = jest.fn();
const syncChildRegistrationConsentStatusMock = jest.fn();
const resolveEventRegistrationPriceCentsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/publicGuestRegistration', () => {
  const actual = jest.requireActual('@/server/publicGuestRegistration');
  return {
    ...actual,
    assertPublicWidgetEvent: (...args: unknown[]) => assertPublicWidgetEventMock(...args),
    verifyGuestRegistrationToken: (...args: unknown[]) => verifyGuestRegistrationTokenMock(...args),
  };
});
jest.mock('@/lib/childConsentProgress', () => ({
  syncChildRegistrationConsentStatus: (...args: unknown[]) => syncChildRegistrationConsentStatusMock(...args),
}));
jest.mock('@/server/paidRegistrationGate', () => ({
  resolveEventRegistrationPriceCents: (...args: unknown[]) => resolveEventRegistrationPriceCentsMock(...args),
}));

import { POST } from '@/app/api/public/organizations/[slug]/events/[eventId]/guest-record-signature/route';

const requestFor = (body: unknown) => new NextRequest(
  'http://localhost/api/public/organizations/summit/events/event_1/guest-record-signature',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

describe('public guest record signature route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyGuestRegistrationTokenMock.mockReturnValue({
      kind: 'guest_registration',
      organizationId: 'org_1',
      eventId: 'event_1',
      registrationId: 'registration_1',
      parentUserId: 'parent_1',
      registrantId: 'child_1',
    });
    assertPublicWidgetEventMock.mockResolvedValue({
      organization: {
        id: 'org_1',
        slug: 'summit',
      },
      event: {
        id: 'event_1',
        requiredTemplateIds: ['template_1'],
      },
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      parentId: 'parent_1',
      status: 'STARTED',
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.update.mockResolvedValue({});
    prismaMock.templateDocuments.findUnique.mockResolvedValue({
      id: 'template_1',
      title: 'Event Waiver',
      type: 'TEXT',
      requiredSignerType: 'PARENT_GUARDIAN',
      signOnce: false,
    });
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'template_1',
        requiredSignerType: 'PARENT_GUARDIAN',
        signOnce: false,
      },
    ]);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'parent@test.com' });
    prismaMock.authUser.findUnique.mockResolvedValue({ email: 'parent@test.com' });
    prismaMock.signedDocuments.findFirst.mockResolvedValue({
      id: 'signed_1',
      organizationId: null,
      teamId: null,
      status: 'UNSIGNED',
      signedAt: null,
    });
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        templateId: 'template_1',
        userId: 'parent_1',
        signerRole: 'parent_guardian',
        hostId: 'child_1',
        eventId: 'event_1',
        status: 'SIGNED',
      },
    ]);
    prismaMock.signedDocuments.update.mockResolvedValue({});
    resolveEventRegistrationPriceCentsMock.mockResolvedValue(0);
  });

  it('records a text acknowledgement for a guest child registration without a session', async () => {
    const response = await POST(
      requestFor({
        registrationToken: 'guest.jwt',
        templateId: 'template_1',
        documentId: 'text-document-1',
        type: 'TEXT',
        signerContext: 'parent_guardian',
        childUserId: 'child_1',
      }),
      {
        params: Promise.resolve({
          slug: 'summit',
          eventId: 'event_1',
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(prismaMock.signedDocuments.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'signed_1' },
      data: expect.objectContaining({
        signedDocumentId: 'text-document-1',
        userId: 'parent_1',
        hostId: 'child_1',
        organizationId: 'org_1',
        eventId: 'event_1',
        status: 'SIGNED',
        signerEmail: 'parent@test.com',
        signerRole: 'parent_guardian',
      }),
    }));
    expect(syncChildRegistrationConsentStatusMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      childUserId: 'child_1',
      parentUserId: 'parent_1',
    });
  });

  it('activates a completed no-payment guest team registration after creator participant documents are signed', async () => {
    verifyGuestRegistrationTokenMock.mockReturnValueOnce({
      kind: 'guest_registration',
      organizationId: 'org_1',
      eventId: 'event_1',
      registrationId: 'team_registration_1',
      parentUserId: 'parent_1',
      registrantId: 'event_team_1',
      eventTeamId: 'event_team_1',
    });
    prismaMock.eventRegistrations.findUnique.mockResolvedValueOnce({
      id: 'team_registration_1',
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'event_team_1',
      eventTeamId: 'event_team_1',
      parentId: 'canonical_team_1',
      status: 'STARTED',
      divisionId: 'division_1',
      divisionTypeId: 'u12',
      divisionTypeKey: 'coed_age_u12',
    });
    prismaMock.templateDocuments.findUnique.mockResolvedValueOnce({
      id: 'template_1',
      title: 'Event Waiver',
      type: 'TEXT',
      requiredSignerType: 'PARTICIPANT',
      signOnce: false,
    });
    prismaMock.templateDocuments.findMany.mockResolvedValueOnce([
      {
        id: 'template_1',
        requiredSignerType: 'PARTICIPANT',
        signOnce: false,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValueOnce([
      {
        templateId: 'template_1',
        userId: 'parent_1',
        signerRole: 'participant',
        hostId: null,
        eventId: 'event_1',
        status: 'SIGNED',
      },
    ]);

    const response = await POST(
      requestFor({
        registrationToken: 'guest.jwt',
        templateId: 'template_1',
        documentId: 'text-document-1',
        type: 'TEXT',
        signerContext: 'participant',
      }),
      {
        params: Promise.resolve({
          slug: 'summit',
          eventId: 'event_1',
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(resolveEventRegistrationPriceCentsMock).toHaveBeenCalledWith(expect.objectContaining({
      selection: {
        divisionId: 'division_1',
        divisionTypeId: 'u12',
        divisionTypeKey: 'coed_age_u12',
      },
    }));
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith({
      where: { id: 'team_registration_1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        consentStatus: 'completed',
      }),
    });
  });
});
