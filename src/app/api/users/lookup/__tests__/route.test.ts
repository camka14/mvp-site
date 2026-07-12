/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: { findUnique: jest.fn() },
  sensitiveUserData: { findFirst: jest.fn() },
};
const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));

import { GET, POST } from '@/app/api/users/lookup/route';
import { GET as existsGet, POST as existsPost } from '@/app/api/users/exists/route';
import { GET as existsByEmailGet, POST as existsByEmailPost } from '@/app/api/users/exists-by-email/route';
import { GET as lookupByEmailGet, POST as lookupByEmailPost } from '@/app/api/users/lookup-by-email/route';

const getRequest = () => new NextRequest('http://localhost/api/users/lookup?email=target@example.com');
const postRequest = () => new NextRequest('http://localhost/api/users/lookup', {
  method: 'POST',
  body: JSON.stringify({ email: 'target@example.com' }),
});

describe('retired generic user lookup aliases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['lookup GET', GET, getRequest],
    ['lookup POST', POST, postRequest],
    ['exists GET', existsGet, getRequest],
    ['exists POST', existsPost, postRequest],
    ['exists-by-email GET', existsByEmailGet, getRequest],
    ['exists-by-email POST', existsByEmailPost, postRequest],
    ['lookup-by-email GET', lookupByEmailGet, getRequest],
    ['lookup-by-email POST', lookupByEmailPost, postRequest],
  ])('%s returns 410 without resolving account identity', async (_label, handler, buildRequest) => {
    const response = await handler(buildRequest());

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.stringContaining('retired') }));
  });

  it('does not run a session or identity lookup for retired routes', async () => {
    await GET(getRequest());

    expect(requireSessionMock).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.sensitiveUserData.findFirst).not.toHaveBeenCalled();
  });
});
