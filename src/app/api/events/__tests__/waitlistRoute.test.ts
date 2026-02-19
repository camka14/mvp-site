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
  volleyBallTeams: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { DELETE, POST } from '@/app/api/events/[eventId]/waitlist/route';

const jsonRequest = (method: 'POST' | 'DELETE', url: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event waitlist route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      waitListIds: [],
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      waitListIds: ['user_1'],
    });
    prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });
  });

  it('adds the current user to waitlist by default', async () => {
    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/waitlist', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({ waitListIds: ['user_1'] }),
      }),
    );
  });

  it('allows a parent to add a linked child to waitlist', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.userData.findUnique.mockResolvedValueOnce({ id: 'child_1' });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      waitListIds: ['child_1'],
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/waitlist', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).toHaveBeenCalledWith({
      where: {
        parentId: 'parent_1',
        childId: 'child_1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('forbids adding an unrelated user to waitlist', async () => {
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/waitlist', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.events.findUnique).not.toHaveBeenCalled();
  });

  it('adds a team when session user is on that team', async () => {
    prismaMock.volleyBallTeams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      playerIds: ['user_1'],
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      waitListIds: ['team_1'],
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/waitlist', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ waitListIds: ['team_1'] }),
      }),
    );
  });

  it('removes current user from waitlist', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      waitListIds: ['user_1'],
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      waitListIds: [],
    });

    const response = await DELETE(
      jsonRequest('DELETE', 'http://localhost/api/events/event_1/waitlist', {}),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ waitListIds: [] }),
      }),
    );
  });
});
