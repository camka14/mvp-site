/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const applyRateLimitMock = jest.fn();
const createOrganizationClaimMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/lib/requestOrigin', () => ({
  getRequestOrigin: () => 'https://bracket-iq.com',
}));
jest.mock('@/server/rateLimit', () => ({
  RATE_LIMIT_POLICIES: {
    organizationClaimCreate: { name: 'organization-claim:create' },
  },
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
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
    createOrganizationClaim: (...args: unknown[]) => createOrganizationClaimMock(...args),
  };
});

import { POST } from '@/app/api/organizations/[id]/claims/route';

describe('POST /api/organizations/[id]/claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      userId: 'user_1',
      isAdmin: false,
      sessionVersion: 4,
    });
    applyRateLimitMock.mockResolvedValue(null);
    createOrganizationClaimMock.mockResolvedValue({
      id: 'claim_1',
      status: 'PENDING_MANUAL_REVIEW',
    });
  });

  it('creates a validated ownership dispute and passes the canonical base URL', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: 'OWNERSHIP_DISPUTE',
          method: 'MANUAL_REVIEW',
          roleTitle: 'Club director',
          explanation: 'The listed owner no longer represents the club.',
          issueReason: 'OWNER_UNAVAILABLE',
          requestedOutcome: 'OWNERSHIP_TRANSFER',
          certified: true,
        }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      claim: { id: 'claim_1', status: 'PENDING_MANUAL_REVIEW' },
    });
    expect(createOrganizationClaimMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        requestType: 'OWNERSHIP_DISPUTE',
        method: 'MANUAL_REVIEW',
        baseUrl: 'https://bracket-iq.com',
      }),
      expect.objectContaining({ userId: 'user_1', sessionVersion: 4 }),
    );
  });

  it('rejects legacy ownership and malformed evidence before the service runs', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: 'INITIAL_CLAIM',
          method: 'LEGACY_OWNER',
          publicEvidenceUrl: 'not-a-url',
        }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(400);
    expect(createOrganizationClaimMock).not.toHaveBeenCalled();
  });

  it('returns the shared rate-limit response without creating a claim', async () => {
    const limited = new Response(JSON.stringify({ error: 'Slow down.' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    applyRateLimitMock.mockResolvedValue(limited);

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: 'INITIAL_CLAIM',
          method: 'DOMAIN_EMAIL',
          verificationEmail: 'director@rivercitysports.org',
        }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(429);
    expect(createOrganizationClaimMock).not.toHaveBeenCalled();
  });
});
