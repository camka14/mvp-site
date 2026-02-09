/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { PATCH as eventPatch } from '@/app/api/events/[eventId]/route';

const patchRequest = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event PATCH route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strips legacy $-prefixed fields and ignores unsupported keys (no legacy mapping)', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          $id: 'event_1',
          $createdAt: '2020-01-01T00:00:00.000Z',
          $updatedAt: '2020-01-02T00:00:00.000Z',
          id: 'event_1',
          playerIds: ['user_1'],
          players: [{ $id: 'user_2' }],
          organization: 'org_1',
          sport: { $id: 'sport_1', name: 'Volleyball' },
          state: 'PUBLISHED',
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(1);

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'event_1' });
    expect(updateArg.data.$id).toBeUndefined();
    expect(updateArg.data.$createdAt).toBeUndefined();
    expect(updateArg.data.$updatedAt).toBeUndefined();
    expect(updateArg.data.id).toBeUndefined();
    expect(updateArg.data.playerIds).toBeUndefined();
    expect(updateArg.data.players).toBeUndefined();
    expect(updateArg.data.organization).toBeUndefined();
    expect(updateArg.data.sport).toBeUndefined();
    expect(updateArg.data.organizationId).toBeUndefined();
    expect(updateArg.data.sportId).toBeUndefined();
    expect(updateArg.data.userIds).toBeUndefined();
    expect(updateArg.data.state).toBe('PUBLISHED');
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
  });

  it('updates userIds when provided (preferred field name)', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          userIds: ['user_1'],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(1);

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'event_1' });
    expect(updateArg.data.userIds).toEqual(['user_1']);
  });
});
