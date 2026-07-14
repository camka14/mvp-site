/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const getAffiliateCandidateMock = jest.fn();
const deleteAffiliateCandidateMock = jest.fn();
const reclassifyAffiliateCandidateMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/affiliateImports/service', () => ({
  getAffiliateCandidate: (...args: any[]) => getAffiliateCandidateMock(...args),
  deleteAffiliateCandidate: (...args: any[]) => deleteAffiliateCandidateMock(...args),
  reclassifyAffiliateCandidate: (...args: any[]) => reclassifyAffiliateCandidateMock(...args),
}));

import {
  DELETE as affiliateDiscoveryDelete,
  GET as affiliateDiscoveryGet,
  PATCH as affiliateDiscoveryPatch,
} from '@/app/api/admin/affiliate-discoveries/[id]/route';

const request = (
  url = 'http://localhost/api/admin/affiliate-discoveries/candidate_1',
  init?: RequestInit,
) => (
  new NextRequest(url, init)
);

const routeParams = (id = 'candidate_1') => ({
  params: Promise.resolve({ id }),
});

describe('/api/admin/affiliate-discoveries/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a candidate for allowed admins', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    getAffiliateCandidateMock.mockResolvedValue({
      id: 'candidate_1',
      title: 'Affiliate event',
    });

    const res = await affiliateDiscoveryGet(request(), routeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.candidate.id).toBe('candidate_1');
  });

  it('returns 403 when delete caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const res = await affiliateDiscoveryDelete(request(), routeParams());

    expect(res.status).toBe(403);
    expect(deleteAffiliateCandidateMock).not.toHaveBeenCalled();
  });

  it('deletes a candidate for allowed admins', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    deleteAffiliateCandidateMock.mockResolvedValue({
      id: 'candidate_1',
      title: 'Affiliate event',
    });

    const res = await affiliateDiscoveryDelete(request(), routeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);
    expect(json.candidate.id).toBe('candidate_1');
    expect(deleteAffiliateCandidateMock).toHaveBeenCalledWith('candidate_1');
  });

  it('reclassifies a candidate for allowed admins', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    reclassifyAffiliateCandidateMock.mockResolvedValue({
      candidate: {
        id: 'candidate_1',
        listingKind: 'TEAM',
        publishedTeamId: 'team_1',
      },
      target: {
        id: 'team_1',
        name: 'Affiliate team',
      },
    });

    const res = await affiliateDiscoveryPatch(
      request('http://localhost/api/admin/affiliate-discoveries/candidate_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingKind: 'TEAM' }),
      }),
      routeParams(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.candidate.id).toBe('candidate_1');
    expect(json.candidate.listingKind).toBe('TEAM');
    expect(json.target.id).toBe('team_1');
    expect(reclassifyAffiliateCandidateMock).toHaveBeenCalledWith('candidate_1', 'TEAM');
  });

  it('returns 409 when reclassification cannot convert the scraped data', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    reclassifyAffiliateCandidateMock.mockRejectedValue(
      new Error('Affiliate event candidates must include a valid start date from the source.'),
    );

    const res = await affiliateDiscoveryPatch(
      request('http://localhost/api/admin/affiliate-discoveries/candidate_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingKind: 'EVENT' }),
      }),
      routeParams(),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('Affiliate event candidates must include a valid start date from the source.');
  });

  it('returns 404 when deleting a missing candidate', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
    deleteAffiliateCandidateMock.mockRejectedValue(new Error('Affiliate import candidate not found.'));

    const res = await affiliateDiscoveryDelete(request(), routeParams());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Affiliate import candidate not found.');
  });
});
