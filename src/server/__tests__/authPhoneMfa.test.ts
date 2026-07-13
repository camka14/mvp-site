/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { AuthMfaChallengePurpose } from '@/server/authMfaPurpose';
import {
  confirmPhoneMfaChallenge,
  createWebLoginMfaChallenge,
  maskPhoneNumber,
  normalizePhoneNumberToE164,
} from '@/server/authPhoneMfa';

describe('authPhoneMfa', () => {
  const originalEnv = process.env;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AUTH_SECRET: 'test-secret',
      MFA_SMS_DEV_MODE: 'true',
      MFA_SMS_DEV_CODE: '123456',
      NODE_ENV: 'test',
    };
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('normalizes and masks US phone numbers', () => {
    expect(normalizePhoneNumberToE164('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhoneNumberToE164('1-555-123-4567')).toBe('+15551234567');
    expect(maskPhoneNumber('+15551234567')).toBe('(***) ***-4567');
    expect(() => normalizePhoneNumberToE164('555')).toThrow('Enter a valid phone number.');
  });

  it('creates and confirms a dev-mode login challenge for a verified phone', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    let savedDevCodeHash: string | null = null;
    const client = {
      sensitiveUserData: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sensitive_1',
          userId: 'user_1',
          email: 'test@example.com',
          phoneNumberE164: '+15551234567',
          phoneVerifiedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({ id: 'sensitive_1' }),
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
        create: jest.fn().mockResolvedValue({
          id: 'mfa_1',
          userId: 'user_1',
          purpose: AuthMfaChallengePurpose.LOGIN,
          phoneNumberE164: '+15551234567',
          provider: 'dev',
          expiresAt,
          sessionVersion: 2,
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          if (data.devCodeHash) {
            savedDevCodeHash = data.devCodeHash;
          }
          if (data.consumedAt) {
            return {
              id: 'mfa_1',
              userId: 'user_1',
              purpose: AuthMfaChallengePurpose.LOGIN,
              phoneNumberE164: '+15551234567',
              provider: 'dev',
              devCodeHash: savedDevCodeHash,
              expiresAt,
              consumedAt: data.consumedAt,
              attemptCount: 1,
              sessionVersion: 2,
            };
          }
          return { id: 'mfa_1' };
        }),
        findUnique: jest.fn().mockImplementation(async () => ({
          id: 'mfa_1',
          userId: 'user_1',
          purpose: AuthMfaChallengePurpose.LOGIN,
          phoneNumberE164: '+15551234567',
          provider: 'dev',
          devCodeHash: savedDevCodeHash,
          expiresAt,
          consumedAt: null,
          attemptCount: 0,
          sessionVersion: 2,
        })),
      },
    };

    const challenge = await createWebLoginMfaChallenge({
      userId: 'user_1',
      sessionVersion: 2,
      metadata: { ipHash: 'ip_hash', userAgent: 'jest' },
      client,
    });

    expect(challenge.code).toBe('MFA_REQUIRED');
    expect(challenge.mfa.maskedPhoneNumber).toBe('(***) ***-4567');
    expect(savedDevCodeHash).toEqual(expect.any(String));
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[mfa] development verification code',
      expect.objectContaining({ code: '123456' }),
    );

    const confirmed = await confirmPhoneMfaChallenge({
      challengeId: 'mfa_1',
      code: '123456',
      purpose: AuthMfaChallengePurpose.LOGIN,
      client,
    });

    expect(confirmed).toEqual({
      userId: 'user_1',
      phoneNumberE164: '+15551234567',
      provider: 'dev',
      sessionVersion: 2,
    });
    expect(client.sensitiveUserData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ financialMfaSatisfiedAt: expect.any(Date) }),
      }),
    );
  });
});
