/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const publishAffiliateCandidateMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/affiliateImports/service', () => ({
  publishAffiliateCandidate: (...args: any[]) => publishAffiliateCandidateMock(...args),
}));

import { POST as affiliateDiscoveryPublish } from '@/app/api/admin/affiliate-discoveries/[id]/publish/route';

const request = (
  url = 'http://localhost/api/admin/affiliate-discoveries/candidate_1/publish',
  init?: RequestInit,
) => (
  new NextRequest(url, init)
);

const routeParams = (id = 'candidate_1') => ({
  params: Promise.resolve({ id }),
});

describe('/api/admin/affiliate-discoveries/[id]/publish', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes a candidate for allowed admins', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    publishAffiliateCandidateMock.mockResolvedValue({
      id: 'event_1',
      name: 'Affiliate event',
    });

    const res = await affiliateDiscoveryPublish(request(), routeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.published.id).toBe('event_1');
    expect(json.published).not.toHaveProperty('$id');
    expect(publishAffiliateCandidateMock).toHaveBeenCalledWith('candidate_1', { publishedByUserId: 'admin_1' });
  });

  it('returns 409 for past affiliate event candidates', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    publishAffiliateCandidateMock.mockRejectedValue(
      new Error('Affiliate event candidates must start in the future.'),
    );

    const res = await affiliateDiscoveryPublish(request(), routeParams());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('Affiliate event candidates must start in the future.');
  });
});
