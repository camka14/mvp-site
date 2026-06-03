/** @jest-environment node */

import {
  buildRateLimitResponse,
  checkRateLimit,
  clearRateLimitMemoryForTests,
} from '@/server/rateLimit';

describe('server rate limiter', () => {
  const originalRedisDisabled = process.env.REDIS_DISABLED;

  beforeEach(() => {
    process.env.REDIS_DISABLED = 'true';
    clearRateLimitMemoryForTests();
  });

  afterEach(() => {
    clearRateLimitMemoryForTests();
    if (originalRedisDisabled === undefined) {
      delete process.env.REDIS_DISABLED;
    } else {
      process.env.REDIS_DISABLED = originalRedisDisabled;
    }
  });

  it('allows requests until the fixed-window limit is exceeded', async () => {
    const nowMs = Date.parse('2026-06-03T20:00:00.000Z');
    const first = await checkRateLimit({
      name: 'test:fixed-window',
      identity: 'ip:203.0.113.1',
      limit: 2,
      windowSeconds: 60,
      nowMs,
    });
    const second = await checkRateLimit({
      name: 'test:fixed-window',
      identity: 'ip:203.0.113.1',
      limit: 2,
      windowSeconds: 60,
      nowMs,
    });
    const third = await checkRateLimit({
      name: 'test:fixed-window',
      identity: 'ip:203.0.113.1',
      limit: 2,
      windowSeconds: 60,
      nowMs,
    });

    expect(first).toMatchObject({
      allowed: true,
      backend: 'memory',
      count: 1,
      remaining: 1,
    });
    expect(second).toMatchObject({
      allowed: true,
      count: 2,
      remaining: 0,
    });
    expect(third).toMatchObject({
      allowed: false,
      count: 3,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  it('resets counts in the next fixed window', async () => {
    const firstWindowMs = Date.parse('2026-06-03T20:00:59.000Z');
    const secondWindowMs = Date.parse('2026-06-03T20:01:00.000Z');

    await checkRateLimit({
      name: 'test:reset',
      identity: 'ip:203.0.113.2',
      limit: 1,
      windowSeconds: 60,
      nowMs: firstWindowMs,
    });
    const blocked = await checkRateLimit({
      name: 'test:reset',
      identity: 'ip:203.0.113.2',
      limit: 1,
      windowSeconds: 60,
      nowMs: firstWindowMs,
    });
    const reset = await checkRateLimit({
      name: 'test:reset',
      identity: 'ip:203.0.113.2',
      limit: 1,
      windowSeconds: 60,
      nowMs: secondWindowMs,
    });

    expect(blocked.allowed).toBe(false);
    expect(reset).toMatchObject({
      allowed: true,
      count: 1,
      remaining: 0,
    });
  });

  it('builds a standard 429 response with rate limit headers', async () => {
    const result = await checkRateLimit({
      name: 'test:response',
      identity: 'ip:203.0.113.3',
      limit: 0,
      windowSeconds: 60,
      nowMs: Date.parse('2026-06-03T20:00:00.000Z'),
    });
    const response = buildRateLimitResponse(result, 'Slow down.');
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: 'Slow down.' });
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('2026-06-03T20:01:00.000Z');
  });
});

