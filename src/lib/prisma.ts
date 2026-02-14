import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const parseTimeoutMs = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

// Prevent requests from hanging indefinitely when the DB is unreachable.
// Override via `PG_CONNECTION_TIMEOUT_MS` if you need a different value.
const connectionTimeoutMillis = parseTimeoutMs(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000);
const sslRejectUnauthorized = parseBoolean(process.env.PG_SSL_REJECT_UNAUTHORIZED);

const getConnectionString = (): string => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  if (sslRejectUnauthorized === undefined) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    // pg's connection string parser gives priority to `sslmode` over the `ssl` object.
    // Normalize sslmode directly so env override is deterministic.
    if (sslRejectUnauthorized) {
      url.searchParams.set('sslmode', 'verify-full');
    } else {
      url.searchParams.set('sslmode', 'no-verify');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};

const createPrismaClient = (): PrismaClient => {
  const poolConfig: {
    connectionString: string;
    connectionTimeoutMillis: number;
  } = {
    connectionString: getConnectionString(),
    connectionTimeoutMillis,
  };

  const adapter = new PrismaPg(
    poolConfig,
    {
      onPoolError: (err) => {
        console.error('[prisma] pool error', err);
      },
      onConnectionError: (err) => {
        console.error('[prisma] connection error', err);
      },
    },
  );

  return new PrismaClient({ adapter });
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const getPrisma = (): PrismaClient => {
  if (global.prisma) {
    return global.prisma;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    global.prisma = client;
  }
  return client;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as unknown as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
