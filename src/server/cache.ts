import { getRedisClient, getRedisKeyPrefix } from '@/lib/redis';

export type CacheBackend = 'redis' | 'memory';

export type CacheReadResult<T> =
  | {
    hit: true;
    value: T;
    backend: CacheBackend;
  }
  | {
    hit: false;
    value: null;
    backend: CacheBackend;
  };

export type CacheWriteResult = {
  ok: boolean;
  backend: CacheBackend;
};

export type CacheLoadResult<T> = {
  value: T | null;
  cacheStatus: 'hit' | 'miss' | 'bypass';
  backend: CacheBackend;
};

type MemoryCacheEntry = {
  raw: string;
  expiresAtMs: number;
};

const DEFAULT_MAX_MEMORY_CACHE_ENTRIES = 500;
const memoryCache = new Map<string, MemoryCacheEntry>();

const getMaxMemoryCacheEntries = (): number => {
  const parsed = Number(process.env.MEMORY_CACHE_MAX_ENTRIES);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_MEMORY_CACHE_ENTRIES;
};

const normalizeTtlSeconds = (ttlSeconds: number): number => (
  Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.ceil(ttlSeconds) : 0
);

export const buildCacheKey = (...parts: Array<string | number | boolean | null | undefined>): string => (
  parts
    .map((part) => String(part ?? ''))
    .map((part) => part.trim().replace(/[^a-zA-Z0-9:_./-]+/g, '_'))
    .filter(Boolean)
    .join(':')
);

const toRedisKey = (key: string): string => `${getRedisKeyPrefix()}:cache:${key}`;

const pruneExpiredMemoryCache = (nowMs: number): void => {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      memoryCache.delete(key);
    }
  }
};

const enforceMemoryCacheLimit = (): void => {
  const maxEntries = getMaxMemoryCacheEntries();
  while (memoryCache.size > maxEntries) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    memoryCache.delete(oldestKey);
  }
};

const readMemoryCache = <T>(key: string): CacheReadResult<T> => {
  const nowMs = Date.now();
  const entry = memoryCache.get(key);
  if (!entry || entry.expiresAtMs <= nowMs) {
    if (entry) {
      memoryCache.delete(key);
    }
    return { hit: false, value: null, backend: 'memory' };
  }

  try {
    return {
      hit: true,
      value: JSON.parse(entry.raw) as T,
      backend: 'memory',
    };
  } catch {
    memoryCache.delete(key);
    return { hit: false, value: null, backend: 'memory' };
  }
};

const writeMemoryCache = (key: string, value: unknown, ttlSeconds: number): CacheWriteResult => {
  const ttl = normalizeTtlSeconds(ttlSeconds);
  if (ttl <= 0) {
    return { ok: false, backend: 'memory' };
  }

  pruneExpiredMemoryCache(Date.now());
  memoryCache.set(key, {
    raw: JSON.stringify(value),
    expiresAtMs: Date.now() + ttl * 1000,
  });
  enforceMemoryCacheLimit();
  return { ok: true, backend: 'memory' };
};

export const getJsonCache = async <T>(key: string): Promise<CacheReadResult<T>> => {
  const redis = await getRedisClient();
  if (!redis) {
    return readMemoryCache<T>(key);
  }

  const redisKey = toRedisKey(key);
  try {
    const raw = await redis.get(redisKey);
    if (raw == null) {
      return { hit: false, value: null, backend: 'redis' };
    }

    return {
      hit: true,
      value: JSON.parse(raw) as T,
      backend: 'redis',
    };
  } catch (error) {
    console.error('[cache] Redis read failed', error);
    return readMemoryCache<T>(key);
  }
};

export const setJsonCache = async (
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<CacheWriteResult> => {
  const ttl = normalizeTtlSeconds(ttlSeconds);
  if (ttl <= 0) {
    return { ok: false, backend: 'memory' };
  }

  const redis = await getRedisClient();
  if (!redis) {
    return writeMemoryCache(key, value, ttl);
  }

  const raw = JSON.stringify(value);
  try {
    await redis.set(toRedisKey(key), raw, { EX: ttl });
    return { ok: true, backend: 'redis' };
  } catch (error) {
    console.error('[cache] Redis write failed', error);
    return writeMemoryCache(key, value, ttl);
  }
};

export const getOrSetJsonCache = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T | null>,
): Promise<CacheLoadResult<T>> => {
  const cached = await getJsonCache<T>(key);
  if (cached.hit) {
    return {
      value: cached.value,
      cacheStatus: 'hit',
      backend: cached.backend,
    };
  }

  const value = await loader();
  if (value === null) {
    return {
      value: null,
      cacheStatus: 'bypass',
      backend: cached.backend,
    };
  }

  const write = await setJsonCache(key, value, ttlSeconds);
  return {
    value,
    cacheStatus: write.ok ? 'miss' : 'bypass',
    backend: write.backend,
  };
};

export const clearMemoryCacheForTests = (): void => {
  memoryCache.clear();
};

