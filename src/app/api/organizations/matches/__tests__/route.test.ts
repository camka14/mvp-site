/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const findOrganizationMatchesMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/server/organizationMatch', () => ({
  findOrganizationMatches: (...args: unknown[]) => findOrganizationMatchesMock(...args),
  isOrganizationMatchError: () => false,
}));

import { POST } from '@/app/api/organizations/matches/route';

describe('POST /api/organizations/matches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    findOrganizationMatchesMock.mockResolvedValue({
      matches: [],
      matchToken: 'signed-match-token',
      expiresInSeconds: 600,
      acknowledgedMatchIds: [],
      canContinue: true,
    });
  });

  it('requires an authenticated session', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    await expect(POST(new NextRequest('http://localhost/api/organizations/matches', {
      method: 'POST',
      body: JSON.stringify({ name: 'River City Sports Club' }),
      headers: { 'content-type': 'application/json' },
    }))).rejects.toMatchObject({ status: 401 });
    expect(findOrganizationMatchesMock).not.toHaveBeenCalled();
  });

  it('returns privacy-safe matches and a signed decision token', async () => {
    findOrganizationMatchesMock.mockResolvedValue({
      matches: [{
        organizationId: 'org_existing',
        name: 'River City Sports Club',
        logoUrl: null,
        approximateLocation: 'Portland, OR',
        profileUrl: '/organizations/org_existing',
        claimUrl: '/organizations/org_existing/claim',
        confidence: 'EXACT',
        reasonCodes: ['EXACT_OFFICIAL_URL'],
        originType: 'AFFILIATE_IMPORTED',
        ownershipStatus: 'UNCLAIMED',
        claimVerificationLevel: 'NONE',
        recommendedAction: 'CLAIM_PROFILE',
        availableActions: ['CLAIM_PROFILE', 'OPEN_PROFILE'],
        submittedWebsiteDomain: 'rivercitysports.com',
        blocksCreation: true,
      }],
      matchToken: 'signed-match-token',
      expiresInSeconds: 600,
      acknowledgedMatchIds: [],
      canContinue: false,
    });

    const response = await POST(new NextRequest('http://localhost/api/organizations/matches', {
      method: 'POST',
      body: JSON.stringify({
        name: 'River City Sports Club',
        website: 'https://rivercitysports.com',
        location: 'Portland, OR',
        coordinates: { lat: 45.52, lng: -122.67 },
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findOrganizationMatchesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'River City Sports Club',
        website: 'https://rivercitysports.com',
      }),
      { userId: 'user_1', isAdmin: false },
    );
    expect(payload).toEqual(expect.objectContaining({
      matchToken: 'signed-match-token',
      canContinue: false,
      matches: [expect.objectContaining({
        organizationId: 'org_existing',
        recommendedAction: 'CLAIM_PROFILE',
      })],
    }));
    expect(JSON.stringify(payload)).not.toContain('ownerId');
    expect(JSON.stringify(payload)).not.toContain('staff');
  });

  it('rejects unknown fields instead of accepting hidden match overrides', async () => {
    const response = await POST(new NextRequest('http://localhost/api/organizations/matches', {
      method: 'POST',
      body: JSON.stringify({
        name: 'River City Sports Club',
        includeInternalOwner: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(400);
    expect(findOrganizationMatchesMock).not.toHaveBeenCalled();
  });
});
