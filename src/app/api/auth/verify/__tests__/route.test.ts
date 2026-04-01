/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const getRequestOriginMock = jest.fn();
const authEmailVerificationMock = {
  readInitialEmailVerificationToken: jest.fn(),
  isInitialEmailVerificationAvailable: jest.fn(),
  sendInitialEmailVerification: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: (...args: any[]) => getRequestOriginMock(...args) }));
jest.mock('@/server/authEmailVerification', () => ({
  readInitialEmailVerificationToken: (...args: any[]) => authEmailVerificationMock.readInitialEmailVerificationToken(...args),
  isInitialEmailVerificationAvailable: () => authEmailVerificationMock.isInitialEmailVerificationAvailable(),
  sendInitialEmailVerification: (...args: any[]) => authEmailVerificationMock.sendInitialEmailVerification(...args),
}));

import { GET as VERIFY_CONFIRM_GET } from '@/app/api/auth/verify/confirm/route';
import { POST as VERIFY_RESEND_POST } from '@/app/api/auth/verify/resend/route';

const buildJsonRequest = (url: string, body: unknown, method = 'POST'): NextRequest => {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

describe('initial email verification routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRequestOriginMock.mockReturnValue('http://localhost');
    authEmailVerificationMock.isInitialEmailVerificationAvailable.mockReturnValue(true);
    authEmailVerificationMock.sendInitialEmailVerification.mockResolvedValue({ sent: true });
  });

  it('POST /api/auth/verify/resend sends verification email for unverified users', async () => {
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@example.com',
      emailVerifiedAt: null,
    });

    const req = buildJsonRequest('http://localhost/api/auth/verify/resend', { email: 'test@example.com' });
    const res = await VERIFY_RESEND_POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(authEmailVerificationMock.sendInitialEmailVerification).toHaveBeenCalledWith({
      userId: 'user_1',
      email: 'test@example.com',
      origin: 'http://localhost',
    });
  });

  it('POST /api/auth/verify/resend returns transport error when SMTP is unavailable', async () => {
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@example.com',
      emailVerifiedAt: null,
    });
    authEmailVerificationMock.isInitialEmailVerificationAvailable.mockReturnValue(false);

    const req = buildJsonRequest('http://localhost/api/auth/verify/resend', { email: 'test@example.com' });
    const res = await VERIFY_RESEND_POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe('Email verification is unavailable because SMTP is not configured.');
    expect(authEmailVerificationMock.sendInitialEmailVerification).not.toHaveBeenCalled();
  });

  it('GET /api/auth/verify/confirm verifies matching account email and redirects to success', async () => {
    authEmailVerificationMock.readInitialEmailVerificationToken.mockReturnValue({
      type: 'initial_email_verification',
      userId: 'user_1',
      email: 'test@example.com',
    });
    prismaMock.authUser.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'test@example.com',
      emailVerifiedAt: null,
    });
    prismaMock.authUser.update.mockResolvedValue({ id: 'user_1' });

    const req = new NextRequest('http://localhost/api/auth/verify/confirm?token=token-value');
    const res = await VERIFY_CONFIRM_GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login?');
    expect(res.headers.get('location')).toContain('verification=success');
    expect(prismaMock.authUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('GET /api/auth/verify/confirm redirects to error for invalid token payload', async () => {
    authEmailVerificationMock.readInitialEmailVerificationToken.mockReturnValue(null);

    const req = new NextRequest('http://localhost/api/auth/verify/confirm?token=bad-token');
    const res = await VERIFY_CONFIRM_GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('verification=error');
    expect(prismaMock.authUser.update).not.toHaveBeenCalled();
  });
});
