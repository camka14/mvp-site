/** @jest-environment node */

const assertNoEventFieldSchedulingConflictsMock = jest.fn();

jest.mock('@/server/repositories/events', () => {
  class EventFieldConflictError extends Error {
    conflicts: Array<{ fieldId: string; start: Date; end: Date; parentId: string | null }>;

    constructor(conflicts: Array<{ fieldId: string; start: Date; end: Date; parentId: string | null }>) {
      super('Selected fields and time range conflict with existing reservations.');
      this.name = 'EventFieldConflictError';
      this.conflicts = conflicts;
    }
  }

  return {
    EventFieldConflictError,
    assertNoEventFieldSchedulingConflicts: (...args: unknown[]) => assertNoEventFieldSchedulingConflictsMock(...args),
  };
});

jest.mock('@/server/repositories/locks', () => ({
  advisoryLockId: jest.fn().mockReturnValue(1n),
}));

import { reserveRentalCheckoutLocks } from '@/server/repositories/rentalCheckoutLocks';

type LockRow = {
  id: string;
  docId: string | null;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;
};

type LockFilesWhere = {
  id?: { in?: string[] };
  docId?: string;
  expires?: { lte?: Date };
};

const createClient = () => {
  const lockRows = new Map<string, LockRow>();
  let transactionQueue = Promise.resolve();

  const lockFiles = {
    deleteMany: jest.fn(async ({ where }: { where?: LockFilesWhere }) => {
      const ids = Array.isArray(where?.id?.in) ? where.id.in : [];
      const cutoff = where?.expires?.lte instanceof Date ? where.expires.lte : null;
      const owner = typeof where?.docId === 'string' ? where.docId : null;
      let deletedCount = 0;

      for (const id of ids) {
        const row = lockRows.get(id);
        if (!row) continue;
        if (cutoff && row.expires.getTime() > cutoff.getTime()) continue;
        if (owner && row.docId !== owner) continue;
        lockRows.delete(id);
        deletedCount += 1;
      }

      return { count: deletedCount };
    }),
    findMany: jest.fn(async ({ where }: { where?: LockFilesWhere }) => {
      const ids = Array.isArray(where?.id?.in) ? where.id.in : [];
      return ids
        .map((id) => lockRows.get(id))
        .filter((row): row is LockRow => Boolean(row))
        .map((row) => ({
          id: row.id,
          docId: row.docId,
          expires: row.expires,
        }));
    }),
    upsert: jest.fn(async ({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: LockRow;
      update: Partial<LockRow>;
    }) => {
      const existing = lockRows.get(where.id);
      const next: LockRow = existing
        ? {
          ...existing,
          ...update,
          id: where.id,
        }
        : create;
      lockRows.set(where.id, next);
      return next;
    }),
  };

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    lockFiles,
  };

  return {
    lockRows,
    client: {
      $transaction: jest.fn((callback: (innerTx: typeof tx) => Promise<unknown>) => {
        const run = transactionQueue.then(() => callback(tx));
        transactionQueue = run.then(() => undefined, () => undefined);
        return run;
      }),
    },
  };
};

describe('reserveRentalCheckoutLocks concurrency', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    assertNoEventFieldSchedulingConflictsMock.mockResolvedValue(undefined);
  });

  it('allows only one checkout lock owner when two users race for the same field window', async () => {
    const { client, lockRows } = createClient();
    const window = {
      eventId: 'event_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-18T12:00:00.000Z'),
      end: new Date('2026-03-18T13:00:00.000Z'),
      noFixedEndDateTime: false,
      organizationId: null,
      eventType: 'EVENT',
      parentEvent: null,
    };
    const now = new Date('2026-03-18T11:55:00.000Z');

    const [firstAttempt, secondAttempt] = await Promise.all([
      reserveRentalCheckoutLocks({
        client,
        window,
        userId: 'user_1',
        now,
      }),
      reserveRentalCheckoutLocks({
        client,
        window,
        userId: 'user_2',
        now,
      }),
    ]);

    const successful = [firstAttempt, secondAttempt].filter((attempt) => attempt.ok) as Array<{
      ok: true;
      ownerToken: string;
      lockIds: string[];
      expiresAt: Date;
    }>;
    const rejected = [firstAttempt, secondAttempt].filter((attempt) => !attempt.ok) as Array<{
      ok: false;
      status: number;
      error: string;
      conflictFieldIds?: string[];
    }>;

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].status).toBe(409);
    expect(rejected[0].conflictFieldIds).toEqual(['field_1']);
    expect(assertNoEventFieldSchedulingConflictsMock).toHaveBeenCalledTimes(2);

    const lockId = 'rental-checkout:field_1:2026-03-18T12:00:00.000Z:2026-03-18T13:00:00.000Z';
    const persistedLock = lockRows.get(lockId);
    expect(persistedLock?.docId).toBe(successful[0].ownerToken);
  });
});
