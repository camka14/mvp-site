/** @jest-environment node */

import { NextRequest } from 'next/server';

const getOptionalSessionMock = jest.fn();
const applyRateLimitMock = jest.fn();
const confirmOrganizationClaimEmailMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: unknown[]) => getOptionalSessionMock(...args),
}));
jest.mock('@/server/rateLimit', () => ({
  RATE_LIMIT_POLICIES: {
    organizationClaimVerify: { name: 'organization-claim:verify' },
  },
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));
jest.mock('@/server/organizationClaims/service', () => ({
  isOrganizationClaimError: () => false,
  confirmOrganizationClaimEmail: (...args: unknown[]) => confirmOrganizationClaimEmailMock(...args),
}));

import { GET } from '@/app/api/organization-claims/email/confirm/route';

describe('GET /api/organization-claims/email/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyRateLimitMock.mockResolvedValue(null);
    confirmOrganizationClaimEmailMock.mockResolvedValue({
      id: 'claim_1',
      organizationId: 'org_1',
      status: 'APPROVED_PENDING_ACCEPTANCE',
    });
  });

  it('sends signed-out browser users through login and back to the same token', async () => {
    getOptionalSessionMock.mockResolvedValue(null);

    const response = await GET(new NextRequest(
      'https://bracket-iq.com/api/organization-claims/email/confirm?token=secret-token',
      { headers: { accept: 'text/html' } },
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://bracket-iq.com/login?next=%2Fapi%2Forganization-claims%2Femail%2Fconfirm%3Ftoken%3Dsecret-token',
    );
    expect(confirmOrganizationClaimEmailMock).not.toHaveBeenCalled();
  });

  it('redirects a successful browser confirmation to the claim status screen', async () => {
    getOptionalSessionMock.mockResolvedValue({ userId: 'user_1' });

    const response = await GET(new NextRequest(
      'https://bracket-iq.com/api/organization-claims/email/confirm?token=secret-token',
      { headers: { accept: 'text/html' } },
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://bracket-iq.com/organizations/org_1/claim?claimId=claim_1&verification=email_verified',
    );
    expect(confirmOrganizationClaimEmailMock).toHaveBeenCalledWith(
      'secret-token',
      expect.objectContaining({ userId: 'user_1' }),
    );
  });

  it('keeps JSON confirmation available to API clients', async () => {
    getOptionalSessionMock.mockResolvedValue({ userId: 'user_1' });

    const response = await GET(new NextRequest(
      'https://bracket-iq.com/api/organization-claims/email/confirm?token=secret-token',
      { headers: { accept: 'application/json' } },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claim: {
        id: 'claim_1',
        organizationId: 'org_1',
        status: 'APPROVED_PENDING_ACCEPTANCE',
      },
    });
  });
});
