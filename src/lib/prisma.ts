import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const parseTimeoutMs = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Prevent requests from hanging indefinitely when the DB is unreachable.
// Override via `PG_CONNECTION_TIMEOUT_MS` if you need a different value.
const connectionTimeoutMillis = parseTimeoutMs(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000);

const getConnectionString = (): string => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return connectionString;
};

const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaPg(
    {
      connectionString: getConnectionString(),
      connectionTimeoutMillis,
    },
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
