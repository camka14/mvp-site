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
  verifyPassword: jest.fn(),
  signSessionToken: jest.fn(),
  verifySessionToken: jest.fn(),
  getTokenFromRequest: jest.fn(),
  setAuthCookie: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => authServerMock);
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST as REGISTER_POST } from '@/app/api/auth/register/route';
import { POST as LOGIN_POST } from '@/app/api/auth/login/route';
import { GET as ME_GET } from '@/app/api/auth/me/route';
import { POST as LOGOUT_POST } from '@/app/api/auth/logout/route';
import { POST as PASSWORD_POST } from '@/app/api/auth/password/route';

const buildJsonRequest = (url: string, body: unknown, method = 'POST'): NextRequest => {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
};

describe('auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn({
      authUser: prismaMock.authUser,
      userData: prismaMock.userData,
      sensitiveUserData: prismaMock.sensitiveUserData,
    }));

    authServerMock.hashPassword.mockResolvedValue('hashed');
    authServerMock.verifyPassword.mockResolvedValue(true);
    authServerMock.signSessionToken.mockReturnValue('signed-token');
  });

  describe('POST /api/auth/register', () => {
    it('creates auth, profile, and sensitive records', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findFirst.mockResolvedValue(null);
      prismaMock.userData.findUnique.mockResolvedValue(null);

      prismaMock.authUser.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.create.mockResolvedValue({
        id: 'user_1',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: new Date('2000-01-01'),
      });
      prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'Test@Example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.user.id).toBe('user_1');
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
      expect(prismaMock.authUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            passwordHash: 'hashed',
          }),
        }),
      );
      expect(prismaMock.userData.create).toHaveBeenCalled();
      expect(prismaMock.sensitiveUserData.upsert).toHaveBeenCalled();
    });

    it('rejects duplicate emails', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({ id: 'user_existing' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'duplicate@example.com',
        password: 'password123',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error).toBe('Email already in use');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(prismaMock.authUser.update).toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
    });

    it('rejects invalid credentials', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      authServerMock.verifyPassword.mockResolvedValue(false);

      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'bad-password',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid credentials');
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns null session when no token present', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue(null);

      const req = new NextRequest('http://localhost/api/auth/me');
      const res = await ME_GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toBeNull();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('clears cookies for invalid token', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue('bad-token');
      authServerMock.verifySessionToken.mockReturnValue(null);

      const req = new NextRequest('http://localhost/api/auth/me');
      const res = await ME_GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toBeNull();
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
    });

    it('returns session and refreshes token', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue('token');
      authServerMock.verifySessionToken.mockReturnValue({ userId: 'user_1', isAdmin: false });
      authServerMock.signSessionToken.mockReturnValue('refreshed-token');

      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const req = new NextRequest('http://localhost/api/auth/me');
      const res = await ME_GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'refreshed-token');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears auth cookie', async () => {
      const res = await LOGOUT_POST();

      expect(res.status).toBe(200);
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
    });
  });

  describe('POST /api/auth/password', () => {
    it('updates password for current user', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        passwordHash: 'hashed',
      });
      authServerMock.hashPassword.mockResolvedValue('new-hash');
      authServerMock.signSessionToken.mockReturnValue('refreshed-token');

      const req = buildJsonRequest('http://localhost/api/auth/password', {
        currentPassword: 'password123',
        newPassword: 'password456',
      });

      const res = await PASSWORD_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(prismaMock.authUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'new-hash' }),
        }),
      );
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'refreshed-token');
    });
  });
});
