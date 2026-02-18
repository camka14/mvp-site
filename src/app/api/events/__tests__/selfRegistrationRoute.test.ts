/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
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
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

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
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
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
