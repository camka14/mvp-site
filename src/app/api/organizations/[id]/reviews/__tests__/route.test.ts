/** @jest-environment node */

import { NextRequest } from 'next/server';

const getOptionalSessionMock = jest.fn();
const requireSessionMock = jest.fn();
const getEligibilityMock = jest.fn();
const getPayloadMock = jest.fn();
const upsertReviewMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: unknown[]) => getOptionalSessionMock(...args),
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/server/organizationReviews', () => ({
  getOrganizationReviewEligibility: (...args: unknown[]) => getEligibilityMock(...args),
  getOrganizationReviewsPayload: (...args: unknown[]) => getPayloadMock(...args),
  InvalidOrganizationReviewCursorError: class InvalidOrganizationReviewCursorError extends Error {},
  upsertOrganizationReview: (...args: unknown[]) => upsertReviewMock(...args),
}));

import { GET, POST } from '@/app/api/organizations/[id]/reviews/route';

const emptyPayload = {
  summary: { averageRating: null, reviewCount: 0, ratingCounts: [0, 0, 0, 0, 0] },
  reviews: [],
  nextCursor: null,
  viewerReview: null,
  viewerIsAuthenticated: false,
  canReview: false,
  cannotReviewReason: 'Sign in to write a review.',
};

describe('/api/organizations/[id]/reviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockResolvedValue(null);
    getPayloadMock.mockResolvedValue(emptyPayload);
    getEligibilityMock.mockResolvedValue({ organizationExists: true, canReview: true, cannotReviewReason: null });
  });

  it('preserves the legacy 50-review page size when no pagination query is provided', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/reviews'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptyPayload);
    expect(getPayloadMock).toHaveBeenCalledWith('org_1', null, { limit: 50, cursor: undefined });
  });

  it('passes validated cursor pagination to the canonical loader', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/reviews?limit=35&cursor=cursor_123'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect(getPayloadMock).toHaveBeenCalledWith('org_1', null, { limit: 35, cursor: 'cursor_123' });
  });

  it('rejects invalid page sizes before loading reviews', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/reviews?limit=101'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid review pagination.' });
    expect(getPayloadMock).not.toHaveBeenCalled();
  });

  it('rejects ratings outside the 1 to 5 range', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 6, body: 'Too high' }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(400);
    expect(upsertReviewMock).not.toHaveBeenCalled();
  });

  it('rejects owner and staff self-reviews with the eligibility reason', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    getEligibilityMock.mockResolvedValue({
      organizationExists: true,
      canReview: false,
      cannotReviewReason: 'Organization owners cannot review their own organization.',
    });
    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 5 }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Organization owners cannot review their own organization.' });
    expect(upsertReviewMock).not.toHaveBeenCalled();
  });

  it('upserts one review and returns the refreshed payload', async () => {
    const session = { userId: 'user_1', isAdmin: false };
    requireSessionMock.mockResolvedValue(session);
    const refreshedPayload = { ...emptyPayload, viewerIsAuthenticated: true, canReview: true };
    getPayloadMock.mockResolvedValue(refreshedPayload);

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 4, body: ' Organized and welcoming. ' }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect(upsertReviewMock).toHaveBeenCalledWith('org_1', 'user_1', {
      rating: 4,
      body: 'Organized and welcoming.',
    });
    expect(getPayloadMock).toHaveBeenCalledWith('org_1', session);
  });
});
