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
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { DELETE, POST } from '@/app/api/events/[eventId]/free-agents/route';

const jsonRequest = (method: 'POST' | 'DELETE', url: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event free-agent route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      freeAgentIds: [],
    });
    prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });
  });

  it('adds the current user as a free agent', async () => {
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      freeAgentIds: ['user_1'],
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          freeAgentIds: ['user_1'],
        }),
      }),
    );
  });

  it('removes the current user from free agents', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      freeAgentIds: ['user_1'],
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonRequest('DELETE', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          freeAgentIds: [],
        }),
      }),
    );
  });

  it('allows a parent to add a linked child as a free agent', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.userData.findUnique.mockResolvedValueOnce({ id: 'child_1' });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      freeAgentIds: ['child_1'],
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'child_1' }),
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
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          freeAgentIds: ['child_1'],
        }),
      }),
    );
  });

  it('forbids adding an unrelated user as free agent', async () => {
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.events.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });
});
