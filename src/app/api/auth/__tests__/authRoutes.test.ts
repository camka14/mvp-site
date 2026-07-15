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
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invites: {
    findFirst: jest.fn(),
  },
  staffMembers: {
    findFirst: jest.fn(),
  },
  sensitiveUserData: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const authServerMock = {
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
  signSessionToken: jest.fn(),
  verifySessionToken: jest.fn(),
  signWatchSetupToken: jest.fn(),
  verifyWatchSetupToken: jest.fn(),
  getTokenFromRequest: jest.fn(),
  setAuthCookie: jest.fn(),
  WATCH_SETUP_TOKEN_TTL_SECONDS: 300,
};

const requireSessionMock = jest.fn();
const getRequestOriginMock = jest.fn();
const authSessionsMock = {
  revokeAuthUserSessions: jest.fn(),
  isSessionTokenCurrent: jest.fn(),
};
const pushNotificationsMock = {
  unregisterPushDeviceTargetForUser: jest.fn(),
};
const authEmailVerificationMock = {
  isInitialEmailVerificationAvailable: jest.fn(),
  sendInitialEmailVerification: jest.fn(),
};
const authTotpMfaMock = {
  createWebLoginMfaChallenge: jest.fn(),
  isLocalAuthMfaBypassEnabled: jest.fn(),
  isTotpMfaError: jest.fn(),
  isWebLoginClient: jest.fn(),
  readTotpMfaRequestMetadata: jest.fn(),
};
const adminNotificationsMock = {
  sendAdminAccountCreatedNotification: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => authServerMock);
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: (...args: any[]) => getRequestOriginMock(...args) }));
jest.mock('@/server/authSessions', () => authSessionsMock);
jest.mock('@/server/pushNotifications', () => ({
  unregisterPushDeviceTargetForUser: (...args: any[]) => pushNotificationsMock.unregisterPushDeviceTargetForUser(...args),
}));
jest.mock('@/server/authEmailVerification', () => ({
  isInitialEmailVerificationAvailable: () => authEmailVerificationMock.isInitialEmailVerificationAvailable(),
  sendInitialEmailVerification: (...args: any[]) => authEmailVerificationMock.sendInitialEmailVerification(...args),
}));
jest.mock('@/server/authTotpMfa', () => ({
  createWebLoginMfaChallenge: (...args: any[]) => authTotpMfaMock.createWebLoginMfaChallenge(...args),
  isLocalAuthMfaBypassEnabled: (...args: any[]) => authTotpMfaMock.isLocalAuthMfaBypassEnabled(...args),
  isTotpMfaError: (...args: any[]) => authTotpMfaMock.isTotpMfaError(...args),
  isWebLoginClient: (...args: any[]) => authTotpMfaMock.isWebLoginClient(...args),
  readTotpMfaRequestMetadata: (...args: any[]) => authTotpMfaMock.readTotpMfaRequestMetadata(...args),
}));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminAccountCreatedNotification: (...args: any[]) => adminNotificationsMock.sendAdminAccountCreatedNotification(...args),
}));

