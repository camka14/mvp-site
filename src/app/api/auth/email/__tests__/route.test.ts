/** @jest-environment node */

import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const verifyPasswordMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const getRequestOriginMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/authServer', () => ({
  verifyPassword: (...args: any[]) => verifyPasswordMock(...args),
}));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));
jest.mock('@/lib/requestOrigin', () => ({
  getRequestOrigin: (...args: any[]) => getRequestOriginMock(...args),
}));

import { POST as EMAIL_POST } from '@/app/api/auth/email/route';
import { GET as EMAIL_CONFIRM_GET } from '@/app/api/auth/email/confirm/route';

const buildJsonRequest = (url: string, body: unknown, method = 'POST'): NextRequest => {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

describe('email change routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, AUTH_SECRET: 'test-secret' };
    getRequestOriginMock.mockReturnValue('http://localhost');
    verifyPasswordMock.mockResolvedValue(true);
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn({
      authUser: prismaMock.authUser,
      sensitiveUserData: prismaMock.sensitiveUserData,
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('POST /api/auth/email sends a verification email for a valid request', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.authUser.findUnique
      .mockResolvedValueOnce({
        id: 'user_1',
        email: 'old@example.com',
        passwordHash: 'hash',
      })
      .mockResolvedValueOnce(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);

    const req = buildJsonRequest('http://localhost/api/auth/email', {
      newEmail: 'new@example.com',
      currentPassword: 'password123',
    });
    const res = await EMAIL_POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.to).toBe('new@example.com');
    const match = String(payload.text).match(/https?:\/\/\S+/);
    expect(match).not.toBeNull();
    const verificationUrl = new URL(match![0]);
    const token = verificationUrl.searchParams.get('token');
    expect(token).toBeTruthy();

    const decoded = jwt.verify(token as string, 'test-secret') as jwt.JwtPayload;
    expect(decoded.userId).toBe('user_1');
    expect(decoded.newEmail).toBe('new@example.com');
    expect(decoded.type).toBe('email_change');
  });

  it('GET /api/auth/email/confirm applies the verified email and redirects to profile success state', async () => {
    const token = jwt.sign(
      { type: 'email_change', userId: 'user_1', newEmail: 'new@example.com' },
      'test-secret',
      { expiresIn: '30m' },
    );

    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.authUser.update.mockResolvedValue({ id: 'user_1' });
    prismaMock.sensitiveUserData.updateMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest(`http://localhost/api/auth/email/confirm?token=${encodeURIComponent(token)}`);
    const res = await EMAIL_CONFIRM_GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('http://localhost/profile?');
    expect(res.headers.get('location')).toContain('emailChange=success');
    expect(prismaMock.authUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ email: 'new@example.com' }),
      }),
    );
    expect(prismaMock.sensitiveUserData.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
        data: expect.objectContaining({ email: 'new@example.com' }),
      }),
    );
  });

  it('GET /api/auth/email/confirm redirects to profile error state for invalid tokens', async () => {
    const req = new NextRequest('http://localhost/api/auth/email/confirm?token=invalid-token');
    const res = await EMAIL_CONFIRM_GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('emailChange=error');
  });
});
