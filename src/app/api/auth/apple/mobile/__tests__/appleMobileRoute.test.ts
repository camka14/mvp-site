/** @jest-environment node */

import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
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

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => authServerMock);

import { POST as APPLE_POST } from '@/app/api/auth/apple/mobile/route';

const buildJsonRequest = (url: string, body: unknown, method = 'POST'): NextRequest => {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

const buildSigningMaterial = () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey & {
    kty: string;
    n: string;
    e: string;
  };

  return {
    privateKey,
    jwk: {
      ...publicJwk,
      kid: 'apple-key-1',
      alg: 'RS256',
      use: 'sig',
    },
  };
};

describe('apple mobile oauth route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, APPLE_MOBILE_BUNDLE_ID: 'com.razumly.mvp' };

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

  it('POST /api/auth/apple/mobile exchanges a valid token and creates auth session', async () => {
    const signingMaterial = buildSigningMaterial();
    const identityToken = jwt.sign(
      {
        sub: 'apple-user-1',
        email: 'apple@example.com',
        email_verified: 'true',
      },
      signingMaterial.privateKey,
      {
        algorithm: 'RS256',
        keyid: signingMaterial.jwk.kid,
        issuer: 'https://appleid.apple.com',
        audience: 'com.razumly.mvp',
        expiresIn: '10m',
      },
    );

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [signingMaterial.jwk],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.sensitiveUserData.findFirst.mockResolvedValue({ id: 'user_apple', userId: 'user_apple', email: 'apple@example.com' });
    prismaMock.authUser.create.mockResolvedValue({
      id: 'user_apple',
      email: 'apple@example.com',
      name: 'Apple User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.userData.findUnique.mockResolvedValue(null);
    prismaMock.userData.create.mockResolvedValue({ id: 'user_apple' });
    prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_apple' });

    const req = buildJsonRequest('http://localhost/api/auth/apple/mobile', {
      identityToken,
      user: 'apple-user-1',
      firstName: 'Apple',
      lastName: 'User',
    });
    const res = await APPLE_POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.user.id).toBe('user_apple');
    expect(json.token).toBe('signed-token');
    expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
    expect(prismaMock.authUser.create).toHaveBeenCalled();
  });

  it('POST /api/auth/apple/mobile rejects mismatched credential user and token subject', async () => {
    const signingMaterial = buildSigningMaterial();
    const identityToken = jwt.sign(
      {
        sub: 'apple-user-1',
        email: 'apple@example.com',
        email_verified: 'true',
      },
      signingMaterial.privateKey,
      {
        algorithm: 'RS256',
        keyid: signingMaterial.jwk.kid,
        issuer: 'https://appleid.apple.com',
        audience: 'com.razumly.mvp',
        expiresIn: '10m',
      },
    );

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [signingMaterial.jwk],
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const req = buildJsonRequest('http://localhost/api/auth/apple/mobile', {
      identityToken,
      user: 'wrong-user',
    });
    const res = await APPLE_POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(String(json.error)).toContain('subject');
    expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
  });
});
