import { createClient } from 'redis';

export type RedisClient = {
  isOpen: boolean;
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { EX?: number }) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
  publish: (channel: string, message: string) => Promise<number>;
  quit: () => Promise<unknown>;
  destroy: () => void;
  on: (event: string, listener: (...args: any[]) => void) => RedisClient;
};

type RedisGlobal = typeof globalThis & {
  __bracketIqRedisClient?: RedisClient;
  __bracketIqRedisClientPromise?: Promise<RedisClient | null>;
  __bracketIqRedisRetryAfterMs?: number;
  __bracketIqRedisUrl?: string;
};

const REDIS_RETRY_DELAY_MS = 5_000;

const redisState = globalThis as RedisGlobal;

const getConfiguredRedisUrl = (): string | null => {
  if (process.env.REDIS_DISABLED === 'true') {
    return null;
  }

  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
};

export const getRedisKeyPrefix = (): string => {
  const configured = process.env.REDIS_KEY_PREFIX?.trim();
  return configured || 'bracketiq';
};

export const isRedisConfigured = (): boolean => Boolean(getConfiguredRedisUrl());

const resetRedisState = (): void => {
  redisState.__bracketIqRedisClient = undefined;
  redisState.__bracketIqRedisClientPromise = undefined;
  redisState.__bracketIqRedisRetryAfterMs = undefined;
  redisState.__bracketIqRedisUrl = undefined;
};

const destroyClient = (client: RedisClient | undefined): void => {
  if (!client) return;
  try {
    client.destroy();
  } catch {
    // The client may already be closed.
  }
};

const createConnectedRedisClient = async (url: string): Promise<RedisClient> => {
  const client = createClient({ url }) as unknown as RedisClient;

  client.on('error', (error) => {
    console.error('[redis] client error', error);
  });

  client.on('end', () => {
    if (redisState.__bracketIqRedisClient === client) {
      redisState.__bracketIqRedisClient = undefined;
      redisState.__bracketIqRedisClientPromise = undefined;
    }
  });

  await client.connect();
  return client;
};

export const getRedisClient = async (): Promise<RedisClient | null> => {
  const url = getConfiguredRedisUrl();
  if (!url) {
    return null;
  }

  if (redisState.__bracketIqRedisUrl && redisState.__bracketIqRedisUrl !== url) {
    destroyClient(redisState.__bracketIqRedisClient);
    resetRedisState();
  }

  const existing = redisState.__bracketIqRedisClient;
  if (existing?.isOpen) {
    return existing;
  }

  const now = Date.now();
  if (redisState.__bracketIqRedisRetryAfterMs && now < redisState.__bracketIqRedisRetryAfterMs) {
    return null;
  }

  if (!redisState.__bracketIqRedisClientPromise) {
    redisState.__bracketIqRedisUrl = url;
    redisState.__bracketIqRedisClientPromise = createConnectedRedisClient(url)
      .then((client) => {
        redisState.__bracketIqRedisClient = client;
        redisState.__bracketIqRedisRetryAfterMs = undefined;
        return client;
      })
      .catch((error) => {
        console.error('[redis] connection failed', error);
        redisState.__bracketIqRedisClient = undefined;
        redisState.__bracketIqRedisClientPromise = undefined;
        redisState.__bracketIqRedisRetryAfterMs = Date.now() + REDIS_RETRY_DELAY_MS;
        return null;
      });
  }

  return redisState.__bracketIqRedisClientPromise;
};

export const closeRedisClient = async (): Promise<void> => {
  const client = redisState.__bracketIqRedisClient ?? await redisState.__bracketIqRedisClientPromise;
  resetRedisState();

  if (!client) {
    return;
  }

  try {
    if (client.isOpen) {
      await client.quit();
    } else {
      client.destroy();
    }
  } catch {
    destroyClient(client);
  }
};
