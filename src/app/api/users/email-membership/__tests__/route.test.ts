/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  eventOfficials: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
  },
  authUser: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));

import { POST } from '@/app/api/users/email-membership/route';

const jsonRequest = (body: unknown) => new NextRequest('http://localhost/api/users/email-membership', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/users/email-membership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: ['assistant_1'],
      organizationId: null,
    });
    prismaMock.eventOfficials.findMany.mockResolvedValue([{ userId: 'official_1' }]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.authUser.findMany.mockResolvedValue([]);
  });

  it('matches normalized emails using sensitive data first and auth email as fallback', async () => {
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([
      { userId: 'official_1', email: ' Official@Example.com ' },
      { userId: 'assistant_1', email: null },
    ]);
    prismaMock.authUser.findMany.mockResolvedValue([
      { id: 'assistant_1', email: 'assistant@example.com' },
      { id: 'user_3', email: 'other@example.com' },
    ]);

    const response = await POST(jsonRequest({
      emails: [' official@example.com ', 'assistant@example.com', 'REF@example.com'],
      userIds: ['official_1', 'assistant_1', 'user_3', ''],
      eventId: 'event_1',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([
      { email: 'official@example.com', userId: 'official_1' },
      { email: 'assistant@example.com', userId: 'assistant_1' },
    ]);
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['official_1', 'assistant_1'] } },
      select: { userId: true, email: true },
    });
    expect(prismaMock.authUser.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['assistant_1'] } },
      select: { id: true, email: true },
    });
  });

  it('returns an empty match list without querying when emails or userIds are empty after normalization', async () => {
    const response = await POST(jsonRequest({
      emails: ['  '],
      userIds: [''],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([]);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findMany).not.toHaveBeenCalled();
  });

  it('rejects an ordinary account before it can enumerate an event roster email', async () => {
    canManageEventMock.mockResolvedValue(false);

    const response = await POST(jsonRequest({
      emails: ['official@example.com'],
      userIds: ['official_1'],
      eventId: 'event_1',
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findMany).not.toHaveBeenCalled();
  });

  it('does not query arbitrary user IDs outside the managed event relationship', async () => {
    const response = await POST(jsonRequest({
      emails: ['outside@example.com'],
      userIds: ['outside_user'],
      eventId: 'event_1',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([]);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findMany).not.toHaveBeenCalled();
  });

  it('allows an unscoped request to compare only the signed-in user', async () => {
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([{ userId: 'host_1', email: 'host@example.com' }]);

    const response = await POST(jsonRequest({
      emails: ['host@example.com', 'outside@example.com'],
      userIds: ['host_1', 'outside_user'],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([{ email: 'host@example.com', userId: 'host_1' }]);
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['host_1'] } },
      select: { userId: true, email: true },
    });
  });

  it('rejects unbounded email lookup inputs', async () => {
    const response = await POST(jsonRequest({
      emails: Array.from({ length: 51 }, (_, index) => `user-${index}@example.com`),
      userIds: ['host_1'],
    }));

    expect(response.status).toBe(400);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
  });

  it('rejects unbounded user-id lookup inputs', async () => {
    const response = await POST(jsonRequest({
      emails: ['host@example.com'],
      userIds: Array.from({ length: 101 }, (_, index) => `user_${index}`),
    }));

    expect(response.status).toBe(400);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
  });
});

