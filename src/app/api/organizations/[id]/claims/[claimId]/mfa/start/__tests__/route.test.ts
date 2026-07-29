/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const applyRateLimitMock = jest.fn();
const getOrganizationClaimMock = jest.fn();
const createOrganizationClaimMfaChallengeMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/server/rateLimit', () => ({
  RATE_LIMIT_POLICIES: {
    authMfaSend: { name: 'auth-mfa:send' },
  },
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock('@/server/organizationClaims/service', () => ({
  getOrganizationClaim: (...args: unknown[]) => getOrganizationClaimMock(...args),
}));

jest.mock('@/server/organizationClaims/http', () => ({
  organizationClaimErrorResponse: (error: Error) => (
    Response.json({ error: error.message }, { status: 500 })
  ),
}));

jest.mock('@/server/authTotpMfa', () => ({
  createOrganizationClaimMfaChallenge: (...args: unknown[]) => (
    createOrganizationClaimMfaChallengeMock(...args)
  ),
  readTotpMfaRequestMetadata: () => ({
    ipHash: 'ip-hash',
    userAgent: 'test-agent',
  }),
}));

import { POST } from '@/app/api/organizations/[id]/claims/[claimId]/mfa/start/route';

describe('POST /api/organizations/[id]/claims/[claimId]/mfa/start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      userId: 'user_1',
      sessionVersion: 7,
      isAdmin: false,
    });
    getOrganizationClaimMock.mockResolvedValue({
      id: 'claim_1',
      organizationId: 'org_1',
      claimantUserId: 'user_1',
    });
    applyRateLimitMock.mockResolvedValue(null);
  });

  it('routes claimants without an authenticator into profile security and back to the claim', async () => {
    createOrganizationClaimMfaChallengeMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/claims/claim_1/mfa/start', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'org_1', claimId: 'claim_1' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Set up an authenticator before accepting organization ownership.',
      code: 'MFA_SETUP_REQUIRED_FOR_ORGANIZATION_CLAIM',
      setupUrl: '/profile?tab=security&mfa=organization-claim&returnTo=%2Forganizations%2Forg_1%2Fclaim%3FclaimId%3Dclaim_1',
    });
  });

  it('returns the purpose-scoped challenge when an authenticator is enabled', async () => {
    createOrganizationClaimMfaChallengeMock.mockResolvedValue({
      challengeId: 'challenge_1',
      provider: 'TOTP',
      expiresAt: '2026-07-29T22:00:00.000Z',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/claims/claim_1/mfa/start', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'org_1', claimId: 'claim_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: 'MFA_REQUIRED_FOR_ORGANIZATION_CLAIM',
      mfa: {
        challengeId: 'challenge_1',
        provider: 'TOTP',
        expiresAt: '2026-07-29T22:00:00.000Z',
      },
    });
    expect(createOrganizationClaimMfaChallengeMock).toHaveBeenCalledWith({
      userId: 'user_1',
      sessionVersion: 7,
      metadata: {
        ipHash: 'ip-hash',
        userAgent: 'test-agent',
      },
    });
  });
});
