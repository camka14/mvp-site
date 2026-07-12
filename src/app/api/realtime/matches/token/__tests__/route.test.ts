/** @jest-environment node */

import { NextRequest } from 'next/server';

const jwtSignMock = jest.fn();
const prismaMock = {
  events: { findUnique: jest.fn() },
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const applyRateLimitMock = jest.fn();

jest.mock('jsonwebtoken', () => ({ sign: (...args: unknown[]) => jwtSignMock(...args) }));
jest.mock('@/lib/authServer', () => ({ getAuthSecret: () => 'test-secret' }));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));
jest.mock('@/server/rateLimit', () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
  RATE_LIMIT_POLICIES: { realtimeToken: { key: 'realtime' } },
}));

import { GET } from '@/app/api/realtime/matches/token/route';

const requestFor = (eventId: string) =>
  new NextRequest(`http://localhost/api/realtime/matches/token?eventId=${encodeURIComponent(eventId)}`);

describe('GET /api/realtime/matches/token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyRateLimitMock.mockResolvedValue(null);
    requireSessionMock.mockResolvedValue({ userId: 'viewer_1', isAdmin: false });
    jwtSignMock.mockReturnValue('signed-token');
  });

  it('denies a non-manager a realtime token for a private event', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_private',
      state: 'PRIVATE',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    canManageEventMock.mockResolvedValue(false);

    const response = await GET(requestFor('event_private'));

    expect(response.status).toBe(403);
    expect(jwtSignMock).not.toHaveBeenCalled();
  });

  it('allows the event manager to receive a private event token', async () => {
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_private',
      state: 'PRIVATE',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    canManageEventMock.mockResolvedValue(true);

    const response = await GET(requestFor('event_private'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ token: 'signed-token' }));
  });
});