import { POST as REGISTER_POST } from '@/app/api/auth/register/route';
import { POST as LOGIN_POST } from '@/app/api/auth/login/route';
import { GET as ME_GET } from '@/app/api/auth/me/route';
import { POST as LOGOUT_POST } from '@/app/api/auth/logout/route';
import { POST as PASSWORD_POST } from '@/app/api/auth/password/route';
import { POST as WATCH_SETUP_POST } from '@/app/api/auth/watch/setup/route';
import { POST as WATCH_EXCHANGE_POST } from '@/app/api/auth/watch/exchange/route';

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
      invites: prismaMock.invites,
      staffMembers: prismaMock.staffMembers,
      sensitiveUserData: prismaMock.sensitiveUserData,
      teamRegistrations: prismaMock.teamRegistrations,
      teamStaffAssignments: prismaMock.teamStaffAssignments,
    }));

    authServerMock.hashPassword.mockResolvedValue('hashed');
    authServerMock.verifyPassword.mockResolvedValue(true);
    authServerMock.signSessionToken.mockReturnValue('signed-token');
    authServerMock.signWatchSetupToken.mockReturnValue('watch-setup-token');
    authServerMock.verifyWatchSetupToken.mockReturnValue({
      userId: 'user_1',
      sessionVersion: 0,
      purpose: 'watch_setup',
      issuedAtSeconds: 1,
    });
    getRequestOriginMock.mockReturnValue('http://localhost');
    authSessionsMock.revokeAuthUserSessions.mockResolvedValue(1);
    authSessionsMock.isSessionTokenCurrent.mockReturnValue(true);
    pushNotificationsMock.unregisterPushDeviceTargetForUser.mockResolvedValue({ count: 1 });
    authEmailVerificationMock.isInitialEmailVerificationAvailable.mockReturnValue(true);
    authEmailVerificationMock.sendInitialEmailVerification.mockResolvedValue({ sent: true });
    authTotpMfaMock.isWebLoginClient.mockImplementation((value: unknown) => value === 'web');
    authTotpMfaMock.isLocalAuthMfaBypassEnabled.mockReturnValue(false);
    authTotpMfaMock.isTotpMfaError.mockReturnValue(false);
    authTotpMfaMock.readTotpMfaRequestMetadata.mockReturnValue({ ipHash: 'ip_hash', userAgent: 'jest' });
    authTotpMfaMock.createWebLoginMfaChallenge.mockResolvedValue(null);
    adminNotificationsMock.sendAdminAccountCreatedNotification.mockResolvedValue(undefined);
    prismaMock.invites.findFirst.mockResolvedValue(null);
    prismaMock.staffMembers.findFirst.mockResolvedValue(null);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
  });

  describe('POST /api/auth/register', () => {
    it('creates auth, profile, and sensitive records', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue(null);
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
        teamIds: ['legacy_only'],
      });
      prismaMock.teamRegistrations.findMany.mockResolvedValue([
        { userId: 'user_1', teamId: 'team_current' },
      ]);
      prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'Test@Example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
        onboardingIntent: 'ORGANIZATION',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json.user.id).toBe('user_1');
      expect(json.profile.teamIds).toEqual(['team_current']);
      expect(json.code).toBe('EMAIL_NOT_VERIFIED');
      expect(json.session).toBeUndefined();
      expect(json.token).toBeUndefined();
      expect(json.requiresEmailVerification).toBe(true);
      expect(json.verificationEmailSent).toBe(true);
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
      expect(prismaMock.sensitiveUserData.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prismaMock.authUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            passwordHash: 'hashed',
          }),
        }),
      );
      expect(prismaMock.sensitiveUserData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_1' },
        }),
      );
      expect(authEmailVerificationMock.sendInitialEmailVerification).toHaveBeenCalledWith({
        userId: 'user_1',
        email: 'test@example.com',
        origin: 'http://localhost',
      });
      expect(adminNotificationsMock.sendAdminAccountCreatedNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user_1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        authProvider: 'password',
        wasInviteClaim: false,
      }));
      expect(prismaMock.userData.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingIntent: 'ORGANIZATION' }),
      }));
      expect(prismaMock.sensitiveUserData.upsert).toHaveBeenCalled();
    });

    it('returns a persisted verification-pending account when delivery fails', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue(null);
      prismaMock.userData.findUnique.mockResolvedValue(null);
      prismaMock.authUser.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        sessionVersion: 0,
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
      authEmailVerificationMock.sendInitialEmailVerification.mockRejectedValue(new Error('SMTP timeout'));

      const res = await REGISTER_POST(buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
      }));
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json).toEqual(expect.objectContaining({
        code: 'EMAIL_NOT_VERIFIED',
        requiresEmailVerification: true,
        verificationEmailSent: false,
        user: expect.objectContaining({ id: 'user_1', email: 'test@example.com' }),
      }));
      expect(json.session).toBeUndefined();
      expect(json.token).toBeUndefined();
      expect(json.error).toMatch(/account was created/i);
      expect(prismaMock.authUser.create).toHaveBeenCalled();
      expect(prismaMock.userData.create).toHaveBeenCalled();
      expect(prismaMock.userData.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ onboardingIntent: 'DISCOVER_EVENTS' }),
      }));
      expect(prismaMock.sensitiveUserData.upsert).toHaveBeenCalled();
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('returns a persisted verification-pending account when SMTP is unavailable', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue(null);
      prismaMock.userData.findUnique.mockResolvedValue(null);
      prismaMock.authUser.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        sessionVersion: 0,
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
      authEmailVerificationMock.isInitialEmailVerificationAvailable.mockReturnValue(false);

      const res = await REGISTER_POST(buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
      }));
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json).toEqual(expect.objectContaining({
        code: 'EMAIL_NOT_VERIFIED',
        requiresEmailVerification: true,
        verificationEmailSent: false,
      }));
      expect(json.session).toBeUndefined();
      expect(json.token).toBeUndefined();
      expect(authEmailVerificationMock.sendInitialEmailVerification).not.toHaveBeenCalled();
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('rejects duplicate emails', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_existing',
        email: 'duplicate@example.com',
        name: null,
        passwordHash: 'salt:hash',
        lastLogin: new Date(),
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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

    it('rejects a future date of birth before creating the account', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue(null);
      prismaMock.userData.findUnique.mockResolvedValue(null);

      const res = await REGISTER_POST(buildJsonRequest('http://localhost/api/auth/register', {
        email: 'future-dob@example.com',
        password: 'password123',
        firstName: 'Future',
        lastName: 'Date',
        dateOfBirth: '2999-01-01',
      }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('dateOfBirth cannot be in the future');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicate usernames (case-insensitive)', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue(null);
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue(null);
      prismaMock.userData.findUnique.mockResolvedValue(null);
      prismaMock.userData.findFirst.mockResolvedValue({ id: 'user_existing' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        userName: 'Existing_User',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error).toBe('Username already in use.');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('claims placeholder invite-created auth user', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: null,
        passwordHash: '__NO_PASSWORD__',
        lastLogin: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
      prismaMock.userData.findUnique.mockResolvedValue({
        id: 'user_1',
        firstName: null,
        lastName: null,
        userName: 'invited',
        dateOfBirth: new Date('2000-01-01'),
      });

      prismaMock.authUser.update.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.update.mockResolvedValue({
        id: 'user_1',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: new Date('2000-01-01'),
      });
      prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json.user.id).toBe('user_1');
      expect(prismaMock.authUser.create).not.toHaveBeenCalled();
      expect(prismaMock.authUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: expect.objectContaining({
            passwordHash: 'hashed',
          }),
        }),
      );
      expect(adminNotificationsMock.sendAdminAccountCreatedNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user_1',
        email: 'test@example.com',
        authProvider: 'password',
        wasInviteClaim: true,
      }));
    });

    it('sets the home organization when claiming an organization invite account', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: null,
        passwordHash: '__NO_PASSWORD__',
        lastLogin: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
      prismaMock.userData.findUnique.mockResolvedValue({
        id: 'user_1',
        firstName: null,
        lastName: null,
        userName: 'invited',
        dateOfBirth: new Date('2000-01-01'),
        homePageOrganizationId: null,
      });
      prismaMock.invites.findFirst.mockResolvedValue({ organizationId: 'org_1' });

      prismaMock.authUser.update.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.update.mockResolvedValue({
        id: 'user_1',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: new Date('2000-01-01'),
        homePageOrganizationId: 'org_1',
      });
      prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        userName: 'tester',
        dateOfBirth: '2000-01-01',
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json.user.id).toBe('user_1');
      expect(prismaMock.invites.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user_1',
          type: 'STAFF',
          organizationId: { not: null },
          status: { notIn: ['DECLINED', 'FAILED'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { organizationId: true },
      });
      expect(prismaMock.userData.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: expect.objectContaining({
            homePageOrganizationId: 'org_1',
          }),
        }),
      );
    });

    it('returns profile conflict for claim signup when selection is required', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: null,
        passwordHash: '__NO_PASSWORD__',
        lastLogin: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
      prismaMock.userData.findUnique.mockResolvedValue({
        id: 'user_1',
        firstName: 'Existing',
        lastName: 'User',
        userName: 'existing_user',
        dateOfBirth: new Date('2010-01-01'),
      });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Incoming',
        lastName: 'User',
        userName: 'existing_user',
        dateOfBirth: '2010-01-01',
        enforceProfileConflictSelection: true,
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.code).toBe('PROFILE_CONFLICT');
      expect(json.conflict.fields).toContain('firstName');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.authUser.update).not.toHaveBeenCalled();
    });

    it('applies selected profile values during claim signup', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: null,
        passwordHash: '__NO_PASSWORD__',
        lastLogin: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.sensitiveUserData.findUnique.mockResolvedValue({ id: 'user_1', userId: 'user_1', email: 'test@example.com' });
      prismaMock.userData.findUnique.mockResolvedValue({
        id: 'user_1',
        firstName: 'Existing',
        lastName: 'User',
        userName: 'existing_user',
        dateOfBirth: new Date('2010-01-01'),
      });

      prismaMock.authUser.update.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.update.mockResolvedValue({
        id: 'user_1',
        firstName: 'Incoming',
        lastName: 'User',
        userName: 'existing_user',
        dateOfBirth: new Date('2010-01-01'),
      });
      prismaMock.sensitiveUserData.upsert.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        firstName: 'Incoming',
        lastName: 'User',
        userName: 'existing_user',
        dateOfBirth: '2010-01-01',
        enforceProfileConflictSelection: true,
        profileSelection: {
          firstName: 'Incoming',
        },
      });

      const res = await REGISTER_POST(req);
      const json = await res.json();

      expect(res.status).toBe(202);
      expect(json.user.id).toBe('user_1');
      expect(prismaMock.userData.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: expect.objectContaining({
            firstName: 'Incoming',
          }),
        }),
      );
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.authUser.update.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.authUser.update.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: null,
        sessionVersion: 0,
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
      expect(authTotpMfaMock.createWebLoginMfaChallenge).toHaveBeenCalledWith({
        userId: 'user_1',
        sessionVersion: 0,
        metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      });
    });

    it('resolves a username to its authentication account', async () => {
      prismaMock.userData.findFirst.mockResolvedValueOnce({ id: 'user_1' });
      prismaMock.authUser.findUnique.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.authUser.update.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const res = await LOGIN_POST(buildJsonRequest('http://localhost/api/auth/login', {
        email: 'Camka14',
        password: 'password123',
      }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(prismaMock.userData.findFirst).toHaveBeenCalledWith({
        where: {
          userName: {
            equals: 'camka14',
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });
      expect(prismaMock.authUser.findUnique).toHaveBeenCalledWith({ where: { id: 'user_1' } });
    });

    it('does not force MFA setup for website login when no authenticator is enabled', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        clientType: 'web',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(json.code).toBeUndefined();
      expect(authTotpMfaMock.createWebLoginMfaChallenge).toHaveBeenCalledWith({
        userId: 'user_1',
        sessionVersion: 3,
        metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      });
      expect(prismaMock.authUser.update).toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
    });

    it('requires MFA for website login without setting a session cookie', async () => {
      authTotpMfaMock.createWebLoginMfaChallenge.mockResolvedValueOnce({
        code: 'MFA_REQUIRED',
        mfa: {
          challengeId: 'mfa_1',
          expiresAt: '2026-06-11T20:00:00.000Z',
          method: 'totp',
        },
      });
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        clientType: 'web',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.code).toBe('MFA_REQUIRED');
      expect(json.requiresMfa).toBe(true);
      expect(json.mfa).toEqual({
        challengeId: 'mfa_1',
        expiresAt: '2026-06-11T20:00:00.000Z',
        method: 'totp',
      });
      expect(authTotpMfaMock.createWebLoginMfaChallenge).toHaveBeenCalledWith({
        userId: 'user_1',
        sessionVersion: 3,
        metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      });
      expect(prismaMock.authUser.update).not.toHaveBeenCalled();
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('requires MFA even when clientType is omitted', async () => {
      authTotpMfaMock.createWebLoginMfaChallenge.mockResolvedValueOnce({
        code: 'MFA_REQUIRED',
        mfa: {
          challengeId: 'mfa_omitted_client',
          expiresAt: '2026-06-11T20:00:00.000Z',
          method: 'totp',
        },
      });
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
      });

      const res = await LOGIN_POST(buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      }));
      const json = await res.json();

      expect(json.code).toBe('MFA_REQUIRED');
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('skips MFA for website login when local MFA bypass is enabled', async () => {
      authTotpMfaMock.isLocalAuthMfaBypassEnabled.mockReturnValueOnce(true);
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.authUser.update.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        sessionVersion: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
        clientType: 'web',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(authTotpMfaMock.createWebLoginMfaChallenge).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'signed-token');
    });

    it('rejects invalid credentials', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: new Date(),
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

    it('rejects login for unverified users after requesting verification email', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hashed',
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const req = buildJsonRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await LOGIN_POST(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe('EMAIL_NOT_VERIFIED');
      expect(json.requiresEmailVerification).toBe(true);
      expect(json.verificationEmailSent).toBe(true);
      expect(json.user).toBeUndefined();
      expect(json.session).toBeUndefined();
      expect(json.token).toBeUndefined();
      expect(authEmailVerificationMock.sendInitialEmailVerification).toHaveBeenCalledWith({
        userId: 'user_1',
        email: 'test@example.com',
        origin: 'http://localhost',
      });
      expect(authTotpMfaMock.createWebLoginMfaChallenge).not.toHaveBeenCalled();
      expect(prismaMock.authUser.update).not.toHaveBeenCalled();
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
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
      authServerMock.verifySessionToken.mockReturnValue({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        issuedAtSeconds: 1,
      });
      authServerMock.signSessionToken.mockReturnValue('refreshed-token');

      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
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

    it('clears a pre-verification cookie instead of restoring a session', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue('token');
      authServerMock.verifySessionToken.mockReturnValue({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        issuedAtSeconds: 1,
      });
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const req = new NextRequest('http://localhost/api/auth/me');
      const res = await ME_GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toBeNull();
      expect(json.session).toBeNull();
      expect(json.code).toBe('EMAIL_NOT_VERIFIED');
      expect(json.requiresEmailVerification).toBe(true);
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
    });

    it('clears cookies when the session user has been suspended', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue('token');
      authServerMock.verifySessionToken.mockReturnValue({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        issuedAtSeconds: 1,
      });

      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        disabledAt: new Date('2026-04-14T00:00:00.000Z'),
        disabledReason: 'abuse',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest('http://localhost/api/auth/me');
      const res = await ME_GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toBeNull();
      expect(json.code).toBe('ACCOUNT_SUSPENDED');
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
    });
  });

  describe('POST /api/auth/watch/setup', () => {
    it('returns a short-lived watch setup token for the current session', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false, sessionVersion: 2 });

      const res = await WATCH_SETUP_POST(new NextRequest('http://localhost/api/auth/watch/setup', { method: 'POST' }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.setupToken).toBe('watch-setup-token');
      expect(json.expiresInSeconds).toBe(300);
      expect(authServerMock.signWatchSetupToken).toHaveBeenCalledWith({
        userId: 'user_1',
        sessionVersion: 2,
      });
    });
  });

  describe('POST /api/auth/watch/exchange', () => {
    it('exchanges a valid setup token for a watch-scoped session token', async () => {
      authServerMock.signSessionToken.mockReturnValue('watch-session-token');
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });

      const req = buildJsonRequest('http://localhost/api/auth/watch/exchange', {
        setupToken: 'watch-setup-token',
      });

      const res = await WATCH_EXCHANGE_POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user.id).toBe('user_1');
      expect(json.session).toEqual({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        device: 'watch',
      });
      expect(json.token).toBe('watch-session-token');
      expect(authServerMock.verifyWatchSetupToken).toHaveBeenCalledWith('watch-setup-token');
      expect(authServerMock.signSessionToken).toHaveBeenCalledWith({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        device: 'watch',
      });
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'watch-session-token');
    });

    it('rejects an invalid setup token', async () => {
      authServerMock.verifyWatchSetupToken.mockReturnValue(null);

      const req = buildJsonRequest('http://localhost/api/auth/watch/exchange', {
        setupToken: 'bad-token',
      });

      const res = await WATCH_EXCHANGE_POST(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid watch setup token');
      expect(prismaMock.authUser.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a setup token after session version changes', async () => {
      authSessionsMock.isSessionTokenCurrent.mockReturnValue(false);
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        sessionVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildJsonRequest('http://localhost/api/auth/watch/exchange', {
        setupToken: 'watch-setup-token',
      });

      const res = await WATCH_EXCHANGE_POST(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid watch setup token');
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
    });

    it('rejects setup exchange for suspended users', async () => {
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Tester',
        emailVerifiedAt: new Date(),
        disabledAt: new Date('2026-04-14T00:00:00.000Z'),
        disabledReason: 'abuse',
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildJsonRequest('http://localhost/api/auth/watch/exchange', {
        setupToken: 'watch-setup-token',
      });

      const res = await WATCH_EXCHANGE_POST(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe('ACCOUNT_SUSPENDED');
      expect(authServerMock.signSessionToken).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('preserves legacy no-body logout behavior', async () => {
      authServerMock.getTokenFromRequest.mockReturnValue('token');
      authServerMock.verifySessionToken.mockReturnValue({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 0,
        issuedAtSeconds: 1,
      });
      const res = await LOGOUT_POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }));

      expect(res.status).toBe(200);
      expect(authSessionsMock.revokeAuthUserSessions).toHaveBeenCalledWith('user_1');
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
      expect(pushNotificationsMock.unregisterPushDeviceTargetForUser).not.toHaveBeenCalled();
    });

    it('removes an authenticated device target before revoking the session', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0 });
      const calls: string[] = [];
      pushNotificationsMock.unregisterPushDeviceTargetForUser.mockImplementation(async () => {
        calls.push('device-target');
        expect(authSessionsMock.revokeAuthUserSessions).not.toHaveBeenCalled();
        return { count: 1 };
      });
      authSessionsMock.revokeAuthUserSessions.mockImplementation(async () => {
        calls.push('session');
        return 1;
      });

      const res = await LOGOUT_POST(buildJsonRequest('http://localhost/api/auth/logout', {
        deviceTarget: {
          pushToken: 'push_token_1',
          pushTarget: 'user_user_1',
        },
      }));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, deviceTargetRemoved: true });
      expect(pushNotificationsMock.unregisterPushDeviceTargetForUser).toHaveBeenCalledWith({
        userId: 'user_1',
        pushToken: 'push_token_1',
        pushTarget: 'user_user_1',
      });
      expect(authSessionsMock.revokeAuthUserSessions).toHaveBeenCalledWith('user_1');
      expect(calls).toEqual(['device-target', 'session']);
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, '');
    });

    it('does not revoke or clear the session when authenticated device cleanup fails', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0 });
      pushNotificationsMock.unregisterPushDeviceTargetForUser.mockRejectedValue(new Error('database unavailable'));

      const res = await LOGOUT_POST(buildJsonRequest('http://localhost/api/auth/logout', {
        deviceTarget: {
          pushToken: 'push_token_1',
        },
      }));
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.code).toBe('PUSH_TARGET_CLEANUP_FAILED');
      expect(authSessionsMock.revokeAuthUserSessions).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });

    it('requires an authenticated current session for device-target-aware logout', async () => {
      requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

      const res = await LOGOUT_POST(buildJsonRequest('http://localhost/api/auth/logout', {
        deviceTarget: {
          pushToken: 'push_token_1',
        },
      }));
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.code).toBe('PUSH_TARGET_CLEANUP_AUTH_REQUIRED');
      expect(pushNotificationsMock.unregisterPushDeviceTargetForUser).not.toHaveBeenCalled();
      expect(authSessionsMock.revokeAuthUserSessions).not.toHaveBeenCalled();
      expect(authServerMock.setAuthCookie).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/password', () => {
    it('updates password for current user', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0 });
      prismaMock.authUser.findUnique.mockResolvedValue({
        id: 'user_1',
        passwordHash: 'hashed',
        sessionVersion: 0,
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
      expect(json.token).toBe('refreshed-token');
      expect(json.session).toEqual({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 1,
      });
      expect(prismaMock.authUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'new-hash' }),
        }),
      );
      expect(authSessionsMock.revokeAuthUserSessions).toHaveBeenCalledWith('user_1');
      expect(authServerMock.signSessionToken).toHaveBeenCalledWith({
        userId: 'user_1',
        isAdmin: false,
        sessionVersion: 1,
      });
      expect(authServerMock.setAuthCookie).toHaveBeenCalledWith(res, 'refreshed-token');
    });
  });
});
