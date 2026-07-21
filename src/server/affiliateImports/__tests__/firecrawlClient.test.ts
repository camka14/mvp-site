/** @jest-environment node */

const searchMock = jest.fn();
const firecrawlConstructorMock = jest.fn().mockImplementation(() => ({
  search: searchMock,
  map: jest.fn(),
  scrape: jest.fn(),
}));

jest.mock('@mendable/firecrawl-js', () => ({
  __esModule: true,
  default: firecrawlConstructorMock,
}));

import { FirecrawlAffiliateClient } from '@/server/affiliateImports/firecrawlClient';

describe('FirecrawlAffiliateClient source search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchMock.mockResolvedValue({
      id: 'search_1',
      web: [{ url: 'https://club.example.test/tryouts', title: 'Club tryouts', description: 'Official registration' }],
    });
  });

  it('uses bounded web-only search without scraping result pages', async () => {
    const client = new FirecrawlAffiliateClient('test-api-key');
    const result = await client.searchSources('Portland soccer tryouts', {
      limit: 100,
      location: 'Portland, Oregon',
      includeDomains: ['Example.test', 'example.test'],
    });

    expect(searchMock).toHaveBeenCalledWith('Portland soccer tryouts', expect.objectContaining({
      sources: ['web'],
      limit: 20,
      location: 'Portland, Oregon',
      includeDomains: ['example.test'],
      timeout: 60_000,
    }));
    expect(searchMock.mock.calls[0][1]).not.toHaveProperty('integration');
    expect(searchMock.mock.calls[0][1]).not.toHaveProperty('scrapeOptions');
    expect(result).toMatchObject({
      providerJobId: 'search_1',
      rows: [{ url: 'https://club.example.test/tryouts', title: 'Club tryouts' }],
    });
  });

  it('rejects an empty search query before calling Firecrawl', async () => {
    const client = new FirecrawlAffiliateClient('test-api-key');
    await expect(client.searchSources('   ')).rejects.toThrow('query is required');
    expect(searchMock).not.toHaveBeenCalled();
  });
});
