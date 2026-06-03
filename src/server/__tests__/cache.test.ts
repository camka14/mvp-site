/** @jest-environment node */

import {
  buildCacheKey,
  clearMemoryCacheForTests,
  getJsonCache,
  getOrSetJsonCache,
  setJsonCache,
} from '@/server/cache';

describe('server cache helper', () => {
  const originalRedisDisabled = process.env.REDIS_DISABLED;

  beforeEach(() => {
    process.env.REDIS_DISABLED = 'true';
    clearMemoryCacheForTests();
  });

  afterEach(() => {
    clearMemoryCacheForTests();
    if (originalRedisDisabled === undefined) {
      delete process.env.REDIS_DISABLED;
    } else {
      process.env.REDIS_DISABLED = originalRedisDisabled;
    }
    jest.useRealTimers();
  });

  it('builds stable namespaced cache key parts', () => {
    expect(buildCacheKey('public org', 'River City', 12, true)).toBe('public_org:River_City:12:true');
  });

  it('writes and reads JSON values through the memory fallback', async () => {
    const write = await setJsonCache('test:cache-hit', { name: 'River City Sports Club' }, 30);
    expect(write).toEqual({ ok: true, backend: 'memory' });

    const read = await getJsonCache<{ name: string }>('test:cache-hit');
    expect(read).toEqual({
      hit: true,
      value: { name: 'River City Sports Club' },
      backend: 'memory',
    });
  });

  it('expires memory fallback values after their ttl', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-03T20:00:00.000Z'));

    await setJsonCache('test:expires', { ok: true }, 1);
    expect((await getJsonCache('test:expires')).hit).toBe(true);

    jest.setSystemTime(new Date('2026-06-03T20:00:02.000Z'));
    expect(await getJsonCache('test:expires')).toEqual({
      hit: false,
      value: null,
      backend: 'memory',
    });
  });

  it('loads only once when getOrSetJsonCache hits the fallback cache', async () => {
    const loader = jest.fn()
      .mockResolvedValueOnce({ id: 'org_1' })
      .mockResolvedValueOnce({ id: 'org_2' });

    const first = await getOrSetJsonCache('test:get-or-set', 30, loader);
    const second = await getOrSetJsonCache('test:get-or-set', 30, loader);

    expect(first).toEqual({
      value: { id: 'org_1' },
      cacheStatus: 'miss',
      backend: 'memory',
    });
    expect(second).toEqual({
      value: { id: 'org_1' },
      cacheStatus: 'hit',
      backend: 'memory',
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

