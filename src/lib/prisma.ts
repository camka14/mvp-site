import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const parseTimeoutMs = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Prevent requests from hanging indefinitely when the DB is unreachable.
// Override via `PG_CONNECTION_TIMEOUT_MS` if you need a different value.
const connectionTimeoutMillis = parseTimeoutMs(process.env.PG_CONNECTION_TIMEOUT_MS, 5_000);

const adapter = new PrismaPg(
  {
    connectionString,
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

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
