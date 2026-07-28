/** @jest-environment node */

import { discoverAffiliateSourcePages } from '../sourcePageDiscovery';

const response = (url: string, body: string, statusCode = 200) => ({
  url,
  finalUrl: url,
  statusCode,
  contentType: 'application/xml',
  headers: {},
  body: Buffer.from(body),
});

describe('affiliate source page discovery', () => {
  it('reads a robots sitemap and combines safe same-origin captured links', async () => {
    const fetchResource = jest.fn().mockResolvedValue(response(
      'https://club.example.test/custom-sitemap.xml',
      `<?xml version="1.0"?>
       <urlset>
         <url><loc>https://club.example.test/events?utm_source=test</loc></url>
         <url><loc>https://club.example.test/tryouts</loc></url>
         <url><loc>https://outside.example.test/ignore</loc></url>
       </urlset>`,
    ));

    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/',
      robotsText: 'User-agent: *\nSitemap: https://club.example.test/custom-sitemap.xml',
      capturedLinks: [
        'https://club.example.test/events',
        'https://club.example.test/rentals',
        'https://outside.example.test/page',
      ],
      fetchResource,
    });

    expect(fetchResource).toHaveBeenCalledWith(
      'https://club.example.test/custom-sitemap.xml',
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024 }),
    );
    expect(result.links.map((link) => link.url)).toEqual([
      'https://club.example.test/events',
      'https://club.example.test/rentals',
      'https://club.example.test/tryouts',
    ]);
  });

  it('follows a bounded same-origin sitemap index', async () => {
    const fetchResource = jest.fn(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) {
        return response(url, `
          <sitemapindex>
            <sitemap><loc>https://club.example.test/events.xml</loc></sitemap>
          </sitemapindex>
        `);
      }
      return response(url, `
        <urlset>
          <url><loc>https://club.example.test/events/one</loc></url>
        </urlset>
      `);
    });

    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/',
      robotsText: '',
      capturedLinks: [],
      fetchResource,
    });

    expect(fetchResource).toHaveBeenCalledTimes(2);
    expect(result.links).toEqual([{
      url: 'https://club.example.test/events/one',
      discoveryMethod: 'SITEMAP_INDEX',
    }]);
  });

  it('keeps captured links when sitemap retrieval fails', async () => {
    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/',
      robotsText: '',
      capturedLinks: ['https://club.example.test/programs'],
      fetchResource: jest.fn().mockRejectedValue(new Error('not found')),
    });

    expect(result.links.map((link) => link.url)).toEqual([
      'https://club.example.test/programs',
    ]);
    expect(result.warnings[0]).toContain('not found');
  });

  it('filters commerce noise and ranks relevant captured and sitemap pages', async () => {
    const fetchResource = jest.fn().mockResolvedValue(response(
      'https://club.example.test/sitemap.xml',
      `<?xml version="1.0"?>
       <urlset>
         <url><loc>https://club.example.test/products/team-shirt</loc></url>
         <url><loc>https://club.example.test/pages/test</loc></url>
         <url><loc>https://club.example.test/about</loc></url>
         <url><loc>https://club.example.test/tryouts/2026</loc></url>
         <url><loc>https://club.example.test/leagues/fall</loc></url>
       </urlset>`,
    ));

    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/',
      robotsText: '',
      capturedLinks: [
        'https://club.example.test/rentals/fields',
        'https://club.example.test/products/football',
      ],
      fetchResource,
      limit: 3,
    });

    expect(result.links.map((link) => link.url)).toEqual([
      'https://club.example.test/rentals/fields',
      'https://club.example.test/tryouts/2026',
      'https://club.example.test/leagues/fall',
    ]);
    expect(result.response).toEqual(expect.objectContaining({
      filteredCandidateCount: 3,
    }));
  });

  it('withholds unrelated regional sitemap pages for a location-specific source', async () => {
    const fetchResource = jest.fn().mockResolvedValue(response(
      'https://club.example.test/sitemap.xml',
      `<?xml version="1.0"?>
       <urlset>
         <url><loc>https://club.example.test/locations/portland</loc></url>
         <url><loc>https://club.example.test/locations/portland/tryouts</loc></url>
         <url><loc>https://club.example.test/locations/seattle/registration</loc></url>
         <url><loc>https://club.example.test/locations/boise/leagues</loc></url>
       </urlset>`,
    ));

    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/locations/portland',
      robotsText: '',
      capturedLinks: ['https://club.example.test/league-finder'],
      fetchResource,
    });

    expect(result.request).toEqual(expect.objectContaining({
      contextTokens: ['portland'],
    }));
    expect(result.links.map((link) => link.url)).toEqual([
      'https://club.example.test/league-finder',
      'https://club.example.test/locations/portland/tryouts',
    ]);
  });

  it('does not treat generic place modifiers as location context', async () => {
    const fetchResource = jest.fn().mockResolvedValue(response(
      'https://club.example.test/sitemap.xml',
      `<?xml version="1.0"?>
       <urlset>
         <url><loc>https://club.example.test/locations/new-york</loc></url>
         <url><loc>https://club.example.test/locations/new-york/registration</loc></url>
         <url><loc>https://club.example.test/locations/new-jersey/registration</loc></url>
         <url><loc>https://club.example.test/locations/new-mexico/leagues</loc></url>
       </urlset>`,
    ));

    const result = await discoverAffiliateSourcePages({
      sourceUrl: 'https://club.example.test/locations/new-york',
      robotsText: '',
      capturedLinks: [],
      fetchResource,
    });

    expect(result.request).toEqual(expect.objectContaining({
      contextTokens: ['york'],
    }));
    expect(result.links.map((link) => link.url)).toEqual([
      'https://club.example.test/locations/new-york/registration',
    ]);
  });
});
