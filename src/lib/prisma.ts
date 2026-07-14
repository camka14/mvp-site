import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolvePrismaPgPoolConfig } from './prismaConfig';

const createPrismaClient = (): PrismaClient => {
  const poolConfig = resolvePrismaPgPoolConfig();

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
  var prisma: PrismaClient | undefined;
}

const getPrisma = (): PrismaClient => {
  if (global.prisma) {
    return global.prisma;
  }

  const client = createPrismaClient();
  // Reuse one Prisma client per process in every environment to avoid
  // exhausting PostgreSQL connection limits under concurrent requests.
  global.prisma = client;
  return client;
};

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as unknown as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
