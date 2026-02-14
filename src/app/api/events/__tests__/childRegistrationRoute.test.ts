/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
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
    create: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

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
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      requiredTemplateIds: ['tmpl_1'],
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
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

  it('rejects child registration when child has no email', async () => {
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: null });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/child', { childId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Child email is required before registration.');
    expect(prismaMock.eventRegistrations.create).not.toHaveBeenCalled();
  });

  it('creates a child registration when child email is present', async () => {
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'child@example.com' });
    prismaMock.eventRegistrations.create.mockResolvedValue({
      id: 'registration_1',
      status: 'PENDINGCONSENT',
      eventId: 'event_1',
      registrantId: 'child_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      consentStatus: 'sent',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/registrations/child', { childId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      parentId: 'parent_1',
    }));
    expect(payload.consent).toEqual(expect.objectContaining({
      status: 'sent',
      childEmail: 'child@example.com',
    }));
  });
});
