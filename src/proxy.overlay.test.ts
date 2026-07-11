/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('broadcast overlay proxy surface', () => {
  it.each(['/overlay/overlay_1', '/broadcast-preview'])('marks %s as an isolated overlay surface', (pathname) => {
    const response = proxy(new NextRequest(`https://bracket-iq.com${pathname}`, {
      headers: { host: 'bracket-iq.com' },
    }));

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('x-middleware-request-x-bracketiq-surface')).toBe('overlay');
  });

  it('permits only the private same-origin preview to render inside Studio', () => {
    const preview = proxy(new NextRequest('https://bracket-iq.com/broadcast-preview/overlay_1', {
      headers: { host: 'bracket-iq.com' },
    }));
    const program = proxy(new NextRequest('https://bracket-iq.com/overlay/overlay_1', {
      headers: { host: 'bracket-iq.com' },
    }));

    expect(preview.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(program.headers.get('x-frame-options')).toBe('DENY');
  });

  it('does not mark normal application pages as overlay surfaces', () => {
    const response = proxy(new NextRequest('https://bracket-iq.com/discover', {
      headers: { host: 'bracket-iq.com' },
    }));

    expect(response.headers.get('x-middleware-request-x-bracketiq-surface')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toBeNull();
  });
});
