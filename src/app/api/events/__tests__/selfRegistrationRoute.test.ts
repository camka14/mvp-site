/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: any[]) => dispatchRequiredEventDocumentsMock(...args),
}));

import { POST } from '@/app/api/events/[eventId]/registrations/self/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/registrations/self', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.eventRegistrations.update.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
    });
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.invites.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: ['user_1'],
      waitListIds: [],
    });
  });

  it('requires division selection when registering by individual division', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: false,
      divisions: ['div_a', 'div_b'],
      requiredTemplateIds: [],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
      {
        id: 'div_b',
        key: 'c_skill_open',
        name: 'Open B',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('Select a division');
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });

  it('stores resolved division details when registering by division type', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a', 'div_b'],
      requiredTemplateIds: [],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
      {
        id: 'div_b',
        key: 'c_skill_open',
        name: 'Open B',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.eventRegistrations.create.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          divisionId: 'div_a',
          divisionTypeId: 'open',
          divisionTypeKey: 'c_skill_open',
        }),
      }),
    );
    expect(prismaMock.events.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1' },
      data: expect.objectContaining({
        userIds: ['user_1'],
        waitListIds: [],
      }),
    }));
  });

  it('reuses existing self registration row instead of creating duplicates', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a'],
      requiredTemplateIds: [],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'registration_existing',
      consentDocumentId: null,
      consentStatus: null,
    });
    prismaMock.eventRegistrations.update.mockResolvedValue({
      id: 'registration_existing',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'registration_existing' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          divisionId: 'div_a',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });

  it('does not require consent when event templates are not participant signer templates', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a'],
      requiredTemplateIds: ['tmpl_parent'],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_parent',
        requiredSignerType: 'PARENT_GUARDIAN',
      },
    ]);
    prismaMock.eventRegistrations.create.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      consentStatus: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          consentDocumentId: null,
          consentStatus: null,
        }),
      }),
    );
  });

  it('ignores missing template ids when determining participant consent requirements', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a'],
      requiredTemplateIds: ['tmpl_missing'],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.create.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      consentStatus: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          consentDocumentId: null,
          consentStatus: null,
        }),
      }),
    );
  });

  it('activates self registration when participant templates are already signed', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a'],
      requiredTemplateIds: ['tmpl_participant'],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_participant',
        requiredSignerType: 'PARTICIPANT',
        signOnce: true,
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        templateId: 'tmpl_participant',
        status: 'SIGNED',
      },
    ]);
    prismaMock.eventRegistrations.create.mockResolvedValue({
      id: 'registration_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      consentStatus: 'completed',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          consentStatus: 'completed',
        }),
      }),
    );
  });

  it('creates guardian approval request for minor self registration', async () => {
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      dateOfBirth: new Date('2014-01-01T00:00:00.000Z'),
    });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: true,
      divisions: ['div_a'],
      requiredTemplateIds: ['tmpl_1'],
      organizationId: null,
    });
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
      },
    ]);
    prismaMock.eventRegistrations.create.mockResolvedValueOnce({
      id: 'registration_minor_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'guardian_approval_required',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requiresParentApproval).toBe(true);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'user_1',
      parentId: 'parent_1',
      consentStatus: 'guardian_approval_required',
    }));
  });
});
