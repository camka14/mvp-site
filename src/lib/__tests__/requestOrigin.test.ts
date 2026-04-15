/** @jest-environment node */

import { NextRequest } from 'next/server';

import { getRequestOrigin } from '@/lib/requestOrigin';

const ENV_KEYS = ['PUBLIC_WEB_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_WEB_BASE_URL'] as const;

const clearOriginEnv = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

describe('getRequestOrigin', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearOriginEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers the configured public base URL over forwarded headers', () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://app.bracket-iq.com';

    const req = new NextRequest('https://internal.service.local/api/auth/google/start', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'attacker.example.com',
      },
    });

    expect(getRequestOrigin(req)).toBe('https://app.bracket-iq.com');
  });

  it('allows loopback header-derived origins when no canonical origin is configured', () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/auth/google/start', {
      headers: {
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'localhost:3010',
      },
    });

    expect(getRequestOrigin(req)).toBe('http://localhost:3010');
  });

  it('rejects non-local request-derived origins when no canonical origin is configured', () => {
    const req = new NextRequest('https://api.bracket-iq.com/api/auth/google/start', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'attacker.example.com',
      },
    });

    expect(() => getRequestOrigin(req)).toThrow(
      'PUBLIC_WEB_BASE_URL (or NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_WEB_BASE_URL) must be set for non-local request origin resolution.',
    );
  });
});
