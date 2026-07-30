/** @jest-environment node */

import { ScrapingDogAffiliateClient } from '../scrapingDogAffiliateClient';
import { ScrapingDogTransport } from '../scrapingDogTransport';

const usefulHtml = `
  <html>
    <head><title>Club events</title><link rel="canonical" href="/events"></head>
    <body><main>
      <h1>Club events</h1>
      <p>Official league, tournament, clinic, and tryout registration information for local athletes.</p>
      <a href="/events/one">Event one</a>
      <a href="/events/two">Event two</a>
    </main></body>
  </html>
`;

describe('ScrapingDogAffiliateClient', () => {
  it('normalizes organic Google results and filters excluded domains', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      search_information: { id: 'search_1' },
      organic_results: [
        { title: 'Club', link: 'https://club.example.test/tryouts', snippet: 'Official tryouts', source: 'Club' },
        { title: 'Blocked', link: 'https://blocked.example.test/list', snippet: 'Ignore this result' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new ScrapingDogAffiliateClient(
      new ScrapingDogTransport('key', fetchImpl),
    );

    const result = await client.searchSources('Portland soccer tryouts', {
      limit: 5,
      location: 'Portland, Oregon',
      excludeDomains: ['blocked.example.test'],
    });

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/google');
    expect(requestedUrl.searchParams.get('location')).toBe('Portland, Oregon');
    expect(result).toMatchObject({
      provider: 'SCRAPINGDOG',
      estimatedCredits: 5,
      providerJobId: 'search_1',
      rows: [{
        url: 'https://club.example.test/tryouts',
        title: 'Club',
        description: 'Official tryouts',
      }],
    });
  });

  it('keeps a useful static response without paying for JavaScript rendering', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(usefulHtml, { status: 200 }));
    const client = new ScrapingDogAffiliateClient(
      new ScrapingDogTransport('key', fetchImpl),
    );

    const result = await client.captureSourcePage('https://club.example.test/home');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('dynamic')).toBe('false');
    expect(result).toMatchObject({
      renderMode: 'STATIC',
      finalUrl: 'https://club.example.test/events',
      estimatedCredits: 1,
      attempts: [{ accepted: true, renderMode: 'STATIC' }],
    });
  });

  it('retries an empty application shell with JavaScript rendering', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response('<html><body><div id="root"></div></body></html>', { status: 200 }))
      .mockResolvedValueOnce(new Response(usefulHtml, { status: 200 }));
    const client = new ScrapingDogAffiliateClient(
      new ScrapingDogTransport('key', fetchImpl),
    );

    const result = await client.captureSourcePage('https://club.example.test/events');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const dynamicUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(dynamicUrl.searchParams.get('dynamic')).toBe('true');
    expect(result).toMatchObject({
      renderMode: 'JAVASCRIPT',
      estimatedCredits: 6,
      attempts: [
        { accepted: false, renderMode: 'STATIC' },
        { accepted: true, renderMode: 'JAVASCRIPT' },
      ],
    });
  });

  it('returns screenshot bytes without exposing the API key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(
      new Uint8Array([137, 80, 78, 71]),
      { status: 200, headers: { 'content-type': 'image/png' } },
    ));
    const client = new ScrapingDogAffiliateClient(
      new ScrapingDogTransport('key', fetchImpl),
    );

    const result = await client.captureScreenshot('https://club.example.test/events');

    expect(result.data).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(result.mimeType).toBe('image/png');
    expect(JSON.stringify(result.request)).not.toContain('key');
  });
});
