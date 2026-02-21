/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  eventRegistrations: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const withLegacyFieldsMock = jest.fn((row) => ({ ...row, $id: row.id }));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/legacyFormat', () => ({ withLegacyFields: withLegacyFieldsMock }));

import { GET } from '@/app/api/family/join-requests/route';
import { PATCH } from '@/app/api/family/join-requests/[registrationId]/route';

const jsonPatch = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('family join requests routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
  });

  it('lists pending guardian approval requests', async () => {
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        id: 'reg_1',
        eventId: 'event_1',
        registrantId: 'child_1',
        divisionId: 'div_a',
        divisionTypeId: 'open',
        divisionTypeKey: 'c_skill_open',
        consentStatus: 'guardian_approval_required',
        createdAt: new Date('2026-02-17T10:00:00.000Z'),
        updatedAt: new Date('2026-02-17T10:30:00.000Z'),
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Weekend Open',
        start: new Date('2026-03-01T12:00:00.000Z'),
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'child_1',
        firstName: 'Alex',
        lastName: 'Lee',
        dateOfBirth: new Date('2014-05-20T00:00:00.000Z'),
      },
    ]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/family/join-requests'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0]).toEqual(expect.objectContaining({
      registrationId: 'reg_1',
      eventId: 'event_1',
      childUserId: 'child_1',
      childFullName: 'Alex Lee',
      childHasEmail: false,
      consentStatus: 'guardian_approval_required',
    }));
  });

  it('approves a pending request and marks child email requirement when missing', async () => {
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'reg_1',
      eventId: 'event_1',
      registrantId: 'child_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'guardian_approval_required',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      requiredTemplateIds: ['tmpl_1'],
      start: new Date('2026-03-01T12:00:00.000Z'),
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2015-05-20T00:00:00.000Z'),
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: null });
    prismaMock.eventRegistrations.update.mockResolvedValue({
      id: 'reg_1',
      eventId: 'event_1',
      registrantId: 'child_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'child_email_required',
    });
    prismaMock.events.update.mockResolvedValue({ id: 'event_1' });

    const response = await PATCH(
      jsonPatch('http://localhost/api/family/join-requests/reg_1', { action: 'approve' }),
      { params: Promise.resolve({ registrationId: 'reg_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.action).toBe('approved');
    expect(payload.consent).toEqual(expect.objectContaining({
      status: 'child_email_required',
      requiresChildEmail: true,
    }));
    expect(prismaMock.events.update).toHaveBeenCalled();
  });

  it('approves a team-signup request into free agents', async () => {
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'reg_team_1',
      eventId: 'event_team_1',
      registrantId: 'child_2',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'guardian_approval_required',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_team_1',
      teamSignup: true,
      userIds: ['adult_1'],
      freeAgentIds: ['adult_2'],
      requiredTemplateIds: [],
      start: new Date('2026-03-01T12:00:00.000Z'),
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2012-05-20T00:00:00.000Z'),
    });
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ email: 'child2@example.com' });
    prismaMock.eventRegistrations.update.mockResolvedValue({
      id: 'reg_team_1',
      eventId: 'event_team_1',
      registrantId: 'child_2',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'ACTIVE',
      consentStatus: null,
    });
    prismaMock.events.update.mockResolvedValue({ id: 'event_team_1' });

    const response = await PATCH(
      jsonPatch('http://localhost/api/family/join-requests/reg_team_1', { action: 'approve' }),
      { params: Promise.resolve({ registrationId: 'reg_team_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_1' },
      data: expect.objectContaining({
        freeAgentIds: expect.arrayContaining(['adult_2', 'child_2']),
      }),
    }));
  });

  it('declines a pending request', async () => {
    prismaMock.eventRegistrations.findFirst.mockResolvedValue({
      id: 'reg_2',
      eventId: 'event_1',
      registrantId: 'child_2',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'guardian_approval_required',
    });
    prismaMock.eventRegistrations.update.mockResolvedValue({
      id: 'reg_2',
      status: 'CANCELLED',
      consentStatus: 'guardian_declined',
    });

    const response = await PATCH(
      jsonPatch('http://localhost/api/family/join-requests/reg_2', { action: 'decline' }),
      { params: Promise.resolve({ registrationId: 'reg_2' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.action).toBe('declined');
    expect(payload.registration).toEqual(expect.objectContaining({
      status: 'CANCELLED',
      consentStatus: 'guardian_declined',
    }));
  });
});
