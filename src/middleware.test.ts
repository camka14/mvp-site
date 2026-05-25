/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

const requestFor = (url: string, host: string) =>
  new NextRequest(url, {
    headers: {
      host,
    },
  });

describe('middleware', () => {
  it('redirects www requests to the canonical apex host', () => {
    const response = middleware(requestFor('http://localhost:3000/guides?topic=events', 'www.bracket-iq.com'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bracket-iq.com/guides?topic=events');
  });

  it('redirects www requests even when the host header includes a port', () => {
    const response = middleware(requestFor('http://localhost:3000/', 'www.bracket-iq.com:3000'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bracket-iq.com/');
  });

  it('passes through canonical host requests', () => {
    const response = middleware(requestFor('https://bracket-iq.com/guides', 'bracket-iq.com'));

    expect(response.headers.get('location')).toBeNull();
  });
});
