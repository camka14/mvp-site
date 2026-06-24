/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

const authServerMock = {
  hashPassword: jest.fn(),
  signSessionToken: jest.fn(),
  setAuthCookie: jest.fn(),
};
const sendAdminAccountCreatedNotificationMock = jest.fn();
const authTotpMfaMock = {
  createWebLoginMfaChallenge: jest.fn(),
  isLocalAuthMfaBypassEnabled: jest.fn(),
  isTotpMfaError: jest.fn(),
  readTotpMfaRequestMetadata: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => authServerMock);
jest.mock('@/server/adminNotifications', () => ({
  sendAdminAccountCreatedNotification: (...args: any[]) => sendAdminAccountCreatedNotificationMock(...args),
}));
jest.mock('@/server/authTotpMfa', () => ({
  createWebLoginMfaChallenge: (...args: any[]) => authTotpMfaMock.createWebLoginMfaChallenge(...args),
  isLocalAuthMfaBypassEnabled: (...args: any[]) => authTotpMfaMock.isLocalAuthMfaBypassEnabled(...args),
  isTotpMfaError: (...args: any[]) => authTotpMfaMock.isTotpMfaError(...args),
  readTotpMfaRequestMetadata: (...args: any[]) => authTotpMfaMock.readTotpMfaRequestMetadata(...args),
}));

import { GET as START_GET } from '@/app/api/auth/google/start/route';
import { GET as CALLBACK_GET } from '@/app/api/auth/google/callback/route';

const getSetCookies = (res: Response): string[] => {
  const headersAny = res.headers as any;
  if (typeof headersAny.getSetCookie === 'function') {
    return headersAny.getSetCookie();
  }
  const value = res.headers.get('set-cookie');
  return value ? [value] : [];
};

describe('google oauth routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn({
      authUser: prismaMock.authUser,
      userData: prismaMock.userData,
      sensitiveUserData: prismaMock.sensitiveUserData,
    }));

    authServerMock.hashPassword.mockResolvedValue('hashed');
    authServerMock.signSessionToken.mockReturnValue('signed-token');
    sendAdminAccountCreatedNotificationMock.mockResolvedValue(undefined);
    authTotpMfaMock.isLocalAuthMfaBypassEnabled.mockReturnValue(false);
    authTotpMfaMock.isTotpMfaError.mockReturnValue(false);
    authTotpMfaMock.readTotpMfaRequestMetadata.mockReturnValue({ ipHash: 'ip_hash', userAgent: 'jest' });
    authTotpMfaMock.createWebLoginMfaChallenge.mockResolvedValue(null);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('GET /api/auth/google/start redirects to Google and sets PKCE cookies', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';

    const req = new NextRequest('http://localhost/api/auth/google/start?next=%2Fdiscover');
    const res = await START_GET(req);

    expect(res.status).toBe(302);
    const location = res.headers.get('location') || '';
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(location).toContain('client_id=client-id');
    expect(location).toContain('redirect_uri=');

    const setCookies = getSetCookies(res);
    const cookieText = setCookies.join('\n');
    expect(cookieText).toContain('google_oauth_state=');
    expect(cookieText).toContain('google_oauth_verifier=');
    expect(cookieText).toContain('google_oauth_next=');
  });

  it('GET /api/auth/google/start normalizes unsafe next values to /discover', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';

    const req = new NextRequest('http://localhost/api/auth/google/start?next=%2F%2Fevil.com%0Ainjected');
    const res = await START_GET(req);

    expect(res.status).toBe(302);
    const setCookies = getSetCookies(res);
    const cookieText = setCookies.join('\n');
    expect(cookieText).toContain('google_oauth_next=%2Fdiscover');
  });

  it('GET /api/auth/google/callback exchanges code, creates user if needed, and redirects to MFA', async () => {
    authTotpMfaMock.createWebLoginMfaChallenge.mockResolvedValueOnce({
      code: 'MFA_REQUIRED',
      mfa: {
        challengeId: 'mfa_google_1',
        expiresAt: '2026-06-11T20:00:00.000Z',
        method: 'totp',
      },
    });
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';

    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'access-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'test@example.com', email_verified: true, name: 'Test User' }) });
    (globalThis as any).fetch = fetchMock;

    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
    prismaMock.authUser.create.mockResolvedValue({
      id: 'user_1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.userData.findUnique.mockResolvedValue(null);
    prismaMock.userData.create.mockResolvedValue({ id: 'user_1' });
    prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

    const req = new NextRequest('http://localhost/api/auth/google/callback?code=code123&state=state123', {
      headers: {
        cookie: 'google_oauth_state=state123; google_oauth_verifier=verifier123; google_oauth_next=/discover',
      },
    });
    const res = await CALLBACK_GET(req);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') || '');
    expect(location.origin).toBe('http://localhost');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('oauth')).toBe('google');
    expect(location.searchParams.get('mfa')).toBe('code');
    expect(location.searchParams.get('mfaChallenge')).toBe('mfa_google_1');
    expect(location.searchParams.get('mfaSetupQrUrl')).toBeNull();
    expect(location.searchParams.get('next')).toBe('/discover');
    expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    expect(authTotpMfaMock.createWebLoginMfaChallenge).toHaveBeenCalledWith({
      userId: 'user_1',
      sessionVersion: 0,
      metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
    });
    expect(prismaMock.authUser.create).toHaveBeenCalled();
    expect(sendAdminAccountCreatedNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      email: 'test@example.com',
      authProvider: 'google',
      wasInviteClaim: false,
    }));
  });

  it('GET /api/auth/google/callback falls back to /discover for the optional MFA offer when next cookie is unsafe', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';

    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'access-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'test@example.com', email_verified: true, name: 'Test User' }) });
    (globalThis as any).fetch = fetchMock;

    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
    prismaMock.authUser.create.mockResolvedValue({
      id: 'user_1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.userData.findUnique.mockResolvedValue(null);
    prismaMock.userData.create.mockResolvedValue({ id: 'user_1' });
    prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

    const req = new NextRequest('http://localhost/api/auth/google/callback?code=code123&state=state123', {
      headers: {
        cookie: 'google_oauth_state=state123; google_oauth_verifier=verifier123; google_oauth_next=//evil.com%0Ainjected',
      },
    });
    const res = await CALLBACK_GET(req);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') || '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('oauth')).toBe('google');
    expect(location.searchParams.get('mfaOffer')).toBe('1');
    expect(location.searchParams.get('next')).toBe('/discover');
    expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
  });
});
