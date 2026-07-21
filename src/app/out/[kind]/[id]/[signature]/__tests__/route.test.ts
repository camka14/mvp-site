/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: { findFirst: jest.fn() },
  canonicalTeams: { findFirst: jest.fn() },
  facilities: { findFirst: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST } from '@/app/out/[kind]/[id]/[signature]/route';
import { buildAffiliateOutboundPath } from '@/server/affiliateOutbound';
import { clearRateLimitMemoryForTests } from '@/server/rateLimit';

const BROWSER_USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const routeContext = (pathname: string) => {
  const [, , kind, id, signature] = pathname.split('/');
  return { params: Promise.resolve({ kind, id, signature }) };
};

describe('affiliate outbound route', () => {
  const originalEnv = {
    AFFILIATE_REDIRECT_SECRET: process.env.AFFILIATE_REDIRECT_SECRET,
    ENABLE_RATE_LIMITS_IN_TEST: process.env.ENABLE_RATE_LIMITS_IN_TEST,
    PUBLIC_WEB_BASE_URL: process.env.PUBLIC_WEB_BASE_URL,
    REDIS_DISABLED: process.env.REDIS_DISABLED,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearRateLimitMemoryForTests();
    process.env.AFFILIATE_REDIRECT_SECRET = 'affiliate-outbound-route-test-secret';
    process.env.PUBLIC_WEB_BASE_URL = 'https://bracket-iq.com';
    process.env.REDIS_DISABLED = 'true';
    delete process.env.ENABLE_RATE_LIMITS_IN_TEST;
    prismaMock.events.findFirst.mockResolvedValue({ affiliateUrl: 'https://partner.example.com/register?campaign=summer' });
  });

  afterEach(() => clearRateLimitMemoryForTests());

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('keeps the destination out of the interstitial and redirects only after a valid same-origin POST', async () => {
    const pathname = buildAffiliateOutboundPath('event', 'event_1');
    const url = `https://bracket-iq.com${pathname}`;
    const getResponse = await GET(new NextRequest(url, {
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        'x-forwarded-for': '203.0.113.10',
      },
    }), routeContext(pathname));
    const html = await getResponse.text();
    const proof = html.match(/name="proof" value="([^"]+)"/)?.[1];
    const cookie = getResponse.headers.get('set-cookie')?.split(';')[0];

    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(getResponse.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(html).toContain("Opening the organizer's website");
    expect(html).not.toContain('partner.example.com');
    expect(proof).toBeTruthy();
    expect(cookie).toMatch(/^biq_outbound_session=/);

    const postResponse = await POST(new NextRequest(`http://app:8080${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookie!,
        origin: 'https://bracket-iq.com',
        'sec-fetch-site': 'same-origin',
        'user-agent': BROWSER_USER_AGENT,
        'x-forwarded-host': 'bracket-iq.com',
        'x-forwarded-for': '203.0.113.10',
        'x-forwarded-proto': 'https',
      },
      body: new URLSearchParams({ proof: proof! }),
    }), routeContext(pathname));

    expect(postResponse.status).toBe(303);
    expect(postResponse.headers.get('location')).toBe('https://partner.example.com/register?campaign=summer');
    expect(postResponse.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('returns 404 for a forged signed path without querying a destination', async () => {
    const pathname = `${buildAffiliateOutboundPath('event', 'event_1').slice(0, -1)}x`;
    const response = await GET(new NextRequest(`https://bracket-iq.com${pathname}`, {
      headers: { 'user-agent': BROWSER_USER_AGENT },
    }), routeContext(pathname));

    expect(response.status).toBe(404);
    expect(prismaMock.events.findFirst).not.toHaveBeenCalled();
  });

  it('blocks known crawler user agents before resolving the destination', async () => {
    const pathname = buildAffiliateOutboundPath('event', 'event_1');
    const response = await GET(new NextRequest(`https://bracket-iq.com${pathname}`, {
      headers: { 'user-agent': 'Mozilla/5.0 compatible; GPTBot/1.2' },
    }), routeContext(pathname));

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('partner.example.com');
    expect(prismaMock.events.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a POST without same-origin browser context or a browser proof', async () => {
    const pathname = buildAffiliateOutboundPath('event', 'event_1');
    const response = await POST(new NextRequest(`https://bracket-iq.com${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://scraper.example',
        'sec-fetch-site': 'cross-site',
        'user-agent': BROWSER_USER_AGENT,
      },
      body: new URLSearchParams({ proof: 'forged' }),
    }), routeContext(pathname));

    expect(response.status).toBe(403);
    expect(prismaMock.events.findFirst).not.toHaveBeenCalled();
  });

  it('rate limits repeated views of the same target', async () => {
    process.env.ENABLE_RATE_LIMITS_IN_TEST = 'true';
    const pathname = buildAffiliateOutboundPath('event', 'event_1');
    const request = () => new NextRequest(`https://bracket-iq.com${pathname}`, {
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        'x-forwarded-for': '203.0.113.20',
      },
    });

    for (let index = 0; index < 8; index += 1) {
      expect((await GET(request(), routeContext(pathname))).status).toBe(200);
    }
    const blocked = await GET(request(), routeContext(pathname));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(await blocked.text()).not.toContain('partner.example.com');
  });
});
