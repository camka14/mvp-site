/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/repositories/events', () => ({ upsertEventFromPayload: jest.fn() }));
jest.mock('@/server/eventCreationNotifications', () => ({ notifySocialAudienceOfEventCreation: jest.fn() }));

import { GET as eventsGet } from '@/app/api/events/route';
import { GET as eventGet } from '@/app/api/events/[eventId]/route';
import { POST as searchPost } from '@/app/api/events/search/route';
import { GET as eventsByFieldGet } from '@/app/api/events/field/[fieldId]/route';

const jsonPost = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event template privacy routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes templates from GET /api/events when no state filter is provided', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);
    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
      }),
    );
  });

  it('requires session and scopes host when listing templates via GET /api/events?state=TEMPLATE', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=TEMPLATE'));

    expect(res.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalled();
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'TEMPLATE',
          hostId: 'host_1',
          organizationId: null,
        }),
      }),
    );
  });

  it('forbids non-admin template listing when hostId param does not match session', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=TEMPLATE&hostId=host_2'));

    expect(res.status).toBe(403);
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('allows org managers to list org event templates without host scoping', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ ownerId: 'owner_1', hostIds: ['host_1'] });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(
      new NextRequest('http://localhost/api/events?state=TEMPLATE&organizationId=org_1'),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.organizations.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
      }),
    );
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'TEMPLATE',
          organizationId: 'org_1',
        }),
      }),
    );
    expect(prismaMock.events.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hostId: 'host_1',
        }),
      }),
    );
  });

  it('forbids non-managers from listing org event templates', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ ownerId: 'owner_1', hostIds: ['host_1'] });

    const res = await eventsGet(
      new NextRequest('http://localhost/api/events?state=TEMPLATE&organizationId=org_1'),
    );

    expect(res.status).toBe(403);
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('forbids reading a template event when requester is not host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'TEMPLATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(403);
    expect(requireSessionMock).toHaveBeenCalled();
  });

  it('allows reading a template event when requester is host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'TEMPLATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('allows reading an org template when requester manages the org and template host is blank', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      state: 'TEMPLATE',
      hostId: '',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      ownerId: 'owner_1',
      hostIds: ['host_1'],
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('excludes templates from POST /api/events/search results', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
      }),
    );
  });

  it('defaults POST /api/events/search to today-and-later results', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-19T15:45:00.000Z'));
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    try {
      const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

      expect(res.status).toBe(200);
      expect(prismaMock.events.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            start: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );

      const findManyCalls = prismaMock.events.findMany.mock.calls;
      const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
      const startGte = callArgs?.where?.start?.gte as Date | undefined;
      const expectedStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
        0,
        0,
        0,
        0,
      );
      expect(startGte?.toISOString()).toBe(expectedStart.toISOString());
    } finally {
      jest.useRealTimers();
    }
  });

  it('excludes templates from GET /api/events/field/:fieldId results', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsByFieldGet(
      new NextRequest('http://localhost/api/events/field/field_1'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
      }),
    );
  });
});
