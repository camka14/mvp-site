/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const applyRateLimitMock = jest.fn();
const sensitiveFindManyMock = jest.fn();
const authFindManyMock = jest.fn();
const userFindManyMock = jest.fn();
const createVisibilityContextMock = jest.fn();
const isVisibleInGenericSearchMock = jest.fn();
const applyUserPrivacyMock = jest.fn();

const prismaMock = {
  sensitiveUserData: { findMany: (...args: unknown[]) => sensitiveFindManyMock(...args) },
  authUser: { findMany: (...args: unknown[]) => authFindManyMock(...args) },
  userData: { findMany: (...args: unknown[]) => userFindManyMock(...args) },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/server/rateLimit', () => ({
  RATE_LIMIT_POLICIES: { contactMatch: { name: 'users:contact-match' } },
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));
jest.mock('@/server/userPrivacy', () => ({
  publicUserSelect: { id: true },
  createVisibilityContext: (...args: unknown[]) => createVisibilityContextMock(...args),
  isVisibleInGenericSearch: (...args: unknown[]) => isVisibleInGenericSearchMock(...args),
  applyUserPrivacy: (...args: unknown[]) => applyUserPrivacyMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  withDerivedCanonicalTeamIds: (users: unknown[]) => Promise.resolve(users),
}));

import { POST } from '@/app/api/users/contact-match/route';

const request = (body: unknown) => new NextRequest('http://localhost/api/users/contact-match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('contact match route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'viewer_1', isAdmin: false });
    applyRateLimitMock.mockResolvedValue(null);
    sensitiveFindManyMock.mockResolvedValue([]);
    authFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
    createVisibilityContextMock.mockResolvedValue({ viewerId: 'viewer_1', isAdmin: false });
    isVisibleInGenericSearchMock.mockReturnValue(true);
    applyUserPrivacyMock.mockImplementation((user) => ({ ...user, displayName: 'Taylor Player' }));
  });

  it('requires a selected contact method', async () => {
    const response = await POST(request({ email: ' ', phone: '' }));

    expect(response.status).toBe(400);
    expect(sensitiveFindManyMock).not.toHaveBeenCalled();
  });

  it('matches a normalized email without returning contact details', async () => {
    sensitiveFindManyMock.mockResolvedValue([{ userId: 'player_1' }]);
    authFindManyMock.mockResolvedValue([{ id: 'player_1' }]);
    userFindManyMock.mockResolvedValue([{ id: 'player_1', firstName: 'Taylor', lastName: 'Player' }]);

    const response = await POST(request({ email: ' Taylor@Example.com ' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(sensitiveFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ email: { equals: 'taylor@example.com', mode: 'insensitive' } }] },
    }));
    expect(authFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        email: { equals: 'taylor@example.com', mode: 'insensitive' },
        disabledAt: null,
      },
    }));
    expect(json).toEqual({
      matched: true,
      user: expect.objectContaining({ id: 'player_1', displayName: 'Taylor Player' }),
    });
    expect(JSON.stringify(json)).not.toContain('taylor@example.com');
  });

  it('only matches verified phone numbers and normalizes North American input', async () => {
    sensitiveFindManyMock.mockResolvedValue([{ userId: 'player_2' }]);
    userFindManyMock.mockResolvedValue([{ id: 'player_2', firstName: 'Morgan', lastName: 'Player' }]);

    const response = await POST(request({ phone: '(503) 555-0142' }));

    expect(response.status).toBe(200);
    expect(sensitiveFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ phoneNumberE164: '+15035550142', phoneVerifiedAt: { not: null } }],
      },
    }));
  });

  it('does not reveal accounts hidden from generic search', async () => {
    sensitiveFindManyMock.mockResolvedValue([{ userId: 'private_1' }]);
    userFindManyMock.mockResolvedValue([{ id: 'private_1', firstName: 'Private' }]);
    isVisibleInGenericSearchMock.mockReturnValue(false);

    const response = await POST(request({ email: 'private@example.com' }));

    await expect(response.json()).resolves.toEqual({ matched: false });
    expect(applyUserPrivacyMock).not.toHaveBeenCalled();
  });

  it('returns no match for an invalid phone instead of attempting a broad lookup', async () => {
    const response = await POST(request({ phone: '123' }));

    await expect(response.json()).resolves.toEqual({ matched: false });
    expect(sensitiveFindManyMock).not.toHaveBeenCalled();
    expect(authFindManyMock).not.toHaveBeenCalled();
  });

  it('honors the authenticated lookup rate limit', async () => {
    const limitedResponse = new Response('Slow down', { status: 429 });
    applyRateLimitMock.mockResolvedValue(limitedResponse);

    const response = await POST(request({ email: 'player@example.com' }));

    expect(response.status).toBe(429);
    expect(sensitiveFindManyMock).not.toHaveBeenCalled();
  });
});
