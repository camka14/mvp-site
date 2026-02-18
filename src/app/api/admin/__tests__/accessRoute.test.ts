/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const evaluateRazumlyAdminAccessMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/server/razumlyAdmin', () => ({
  evaluateRazumlyAdminAccess: (...args: any[]) => evaluateRazumlyAdminAccessMock(...args),
}));

import { GET as accessGet } from '@/app/api/admin/access/route';

describe('GET /api/admin/access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when session is missing', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    const res = await accessGet(new NextRequest('http://localhost/api/admin/access'));
    expect(res.status).toBe(401);
  });

  it('returns allowed=true for verified razumly admin', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: false });
    evaluateRazumlyAdminAccessMock.mockResolvedValue({
      allowed: true,
      email: 'admin@razumly.com',
      verified: true,
    });

    const res = await accessGet(new NextRequest('http://localhost/api/admin/access'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.allowed).toBe(true);
    expect(json.email).toBe('admin@razumly.com');
  });

  it('returns allowed=false for non-admin user', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    evaluateRazumlyAdminAccessMock.mockResolvedValue({
      allowed: false,
      email: 'user@example.com',
      verified: true,
      reason: 'invalid_domain',
    });

    const res = await accessGet(new NextRequest('http://localhost/api/admin/access'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.allowed).toBe(false);
    expect(json.reason).toBe('invalid_domain');
  });
});
