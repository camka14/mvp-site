import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, getRedisKeyPrefix } from '@/lib/redis';

export type RateLimitBackend = 'redis' | 'memory';

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  message?: string;
};

export type RateLimitOptions = RateLimitPolicy & {
  identity: string;
  nowMs?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  backend: RateLimitBackend;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

type MemoryRateLimitEntry = {
  count: number;
  resetAtMs: number;
};

type NormalizedRateLimitOptions = RateLimitOptions & {
  limit: number;
  windowSeconds: number;
  nowMs: number;
};

const memoryRateLimits = new Map<string, MemoryRateLimitEntry>();

export const RATE_LIMIT_POLICIES = {
  authLogin: {
    name: 'auth:login',
    limit: 20,
    windowSeconds: 60,
    message: 'Too many login attempts. Please wait before trying again.',
  },
  authRegister: {
    name: 'auth:register',
    limit: 10,
    windowSeconds: 10 * 60,
    message: 'Too many signup attempts. Please wait before trying again.',
  },
  authEmailVerification: {
    name: 'auth:email-verification',
    limit: 5,
    windowSeconds: 60 * 60,
    message: 'Too many verification email requests. Please wait before trying again.',
  },
  authMfaSend: {
    name: 'auth:mfa-send',
    limit: 5,
    windowSeconds: 60 * 60,
    message: 'Too many verification code requests. Please wait before trying again.',
  },
  authMfaVerification: {
    name: 'auth:mfa-verification',
    limit: 10,
    windowSeconds: 10 * 60,
    message: 'Too many verification attempts. Please wait before trying again.',
  },
  mobileOAuth: {
    name: 'auth:mobile-oauth',
    limit: 30,
    windowSeconds: 5 * 60,
    message: 'Too many sign-in attempts. Please wait before trying again.',
  },
  contactMatch: {
    name: 'users:contact-match',
    limit: 30,
    windowSeconds: 60,
    message: 'Too many contact lookups. Please wait before trying again.',
  },
  realtimeToken: {
    name: 'realtime:token',
    limit: 120,
    windowSeconds: 60,
    message: 'Too many realtime token requests. Please wait before trying again.',
  },
  chatMessage: {
    name: 'chat:message',
    limit: 60,
    windowSeconds: 60,
    message: 'Too many messages. Please wait before sending another message.',
  },
  chatPushRelay: {
    name: 'chat:push-relay',
    limit: 60,
    windowSeconds: 60,
    message: 'Too many message notifications. Please wait before sending another message.',
  },
} satisfies Record<string, RateLimitPolicy>;

const normalizeLimit = (limit: number): number => (
  Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1
);

const normalizeWindowSeconds = (windowSeconds: number): number => (
  Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.ceil(windowSeconds) : 60
);

const hashIdentityPart = (value: string): string => (
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 32)
);

const normalizeIdentity = (value: string): string => {
  const trimmed = value.trim();
  return trimmed ? hashIdentityPart(trimmed) : hashIdentityPart('unknown');
};

const getForwardedIp = (req: NextRequest): string => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-client-ip')?.trim()
    || 'unknown';
};

export const getRequestRateLimitIdentity = (req: NextRequest, suffix?: string): string => {
  const parts = [`ip:${getForwardedIp(req)}`];
  if (suffix?.trim()) {
    parts.push(`suffix:${suffix.trim()}`);
  }
  return parts.join('|');
};

const buildRateLimitKey = (options: Required<Pick<RateLimitOptions, 'name' | 'identity'>>, windowId: number): string => (
  `${getRedisKeyPrefix()}:rate-limit:${options.name}:${normalizeIdentity(options.identity)}:${windowId}`
);

const buildResult = ({
  backend,
  count,
  limit,
  resetAtMs,
  nowMs,
}: {
  backend: RateLimitBackend;
  count: number;
  limit: number;
  resetAtMs: number;
  nowMs: number;
}): RateLimitResult => {
  const allowed = count <= limit;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
  return {
    allowed,
    backend,
    count,
    limit,
    remaining: Math.max(limit - count, 0),
    resetAt: new Date(resetAtMs),
    retryAfterSeconds,
  };
};

const checkMemoryRateLimit = ({
  name,
  identity,
  limit,
  windowSeconds,
  nowMs,
}: NormalizedRateLimitOptions): RateLimitResult => {
  const windowMs = windowSeconds * 1000;
  const windowId = Math.floor(nowMs / windowMs);
  const resetAtMs = (windowId + 1) * windowMs;
  const key = `${name}:${normalizeIdentity(identity)}:${windowId}`;
  const existing = memoryRateLimits.get(key);
  const entry = existing && existing.resetAtMs > nowMs
    ? existing
    : { count: 0, resetAtMs };

  entry.count += 1;
  entry.resetAtMs = resetAtMs;
  memoryRateLimits.set(key, entry);

  for (const [entryKey, value] of memoryRateLimits.entries()) {
    if (value.resetAtMs <= nowMs) {
      memoryRateLimits.delete(entryKey);
    }
  }

  return buildResult({
    backend: 'memory',
    count: entry.count,
    limit,
    resetAtMs,
    nowMs,
  });
};

export const checkRateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const limit = normalizeLimit(options.limit);
  const windowSeconds = normalizeWindowSeconds(options.windowSeconds);
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = windowSeconds * 1000;
  const windowId = Math.floor(nowMs / windowMs);
  const resetAtMs = (windowId + 1) * windowMs;
  const normalizedOptions = {
    ...options,
    limit,
    windowSeconds,
    nowMs,
  };

  const redis = await getRedisClient();
  if (!redis) {
    return checkMemoryRateLimit(normalizedOptions);
  }

  const key = buildRateLimitKey(options, windowId);
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds + 5);
    }

    return buildResult({
      backend: 'redis',
      count,
      limit,
      resetAtMs,
      nowMs,
    });
  } catch (error) {
    console.error('[rate-limit] Redis check failed', error);
    return checkMemoryRateLimit(normalizedOptions);
  }
};

const shouldBypassRouteRateLimits = (): boolean => (
  process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS_IN_TEST !== 'true'
);

export const buildRateLimitResponse = (
  result: RateLimitResult,
  message = 'Too many requests. Please wait before trying again.',
): NextResponse => (
  NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': result.resetAt.toISOString(),
      },
    },
  )
);

export const applyRateLimit = async (
  req: NextRequest,
  policy: RateLimitPolicy,
  identitySuffix?: string,
): Promise<NextResponse | null> => {
  if (shouldBypassRouteRateLimits()) {
    return null;
  }

  const result = await checkRateLimit({
    ...policy,
    identity: getRequestRateLimitIdentity(req, identitySuffix),
  });

  return result.allowed ? null : buildRateLimitResponse(result, policy.message);
};

export const clearRateLimitMemoryForTests = (): void => {
  memoryRateLimits.clear();
};
