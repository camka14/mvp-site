/** @jest-environment node */

import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('@/server/inviteUsers', () => ({ ensureAuthUserAndUserDataByEmail: jest.fn() }));

import { POST } from '@/app/api/users/ensure/route';

const prismaMock = jest.requireMock('@/lib/prisma').prisma as { $transaction: jest.Mock };
const ensureUserMock = jest.requireMock('@/server/inviteUsers').ensureAuthUserAndUserDataByEmail as jest.Mock;

describe('POST /api/users/ensure', () => {
  it('retires generic arbitrary-email account creation without touching persistence', async () => {
    const response = await POST(new NextRequest('http://localhost/api/users/ensure', {
      method: 'POST',
      body: JSON.stringify({ email: 'unrelated@example.com' }),
    }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: expect.stringContaining('retired') }));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(ensureUserMock).not.toHaveBeenCalled();
  });
});
