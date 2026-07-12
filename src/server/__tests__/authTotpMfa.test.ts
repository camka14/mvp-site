/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import { decryptSecret, encryptSecret } from '@/server/integrations/secretCrypto';
import {
  confirmTotpMfaChallenge,
  createAccountDeletionMfaChallenge,
  createTotpCodeForTest,
  createWebLoginMfaChallenge,
  encodeBase32,
  isLocalAuthMfaBypassEnabled,
  startProfileTotpMfaSetup,
  verifyTotpCode,
} from '@/server/authTotpMfa';

describe('authTotpMfa', () => {
  const originalEnv = process.env;
  const systemTime = new Date('2026-06-12T00:30:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: systemTime });
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-secret',
      NODE_ENV: 'test',
    };
    delete process.env.AUTH_MFA_DISABLED_LOCAL;
    delete process.env.AUTH_MFA_DISABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('verifies TOTP codes and rejects replayed counters', () => {
    const secret = encodeBase32(Buffer.from('12345678901234567890'));
    const code = createTotpCodeForTest(secret, systemTime);
    const valid = verifyTotpCode({ secretBase32: secret, code, now: systemTime });

    expect(valid).toEqual({ valid: true, counter: expect.any(Number) });
    expect(verifyTotpCode({
      secretBase32: secret,
      code,
      now: systemTime,
      minimumCounter: valid.counter,
    })).toEqual({ valid: false });
    expect(verifyTotpCode({ secretBase32: secret, code: '000000', now: systemTime })).toEqual({ valid: false });
  });

  it('does not create a login challenge for a user without an authenticator', async () => {
    const client = {
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(createWebLoginMfaChallenge({
      userId: 'user_1',
      sessionVersion: 2,
      metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      client,
    })).resolves.toBeNull();
  });

  it('creates a purpose-scoped account-deletion challenge without consuming login challenges', async () => {
    const expiresAt = new Date(systemTime.getTime() + 10 * 60 * 1000);
    const client = {
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue({
          totpSecretEncrypted: 'encrypted-secret',
          totpEnabledAt: new Date(systemTime.getTime() - 60_000),
        }),
      },
      authMfaChallenges: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({
          id: 'mfa_delete_1',
          expiresAt,
        }),
      },
    };

    await expect(createAccountDeletionMfaChallenge({
      userId: 'user_1',
      sessionVersion: 2,
      metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      client,
    })).resolves.toEqual({
      challengeId: 'mfa_delete_1',
      expiresAt: expiresAt.toISOString(),
      method: 'totp',
    });

    expect(client.authMfaChallenges.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        purpose: { in: [AuthMfaChallengePurpose.ACCOUNT_DELETION] },
        consumedAt: null,
      },
      data: {
        consumedAt: systemTime,
        updatedAt: systemTime,
      },
    });
    expect(client.authMfaChallenges.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        purpose: AuthMfaChallengePurpose.ACCOUNT_DELETION,
        sessionVersion: 2,
        verificationIpHash: 'ip_hash',
        verificationUserAgent: 'jest',
      }),
    });
  });

  it('requires an explicit non-production configuration for the local MFA bypass', () => {
    const localRequest = {
      headers: {
        get: jest.fn().mockReturnValue('localhost:3000'),
      },
    };

    expect(isLocalAuthMfaBypassEnabled(localRequest)).toBe(false);

    process.env.AUTH_MFA_DISABLED_LOCAL = 'true';
    expect(isLocalAuthMfaBypassEnabled(localRequest)).toBe(true);

    process.env.AUTH_MFA_DISABLED_LOCAL = 'false';
    expect(isLocalAuthMfaBypassEnabled(localRequest)).toBe(false);

    process.env.AUTH_MFA_DISABLED_LOCAL = 'true';
    process.env.NODE_ENV = 'production';
    expect(isLocalAuthMfaBypassEnabled({
      headers: {
        get: jest.fn().mockReturnValue('localhost:3000'),
      },
    })).toBe(false);
  });

  it('returns a controlled MFA error when an authenticator secret cannot be decrypted', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = {
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sensitive_1',
          totpSecretEncrypted: encryptSecret(encodeBase32(Buffer.from('12345678901234567890')), 'old-local-secret'),
          totpLastUsedCounter: null,
        }),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          email: 'test@example.com',
          sessionVersion: 0,
        }),
      },
      authMfaChallenges: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mfa_1',
          userId: 'user_1',
          purpose: AuthMfaChallengePurpose.LOGIN,
          provider: 'totp',
          consumedAt: null,
          expiresAt: new Date(systemTime.getTime() + 10 * 60 * 1000),
          attemptCount: 0,
          sessionVersion: 0,
        }),
        update: jest.fn(),
      },
    };

    await expect(confirmTotpMfaChallenge({
      challengeId: 'mfa_1',
      code: '123456',
      purpose: AuthMfaChallengePurpose.LOGIN,
      client,
    })).rejects.toMatchObject({
      code: 'MFA_SECRET_INVALID',
      status: 400,
    });
    expect(client.authMfaChallenges.update).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('creates and confirms a profile setup challenge for a user without an authenticator', async () => {
    const expiresAt = new Date(systemTime.getTime() + 10 * 60 * 1000);
    let savedChallenge: any = null;
    const client = {
      sensitiveUserData: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user_1' }),
        update: jest.fn(),
      },
      authUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_1',
          email: 'test@example.com',
          sessionVersion: 2,
        }),
      },
      authMfaChallenges: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          savedChallenge = {
            ...data,
            expiresAt,
            consumedAt: null,
            attemptCount: 0,
          };
          return savedChallenge;
        }),
        findUnique: jest.fn().mockImplementation(async () => savedChallenge),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...savedChallenge,
          ...data,
          attemptCount: 1,
          consumedAt: data.consumedAt ?? savedChallenge.consumedAt,
        })),
      },
    };

    const challenge = await startProfileTotpMfaSetup({
      userId: 'user_1',
      sessionVersion: 2,
      metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      client,
    });

    expect(challenge).toEqual({
      challengeId: expect.stringMatching(/^mfa_/),
      expiresAt: expiresAt.toISOString(),
      method: 'totp',
      setupQrUrl: expect.stringContaining('/api/auth/mfa/setup/qr?challengeId='),
    });
    expect(savedChallenge.totpSecretEncrypted).toEqual(expect.any(String));

    const setupSecret = decryptSecret(savedChallenge.totpSecretEncrypted);
    const code = createTotpCodeForTest(setupSecret, systemTime);
    const confirmed = await confirmTotpMfaChallenge({
      challengeId: savedChallenge.id,
      code,
      purpose: AuthMfaChallengePurpose.PROFILE_TOTP_SETUP,
      client,
    });

    expect(confirmed).toEqual({ userId: 'user_1', sessionVersion: 2 });
    expect(client.sensitiveUserData.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'user_1',
        userId: 'user_1',
        email: 'test@example.com',
        totpSecretEncrypted: savedChallenge.totpSecretEncrypted,
        totpEnabledAt: expect.any(Date),
        totpVerifiedAt: expect.any(Date),
        totpLastUsedCounter: expect.any(Number),
        totpProvider: 'totp',
        financialMfaSatisfiedAt: expect.any(Date),
      }),
    });
  });
});
