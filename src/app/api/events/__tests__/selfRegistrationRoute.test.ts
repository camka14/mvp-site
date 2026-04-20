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
  timeSlots: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
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
    prismaMock.eventRegistrations.findUnique.mockResolvedValue(null);
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.timeSlots.findUnique.mockResolvedValue(null);
    prismaMock.invites.deleteMany.mockResolvedValue({ count: 0 });
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
    expect(prismaMock.eventRegistrations.upsert).not.toHaveBeenCalled();
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
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          divisionId: 'div_a',
          divisionTypeId: 'open',
          divisionTypeKey: 'c_skill_open',
        }),
        update: expect.objectContaining({
          divisionId: 'div_a',
          divisionTypeId: 'open',
          divisionTypeKey: 'c_skill_open',
        }),
      }),
    );
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
    prismaMock.eventRegistrations.findUnique.mockResolvedValue({
      id: 'event_1__self__user_1',
      consentDocumentId: null,
      consentStatus: null,
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__self__user_1' },
        update: expect.objectContaining({
          status: 'ACTIVE',
          divisionId: 'div_a',
        }),
      }),
    );
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
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentStatus: null,
      consentDocumentId: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'ACTIVE',
          consentDocumentId: null,
          consentStatus: null,
        }),
        update: expect.objectContaining({
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
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentStatus: null,
      consentDocumentId: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'ACTIVE',
          consentDocumentId: null,
          consentStatus: null,
        }),
        update: expect.objectContaining({
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
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      registrantType: 'SELF',
      status: 'ACTIVE',
      rosterRole: 'PARTICIPANT',
      parentId: null,
      ageAtEvent: null,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentStatus: 'completed',
      consentDocumentId: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(dispatchRequiredEventDocumentsMock).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'ACTIVE',
          consentStatus: 'completed',
        }),
        update: expect.objectContaining({
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
    prismaMock.eventRegistrations.upsert.mockResolvedValueOnce({
      id: 'event_1__child__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      rosterRole: 'PARTICIPANT',
      status: 'STARTED',
      ageAtEvent: 12,
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      consentDocumentId: null,
      consentStatus: 'guardian_approval_required',
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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

  it('rejects weekly self registration for an occurrence that has already started', async () => {
    const pastOccurrence = new Date(Date.now() - 24 * 60 * 60 * 1000);
    pastOccurrence.setHours(0, 0, 0, 0);
    const pastOccurrenceDate = `${pastOccurrence.getFullYear()}-${`${pastOccurrence.getMonth() + 1}`.padStart(2, '0')}-${`${pastOccurrence.getDate()}`.padStart(2, '0')}`;
    const mondayIndex = (pastOccurrence.getDay() + 6) % 7;

    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: false,
      divisions: ['div_a'],
      requiredTemplateIds: [],
      organizationId: null,
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlotIds: ['slot_1'],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      daysOfWeek: [mondayIndex],
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
      divisions: ['div_a'],
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

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/self', {
        divisionId: 'div_a',
        slotId: 'slot_1',
        occurrenceDate: pastOccurrenceDate,
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error ?? '')).toContain('already started');
    expect(prismaMock.eventRegistrations.upsert).not.toHaveBeenCalled();
  });
});
