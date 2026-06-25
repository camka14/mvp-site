/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const listAffiliateSourcesMock = jest.fn();
const createAffiliateSourceMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/affiliateImports/service', () => ({
  listAffiliateSources: (...args: any[]) => listAffiliateSourcesMock(...args),
  createAffiliateSource: (...args: any[]) => createAffiliateSourceMock(...args),
}));

import {
  GET as affiliateSourcesGet,
  POST as affiliateSourcesPost,
} from '@/app/api/admin/affiliate-sources/route';

describe('/api/admin/affiliate-sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const res = await affiliateSourcesGet(new NextRequest('http://localhost/api/admin/affiliate-sources'));

    expect(res.status).toBe(403);
    expect(listAffiliateSourcesMock).not.toHaveBeenCalled();
  });

  it('returns configured affiliate sources', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com' });
    listAffiliateSourcesMock.mockResolvedValue([
      { id: 'source_1', name: 'Underdog Portland', sourceKey: 'underdog-portland' },
    ]);

    const res = await affiliateSourcesGet(new NextRequest('http://localhost/api/admin/affiliate-sources'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sources).toHaveLength(1);
    expect(json.sources[0].$id).toBe('source_1');
  });

  it('creates a source with a saved mapping', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com' });
    createAffiliateSourceMock.mockResolvedValue({ id: 'source_1', name: 'Underdog Portland' });

    const res = await affiliateSourcesPost(new NextRequest('http://localhost/api/admin/affiliate-sources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Underdog Portland',
        sourceKey: 'underdog-portland',
        listUrl: 'https://www.underdogportland.com/',
        mapping: {
          kind: 'EVENT',
          listUrl: 'https://www.underdogportland.com/',
          itemSelector: '.event-card',
          fields: {
            title: { selector: '.title', mode: 'text', required: true },
            officialActionUrl: {
              selector: 'a',
              mode: 'attribute',
              attribute: 'href',
              transform: 'absoluteUrl',
              required: true,
            },
          },
        },
      }),
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.source.$id).toBe('source_1');
    expect(createAffiliateSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'underdog-portland' }),
      'admin_1',
    );
  });
});
