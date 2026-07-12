import type { Prisma, PrismaClient } from '@/generated/prisma/client';

type BillSplitLockClient = PrismaClient | Prisma.TransactionClient;

const billSplitLockKey = (billId: string): string => `bill-split:${billId}`;

/**
 * Serializes operations which can either allocate a team bill to child bills
 * or make one of its parent installments chargeable in Stripe.
 */
export const acquireBillSplitLock = async (
  client: BillSplitLockClient,
  billId: string,
): Promise<void> => {
  await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${billSplitLockKey(billId)}))`;
};
