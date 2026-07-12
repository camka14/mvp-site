/** @jest-environment node */

import { NextRequest } from 'next/server';

const authUserFindUniqueMock = jest.fn();
const authUserUpdateMock = jest.fn();
const confirmTotpMfaChallengeMock = jest.fn();
const setAuthCookieMock = jest.fn();
const buildAuthSessionPayloadMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    authUser: {
      findUnique: (...args: any[]) => authUserFindUniqueMock(...args),
      update: (...args: any[]) => authUserUpdateMock(...args),
    },
  },
}));
jest.mock('@/lib/authServer', () => ({ setAuthCookie: (...args: any[]) => setAuthCookieMock(...args) }));
jest.mock('@/server/authSessionPayload', () => ({
  buildAuthSessionPayload: (...args: any[]) => buildAuthSessionPayloadMock(...args),
}));
jest.mock('@/server/authTotpMfa', () => ({
  confirmTotpMfaChallenge: (...args: any[]) => confirmTotpMfaChallengeMock(...args),
  confirmTotpMfaChallengeForLocalBypass: jest.fn(),
  isLocalAuthMfaBypassEnabled: () => false,
  isTotpMfaError: () => false,
}));
jest.mock('@/server/rateLimit', () => ({
  applyRateLimit: jest.fn().mockResolvedValue(null),
  RATE_LIMIT_POLICIES: { authMfaVerification: { limit: 10 } },
}));

import { POST as LOGIN_CONFIRM_POST } from '@/app/api/auth/mfa/login/confirm/route';
import { POST as SETUP_CONFIRM_POST } from '@/app/api/auth/mfa/setup/confirm/route';

const request = () => new NextRequest('http://localhost/api/auth/mfa/confirm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ challengeId: 'mfa_1', code: '123456' }),
});

describe('MFA login confirmation email-verification boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    confirmTotpMfaChallengeMock.mockResolvedValue({ userId: 'user_1', sessionVersion: 0 });
    authUserFindUniqueMock.mockResolvedValue({
      id: 'user_1',
      email: 'unverified@example.com',
      emailVerifiedAt: null,
      sessionVersion: 0,
      disabledAt: null,
    });
  });

  it('does not turn an MFA login challenge into a normal session for an unverified account', async () => {
    const response = await LOGIN_CONFIRM_POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual(expect.objectContaining({
      code: 'EMAIL_NOT_VERIFIED',
      email: 'unverified@example.com',
      requiresEmailVerification: true,
    }));
    expect(authUserUpdateMock).not.toHaveBeenCalled();
    expect(buildAuthSessionPayloadMock).not.toHaveBeenCalled();
    expect(setAuthCookieMock).not.toHaveBeenCalled();
  });

  it('does not turn an MFA setup-login challenge into a normal session for an unverified account', async () => {
    const response = await SETUP_CONFIRM_POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(authUserUpdateMock).not.toHaveBeenCalled();
    expect(buildAuthSessionPayloadMock).not.toHaveBeenCalled();
    expect(setAuthCookieMock).not.toHaveBeenCalled();
  });
});
