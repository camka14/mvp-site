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
    const readProp = (name: string | symbol) => Reflect.get(client as unknown as object, name, receiver);
    let value = readProp(prop);
    // Backward compatibility while team model delegate naming transitions between
    // `volleyBallTeams` and `teams` across local environments.
    if (value === undefined && prop === 'teams') {
      value = readProp('volleyBallTeams');
    } else if (value === undefined && prop === 'volleyBallTeams') {
      value = readProp('teams');
    }
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
