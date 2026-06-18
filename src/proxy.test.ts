/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const requestFor = (
  url: string,
  host: string,
  options?: { method?: string; headers?: Record<string, string> },
) =>
  new NextRequest(url, {
    method: options?.method,
    headers: {
      host,
      ...options?.headers,
    },
  });

const unsupportedMethodRequestFor = (url: string, host: string, method: string) => ({
  method,
  headers: new Headers({ host }),
  nextUrl: new URL(url),
}) as unknown as NextRequest;

describe('proxy', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('redirects www requests to the canonical apex host', () => {
    const response = proxy(requestFor('http://localhost:3000/guides?topic=events', 'www.bracket-iq.com'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bracket-iq.com/guides?topic=events');
  });

  it('redirects www requests even when the host header includes a port', () => {
    const response = proxy(requestFor('http://localhost:3000/', 'www.bracket-iq.com:3000'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bracket-iq.com/');
  });

  it('passes through canonical host requests', () => {
    const response = proxy(requestFor('https://bracket-iq.com/guides', 'bracket-iq.com'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('allows widget embed routes to be framed', () => {
    const response = proxy(requestFor('https://bracket-iq.com/embed/scsoccer/events', 'bracket-iq.com'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBeNull();
  });

  it('adds no-store headers to sensitive app surfaces', () => {
    const response = proxy(requestFor('https://bracket-iq.com/organizations/org_1/finance', 'bracket-iq.com'));

    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.headers.get('Expires')).toBe('0');
  });

  it('blocks TRACE and TRACK requests', () => {
    const response = proxy(unsupportedMethodRequestFor(
      'https://bracket-iq.com/api/organizations/org_1/finance',
      'bracket-iq.com',
      'TRACE',
    ));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  });

  it('blocks cross-origin unsafe browser requests', async () => {
    const response = proxy(requestFor('https://bracket-iq.com/api/organizations/org_1/finance', 'bracket-iq.com', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
      },
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Cross-origin request blocked.' });
  });

  it('allows external webhook callbacks through the origin guard', () => {
    const response = proxy(requestFor('https://bracket-iq.com/api/billing/webhook', 'bracket-iq.com', {
      method: 'POST',
      headers: {
        origin: 'https://stripe.com',
      },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects production http requests to https', () => {
    process.env.NODE_ENV = 'production';
    const response = proxy(requestFor('http://bracket-iq.com/profile', 'bracket-iq.com', {
      headers: {
        'x-forwarded-proto': 'http',
      },
    }));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bracket-iq.com/profile');
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
  });

  it('does not force Android emulator bridge requests to https in local production mode', () => {
    process.env.NODE_ENV = 'production';
    const response = proxy(requestFor('http://localhost:3000/api/auth/me', '10.0.2.2:3000', {
      headers: {
        'x-forwarded-proto': 'http',
      },
    }));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
  });
});
