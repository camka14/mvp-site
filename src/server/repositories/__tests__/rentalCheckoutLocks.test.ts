/** @jest-environment node */

const assertNoEventFieldSchedulingConflictsMock = jest.fn();
const advisoryLockIdMock = jest.fn();

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
  advisoryLockId: (...args: unknown[]) => advisoryLockIdMock(...args),
}));

import {
  MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER,
  reserveRentalCheckoutLocks,
  reserveRentalCheckoutWindowLocks,
} from '@/server/repositories/rentalCheckoutLocks';
import { EventFieldConflictError } from '@/server/repositories/events';

type LockRow = {
  id: string;
  docId: string | null;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;
};

type LockFilesWhere = {
  id?: { in?: string[]; startsWith?: string; notIn?: string[] };
  OR?: Array<{ id?: { startsWith?: string } }>;
  docId?: string | { startsWith?: string };
  expires?: { lte?: Date; gt?: Date };
};

const createClient = () => {
  const lockRows = new Map<string, LockRow>();
  let transactionQueue = Promise.resolve();

  const lockFiles = {
    deleteMany: jest.fn(async ({ where }: { where?: LockFilesWhere }) => {
      const cutoff = where?.expires?.lte instanceof Date ? where.expires.lte : null;
      const owner = typeof where?.docId === 'string' ? where.docId : null;
      let deletedCount = 0;

      for (const [id, row] of Array.from(lockRows.entries())) {
        if (where?.id?.in && !where.id.in.includes(id)) continue;
        if (where?.id?.startsWith && !id.startsWith(where.id.startsWith)) continue;
        if (where?.id?.notIn?.includes(id)) continue;
        if (cutoff && row.expires.getTime() > cutoff.getTime()) continue;
        if (owner && row.docId !== owner) continue;
        lockRows.delete(id);
        deletedCount += 1;
      }

      return { count: deletedCount };
    }),
    findMany: jest.fn(async ({ where }: { where?: LockFilesWhere }) => {
      const ids = Array.isArray(where?.id?.in) ? where.id.in : [];
      let rows = ids.length
        ? ids.map((id) => lockRows.get(id)).filter((row): row is LockRow => Boolean(row))
        : Array.from(lockRows.values());
      if (where?.id?.startsWith) {
        rows = rows.filter((row) => row.id.startsWith(where.id?.startsWith ?? ''));
      }
      if (where?.OR?.length) {
        rows = rows.filter((row) => where?.OR?.some((clause) => (
          !clause.id?.startsWith || row.id.startsWith(clause.id.startsWith)
        )));
      }
      const ownerPrefix = typeof where?.docId === 'object' ? where.docId.startsWith : null;
      const owner = typeof where?.docId === 'string' ? where.docId : null;
      const expiresAfter = where?.expires?.gt instanceof Date ? where.expires.gt : null;
      return rows
        .filter((row) => !owner || row.docId === owner)
        .filter((row) => !ownerPrefix || row.docId?.startsWith(ownerPrefix))
        .filter((row) => !expiresAfter || row.expires.getTime() > expiresAfter.getTime())
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
    advisoryLockIdMock.mockReturnValue(1n);
    assertNoEventFieldSchedulingConflictsMock.mockResolvedValue(undefined);
  });

  it('allows only one checkout lock owner when two users race for the same field window', async () => {
    const { client, lockRows } = createClient();
    const window = {
      eventId: 'event_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-18T12:00:00.000Z'),
      end: new Date('2026-03-18T13:00:00.000Z'),
      timeZone: 'UTC',
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
    assertNoEventFieldSchedulingConflictsMock.mock.calls.forEach(([args]) => {
      expect(args).not.toHaveProperty('includeFieldRentalAvailabilityConflicts');
    });

    const lockId = 'rental-checkout:field_1:2026-03-18T12:00:00.000Z:2026-03-18T13:00:00.000Z';
    const persistedLock = lockRows.get(lockId);
    expect(persistedLock?.docId).toBe(successful[0].ownerToken);
  });

  it('bounds active lock rows for one user even when draft event ids change', async () => {
    const { client, lockRows } = createClient();
    const now = new Date('2026-03-18T11:55:00.000Z');
    for (let index = 0; index < MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER; index += 1) {
      lockRows.set(`existing_${index}`, {
        id: `existing_${index}`,
        docId: `rental:user_1:draft_${index}`,
        expires: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = await reserveRentalCheckoutLocks({
      client,
      window: {
        eventId: 'new_draft_id',
        fieldIds: ['field_1'],
        start: new Date('2026-03-18T12:00:00.000Z'),
        end: new Date('2026-03-18T13:00:00.000Z'),
        timeZone: 'UTC',
        noFixedEndDateTime: false,
        organizationId: 'organization_1',
        eventType: 'EVENT',
        parentEvent: null,
      },
      userId: 'user_1',
      now,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 429,
    }));
    expect(lockRows.has('rental-checkout:field_1:2026-03-18T12:00:00.000Z:2026-03-18T13:00:00.000Z')).toBe(false);
  });

  it('creates only the exact disjoint field-window rows', async () => {
    const { client, lockRows } = createClient();
    const now = new Date('2026-03-18T08:00:00.000Z');
    const result = await reserveRentalCheckoutWindowLocks({
      client,
      windows: [
        {
          eventId: 'event_disjoint',
          fieldIds: ['field_1'],
          start: new Date('2026-03-18T09:00:00.000Z'),
          end: new Date('2026-03-18T10:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
        {
          eventId: 'event_disjoint',
          fieldIds: ['field_2'],
          start: new Date('2026-03-20T15:00:00.000Z'),
          end: new Date('2026-03-20T16:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
      ],
      userId: 'user_1',
      now,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(Array.from(lockRows.keys())).toEqual([
      'rental-checkout:field_1:2026-03-18T09:00:00.000Z:2026-03-18T10:00:00.000Z',
      'rental-checkout:field_2:2026-03-20T15:00:00.000Z:2026-03-20T16:00:00.000Z',
    ]);
  });

  it.each([
    ['partially overlaps', '2026-03-18T12:30:00.000Z', '2026-03-18T13:30:00.000Z'],
    ['encloses', '2026-03-18T11:00:00.000Z', '2026-03-18T14:00:00.000Z'],
  ])('rejects a non-identical checkout that %s an active hold', async (_label, startIso, endIso) => {
    const { client } = createClient();
    const baseWindow = {
      eventId: 'event_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-18T12:00:00.000Z'),
      end: new Date('2026-03-18T13:00:00.000Z'),
      timeZone: 'UTC',
      noFixedEndDateTime: false,
      organizationId: 'organization_1',
      eventType: 'EVENT',
      parentEvent: null,
    };
    await reserveRentalCheckoutWindowLocks({
      client,
      windows: [baseWindow],
      userId: 'user_1',
      now: new Date('2026-03-18T11:50:00.000Z'),
    });

    const result = await reserveRentalCheckoutWindowLocks({
      client,
      windows: [{
        ...baseWindow,
        eventId: 'event_2',
        start: new Date(startIso),
        end: new Date(endIso),
      }],
      userId: 'user_2',
      now: new Date('2026-03-18T11:51:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 409,
      conflictFieldIds: ['field_1'],
    }));
  });

  it('allows a same-field selection that starts exactly when another hold ends', async () => {
    const { client, lockRows } = createClient();
    const baseWindow = {
      eventId: 'event_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-18T12:00:00.000Z'),
      end: new Date('2026-03-18T13:00:00.000Z'),
      timeZone: 'UTC',
      noFixedEndDateTime: false,
      organizationId: 'organization_1',
      eventType: 'EVENT',
      parentEvent: null,
    };
    await reserveRentalCheckoutWindowLocks({
      client,
      windows: [baseWindow],
      userId: 'user_1',
      now: new Date('2026-03-18T11:50:00.000Z'),
    });
    const result = await reserveRentalCheckoutWindowLocks({
      client,
      windows: [{
        ...baseWindow,
        eventId: 'event_2',
        start: baseWindow.end,
        end: new Date('2026-03-18T14:00:00.000Z'),
      }],
      userId: 'user_2',
      now: new Date('2026-03-18T11:51:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(lockRows.size).toBe(2);
  });

  it('reconciles a retry to the same owner exact set and removes obsolete holds', async () => {
    const { client, lockRows } = createClient();
    const common = {
      eventId: 'event_retry',
      fieldIds: ['field_1'],
      timeZone: 'UTC',
      noFixedEndDateTime: false,
      organizationId: 'organization_1',
      eventType: 'EVENT',
      parentEvent: null,
    };
    const first = {
      ...common,
      start: new Date('2026-03-18T12:00:00.000Z'),
      end: new Date('2026-03-18T13:00:00.000Z'),
    };
    const second = {
      ...common,
      start: new Date('2026-03-18T14:00:00.000Z'),
      end: new Date('2026-03-18T15:00:00.000Z'),
    };
    await reserveRentalCheckoutWindowLocks({
      client,
      windows: [first, second],
      userId: 'user_1',
      now: new Date('2026-03-18T11:50:00.000Z'),
    });
    const retry = await reserveRentalCheckoutWindowLocks({
      client,
      windows: [second],
      userId: 'user_1',
      now: new Date('2026-03-18T11:52:00.000Z'),
    });

    expect(retry).toEqual(expect.objectContaining({ ok: true }));
    expect(Array.from(lockRows.keys())).toEqual([
      'rental-checkout:field_1:2026-03-18T14:00:00.000Z:2026-03-18T15:00:00.000Z',
    ]);
  });

  it('persists no rows when any exact window fails the scheduling check', async () => {
    const { client, lockRows } = createClient();
    assertNoEventFieldSchedulingConflictsMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new EventFieldConflictError([{
        fieldId: 'field_2',
        start: new Date('2026-03-20T15:00:00.000Z'),
        end: new Date('2026-03-20T16:00:00.000Z'),
        parentId: null,
      }]));
    const result = await reserveRentalCheckoutWindowLocks({
      client,
      windows: [
        {
          eventId: 'event_atomic',
          fieldIds: ['field_1'],
          start: new Date('2026-03-18T09:00:00.000Z'),
          end: new Date('2026-03-18T10:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
        {
          eventId: 'event_atomic',
          fieldIds: ['field_2'],
          start: new Date('2026-03-20T15:00:00.000Z'),
          end: new Date('2026-03-20T16:00:00.000Z'),
          timeZone: 'UTC',
          noFixedEndDateTime: false,
          organizationId: 'organization_1',
          eventType: 'EVENT',
          parentEvent: null,
        },
      ],
      userId: 'user_1',
      now: new Date('2026-03-18T08:00:00.000Z'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: false, status: 409 }));
    expect(lockRows.size).toBe(0);
  });

  it('acquires per-field advisory locks in lexical order', async () => {
    const { client } = createClient();
    await reserveRentalCheckoutWindowLocks({
      client,
      windows: [{
        eventId: 'event_order',
        fieldIds: ['field_z', 'field_a'],
        start: new Date('2026-03-18T12:00:00.000Z'),
        end: new Date('2026-03-18T13:00:00.000Z'),
        timeZone: 'UTC',
        noFixedEndDateTime: false,
        organizationId: 'organization_1',
        eventType: 'EVENT',
        parentEvent: null,
      }],
      userId: 'user_1',
      now: new Date('2026-03-18T11:00:00.000Z'),
    });

    expect(advisoryLockIdMock.mock.calls.map(([key]) => key)).toEqual([
      'rental-checkout-user:user_1',
      'rental-checkout-field:field_a',
      'rental-checkout-field:field_z',
    ]);
  });
});
