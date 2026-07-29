/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const decideOrganizationClaimMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/organizationClaims/service', () => {
  class OrganizationClaimError extends Error {
    code: string;
    status: number;

    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    OrganizationClaimError,
    isOrganizationClaimError: (error: unknown) => error instanceof OrganizationClaimError,
    decideOrganizationClaim: (...args: unknown[]) => decideOrganizationClaimMock(...args),
  };
});

import { PATCH } from '@/app/api/admin/organization-claims/[claimId]/route';

describe('PATCH /api/admin/organization-claims/[claimId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({
      userId: 'admin_1',
      adminEmail: 'samuel.r@razumly.com',
    });
    decideOrganizationClaimMock.mockResolvedValue({
      id: 'claim_1',
      status: 'APPROVED_PENDING_ACCEPTANCE',
    });
  });

  it('records a Razumly administrator decision', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization-claims/claim_1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE',
          verificationLevel: 'MANUAL_REVIEW',
          userDecisionMessage: 'Public evidence confirms your role.',
        }),
      }),
      { params: Promise.resolve({ claimId: 'claim_1' }) },
    );

    expect(response.status).toBe(200);
    expect(decideOrganizationClaimMock).toHaveBeenCalledWith(
      {
        claimId: 'claim_1',
        action: 'APPROVE',
        verificationLevel: 'MANUAL_REVIEW',
        userDecisionMessage: 'Public evidence confirms your role.',
      },
      {
        userId: 'admin_1',
        adminEmail: 'samuel.r@razumly.com',
      },
    );
  });

  it('returns 403 when the account is not a verified Razumly administrator', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization-claims/claim_1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'REJECT',
          userDecisionMessage: 'Unable to verify this request.',
        }),
      }),
      { params: Promise.resolve({ claimId: 'claim_1' }) },
    );

    expect(response.status).toBe(403);
    expect(decideOrganizationClaimMock).not.toHaveBeenCalled();
  });
});
