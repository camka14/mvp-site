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
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();
const findEventRegistrationMock = jest.fn();
const upsertEventRegistrationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: any[]) => dispatchRequiredEventDocumentsMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  findEventRegistration: (...args: unknown[]) => findEventRegistrationMock(...args),
  upsertEventRegistration: (...args: unknown[]) => upsertEventRegistrationMock(...args),
}));

import { POST } from '@/app/api/events/[eventId]/registrations/child/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/registrations/child', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      requiredTemplateIds: ['tmpl_1'],
      organizationId: null,
      userIds: [],
      waitListIds: [],
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.invites.deleteMany.mockResolvedValue({ count: 0 });
    findEventRegistrationMock.mockResolvedValue(null);
    upsertEventRegistrationMock.mockImplementation(async (params: Record<string, unknown>) => ({
      id: 'registration_1',
      ...params,
    }));
    prismaMock.userData.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === 'parent_1') {
        return { dateOfBirth: new Date('1988-04-01T00:00:00.000Z') };
      }
      if (where.id === 'child_1') {
        return { dateOfBirth: new Date('2014-05-20T00:00:00.000Z') };
      }
      return null;
    });
  });

  it('creates pending consent registration when child has no email', async () => {
    dispatchRequiredEventDocumentsMock.mockResolvedValueOnce({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: true,
      errors: [],
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: null });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/child', { childId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      parentId: 'parent_1',
      status: 'STARTED',
      consentStatus: 'child_email_required',
    }));
    expect(payload.consent).toEqual(expect.objectContaining({
      status: 'child_email_required',
      requiresChildEmail: true,
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      status: 'STARTED',
      consentStatus: 'child_email_required',
    }));
  });

  it('creates a child registration when child email is present', async () => {
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'child@example.com' });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/child', { childId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      parentId: 'parent_1',
      status: 'STARTED',
    }));
    expect(payload.consent).toEqual(expect.objectContaining({
      status: 'sent',
      childEmail: 'child@example.com',
    }));
  });

  it('projects active child registration into event userIds when no consent is required', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      requiredTemplateIds: [],
      organizationId: null,
      userIds: [],
      waitListIds: ['child_1'],
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValueOnce({ email: 'child@example.com' });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/child', { childId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      status: 'ACTIVE',
      consentStatus: null,
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      status: 'ACTIVE',
    }));
  });
});
