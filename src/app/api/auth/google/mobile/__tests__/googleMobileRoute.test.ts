/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  authUser: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userData: {
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

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => authServerMock);

import { POST as MOBILE_POST } from '@/app/api/auth/google/mobile/route';

const buildJsonRequest = (url: string, body: unknown, method = 'POST'): NextRequest => {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

describe('google mobile oauth route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    prismaMock.$transaction.mockImplementation(async (fn: any) =>
      fn({
        authUser: prismaMock.authUser,
        userData: prismaMock.userData,
        sensitiveUserData: prismaMock.sensitiveUserData,
      }),
    );

    authServerMock.hashPassword.mockResolvedValue('hashed');
    authServerMock.signSessionToken.mockReturnValue('signed-token');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('POST /api/auth/google/mobile exchanges a valid token and creates auth session', async () => {
    process.env.GOOGLE_MOBILE_ANDROID_CLIENT_ID = 'android-client-id';
    process.env.GOOGLE_MOBILE_IOS_CLIENT_ID = 'ios-client-id';

    const futureExp = String(Math.floor(Date.now() / 1000) + 600);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: 'android-client-id',
        iss: 'https://accounts.google.com',
        sub: 'google-sub-1',
        email: 'test@example.com',
        email_verified: 'true',
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        exp: futureExp,
      }),
    });
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

    const req = buildJsonRequest('http://localhost/api/auth/google/mobile', { idToken: 'id-token-123' });
    const res = await MOBILE_POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user.id).toBe('user_1');
    expect(json.token).toBe('signed-token');
    expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
    expect(prismaMock.authUser.create).toHaveBeenCalled();
  });

  it('POST /api/auth/google/mobile rejects token with disallowed audience', async () => {
    process.env.GOOGLE_MOBILE_ANDROID_CLIENT_ID = 'android-client-id';
    process.env.GOOGLE_MOBILE_IOS_CLIENT_ID = 'ios-client-id';

    const futureExp = String(Math.floor(Date.now() / 1000) + 600);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: 'wrong-audience',
        iss: 'https://accounts.google.com',
        sub: 'google-sub-1',
        email: 'test@example.com',
        email_verified: 'true',
        exp: futureExp,
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const req = buildJsonRequest('http://localhost/api/auth/google/mobile', { idToken: 'id-token-123' });
    const res = await MOBILE_POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(String(json.error)).toContain('audience');
    expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
  });
});
