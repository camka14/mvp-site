/** @jest-environment node */

import { ScrapingDogTransport } from '../scrapingDogTransport';

describe('ScrapingDogTransport', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('returns redacted request metadata and never exposes the API key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('<h1>Events</h1>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    const transport = new ScrapingDogTransport('secret-key', fetchImpl);

    const result = await transport.requestText({
      endpoint: '/scrape',
      targetUrl: 'https://example.com/events',
      params: {
        url: 'https://example.com/events',
        dynamic: false,
        formats: 'html',
      },
    });

    const calledUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(calledUrl.searchParams.get('api_key')).toBe('secret-key');
    expect(calledUrl.searchParams.get('url')).toBe('https://example.com/events');
    expect(result.request).toEqual({
      provider: 'SCRAPINGDOG',
      endpoint: '/scrape',
      targetUrl: 'https://example.com/events',
      options: { dynamic: false, formats: 'html' },
    });
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('retries one rate-limited response using Retry-After', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '1' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const transport = new ScrapingDogTransport('key', fetchImpl, sleep);

    await expect(transport.requestText({
      endpoint: '/scrape',
      params: { url: 'https://example.com' },
    })).resolves.toEqual(expect.objectContaining({ body: 'ok' }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('retries ScrapingDog transient bad-request responses', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: 'Something went wrong, please try again',
        status: 400,
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ organic_results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    const transport = new ScrapingDogTransport('key', fetchImpl, sleep);

    await expect(transport.requestJson({
      endpoint: '/google',
      params: { query: 'Mesa softball field rentals' },
    })).resolves.toEqual(expect.objectContaining({
      body: { organic_results: [] },
    }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('does not retry ordinary bad-request responses', async () => {
    const sleep = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      message: 'Invalid query',
      status: 400,
    }), { status: 400 }));
    const transport = new ScrapingDogTransport('key', fetchImpl, sleep);

    await expect(transport.requestJson({
      endpoint: '/google',
      params: { query: 'invalid' },
    })).rejects.toThrow('HTTP 400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry authorization failures', async () => {
    const sleep = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue(new Response('not allowed', { status: 403 }));
    const transport = new ScrapingDogTransport('key', fetchImpl, sleep);

    await expect(transport.requestText({
      endpoint: '/scrape',
      params: { url: 'https://example.com' },
    })).rejects.toThrow('HTTP 403');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
