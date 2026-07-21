/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireAdminMock = jest.fn();
const listCampaignsMock = jest.fn();
const createCampaignMock = jest.fn();
const queueRunMock = jest.fn();
const sportsFindManyMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireAdminMock(...args),
}));
jest.mock('@/server/affiliateImports/sourceDiscovery', () => ({
  listAffiliateSourceDiscoveryCampaigns: (...args: any[]) => listCampaignsMock(...args),
  createAffiliateSourceDiscoveryCampaign: (...args: any[]) => createCampaignMock(...args),
  queueAffiliateSourceDiscoveryRun: (...args: any[]) => queueRunMock(...args),
}));
jest.mock('@/lib/prisma', () => ({ prisma: { sports: { findMany: sportsFindManyMock } } }));

import { GET, POST } from '@/app/api/admin/affiliate-source-discovery/route';
import { POST as queueRun } from '@/app/api/admin/affiliate-source-discovery/[id]/runs/route';

const validCampaign = {
  name: 'Portland sports sources',
  region: 'Portland, Oregon',
  location: 'Portland, Oregon',
  sportIds: ['sport_soccer'],
  sourceTypeHints: ['CLUB'],
  status: 'PAUSED',
  autoCreateIntakes: true,
  searchIntervalMinutes: 10080,
  maxQueriesPerRun: 2,
  maxResultsPerQuery: 5,
};

describe('admin affiliate source discovery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAdminMock.mockResolvedValue({ userId: 'admin_1' });
    listCampaignsMock.mockResolvedValue([]);
    sportsFindManyMock.mockResolvedValue([{ id: 'sport_soccer', name: 'Soccer' }]);
  });

  it('requires Razumly admin access', async () => {
    requireAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const response = await GET(new NextRequest('http://localhost/api/admin/affiliate-source-discovery'));
    expect(response.status).toBe(403);
    expect(listCampaignsMock).not.toHaveBeenCalled();
  });

  it('creates only a validated campaign payload', async () => {
    createCampaignMock.mockResolvedValue({ id: 'campaign_1', ...validCampaign });
    const response = await POST(new NextRequest('http://localhost/api/admin/affiliate-source-discovery', {
      method: 'POST',
      body: JSON.stringify(validCampaign),
    }));
    expect(response.status).toBe(201);
    expect(createCampaignMock).toHaveBeenCalledWith(validCampaign, 'admin_1');
  });

  it('rejects a campaign without sports before persistence', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admin/affiliate-source-discovery', {
      method: 'POST',
      body: JSON.stringify({ ...validCampaign, sportIds: [] }),
    }));
    expect(response.status).toBe(400);
    expect(createCampaignMock).not.toHaveBeenCalled();
  });

  it('queues work and returns 202 without running a provider call in the route', async () => {
    queueRunMock.mockResolvedValue({ id: 'run_1', status: 'QUEUED' });
    const response = await queueRun(
      new NextRequest('http://localhost/api/admin/affiliate-source-discovery/campaign_1/runs', { method: 'POST' }),
      { params: Promise.resolve({ id: 'campaign_1' }) },
    );
    expect(response.status).toBe(202);
    expect(queueRunMock).toHaveBeenCalledWith('campaign_1', 'admin_1');
  });
});
