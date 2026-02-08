/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/repositories/events', () => ({ upsertEventFromPayload: jest.fn() }));

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
        where: expect.objectContaining({ state: 'TEMPLATE', hostId: 'host_1' }),
      }),
    );
  });

  it('forbids non-admin template listing when hostId param does not match session', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=TEMPLATE&hostId=host_2'));

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

