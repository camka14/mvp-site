/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const decideOrganizationClaimMock = jest.fn();

const prismaMock = {
  organizationClaims: {
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  organizationDomains: {
    findMany: jest.fn(),
  },
  organizationClaimEvidence: {
    findMany: jest.fn(),
  },
  organizationClaimEvents: {
    findMany: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
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

import { GET, PATCH } from '@/app/api/admin/organization-claims/[claimId]/route';

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
    prismaMock.organizationDomains.findMany.mockResolvedValue([]);
    prismaMock.organizationClaimEvidence.findMany.mockResolvedValue([]);
    prismaMock.organizationClaimEvents.findMany.mockResolvedValue([]);
    prismaMock.staffMembers.findMany.mockResolvedValue([]);
  });

  it('returns claimant, current-owner, evidence, and organization context for review', async () => {
    prismaMock.organizationClaims.findUnique.mockResolvedValueOnce({
      id: 'claim_1',
      organizationId: 'org_1',
      claimantUserId: 'claimant_1',
      status: 'PENDING_MANUAL_REVIEW',
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      name: 'River City Sports Club',
      ownerId: 'owner_1',
      website: 'https://rivercitysports.org',
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'CLAIMED',
      claimVerificationLevel: 'AFFILIATION',
    });
    prismaMock.organizationClaimEvidence.findMany.mockResolvedValueOnce([{
      id: 'evidence_1',
      method: 'MANUAL_REVIEW',
      status: 'PENDING',
      expiresAt: null,
      verifiedAt: null,
      lastCheckedAt: null,
      failureReason: null,
      createdAt: new Date('2026-07-29T20:00:00.000Z'),
      updatedAt: new Date('2026-07-29T20:00:00.000Z'),
    }]);
    prismaMock.authUser.findUnique
      .mockResolvedValueOnce({
        id: 'claimant_1',
        name: 'Morgan Reed',
        email: 'morgan@rivercitysports.org',
        emailVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'owner_1',
        name: 'Current Owner',
        email: 'owner@rivercitysports.org',
        emailVerifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      });

    const response = await GET(
      new NextRequest('http://localhost/api/admin/organization-claims/claim_1'),
      { params: Promise.resolve({ claimId: 'claim_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.claimant).toEqual(expect.objectContaining({ id: 'claimant_1' }));
    expect(payload.currentOwner).toEqual(expect.objectContaining({ id: 'owner_1' }));
    expect(payload.evidence[0]).not.toHaveProperty('metadata');
    expect(prismaMock.authUser.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'owner_1' },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
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
