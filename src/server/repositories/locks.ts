import crypto from 'crypto';
import { PrismaClient } from '@/generated/prisma/client';

export type PrismaLike = PrismaClient | Parameters<PrismaClient['$transaction']>[0];

export const advisoryLockId = (value: string): bigint => {
  const hash = crypto.createHash('sha256').update(value).digest();
  const raw = hash.readBigInt64BE(0);
  return BigInt.asIntN(64, raw);
};

export const acquireEventLock = async (client: PrismaLike, eventId: string): Promise<void> => {
  const lockId = advisoryLockId(eventId);
  await client.$queryRaw`SELECT pg_advisory_xact_lock(${lockId})`;
};
