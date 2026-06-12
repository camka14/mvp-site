/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { encryptSecret } from '@/server/integrations/secretCrypto';
import {
  buildQuickBooksStaffPayRunJournalEntry,
  syncStaffPayRunToQuickBooks,
} from '@/server/integrations/quickBooksPayRunSync';

describe('quickBooksPayRunSync', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
  });

  afterEach(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('builds a balanced QuickBooks journal entry for a staff pay run', () => {
    const payload = buildQuickBooksStaffPayRunJournalEntry({
      payRun: {
        id: 'pay_run_1',
        organizationId: 'org_1',
        title: 'June payroll',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T23:59:59.999Z'),
        scheduledPayDate: new Date('2026-07-05T00:00:00.000Z'),
        status: 'APPROVED',
        totalAmountCents: 6000,
      },
      mapping: {
        payrollExpenseAccountExternalId: '62',
        payrollExpenseAccountName: 'Payroll Expenses',
        payrollLiabilityAccountExternalId: '41',
        payrollLiabilityAccountName: 'Payroll Clearing',
      },
    });

    expect(payload.TxnDate).toBe('2026-07-05');
    expect(payload.Line).toHaveLength(2);
    expect(payload.Line[0]).toEqual(expect.objectContaining({
      Amount: 60,
      JournalEntryLineDetail: expect.objectContaining({
        PostingType: 'Debit',
        AccountRef: { value: '62', name: 'Payroll Expenses' },
      }),
    }));
    expect(payload.Line[1]).toEqual(expect.objectContaining({
      Amount: 60,
      JournalEntryLineDetail: expect.objectContaining({
        PostingType: 'Credit',
        AccountRef: { value: '41', name: 'Payroll Clearing' },
      }),
    }));
  });

  it('syncs approved staff pay runs and records QuickBooks transaction metadata', async () => {
    const payRun = {
      id: 'pay_run_1',
      organizationId: 'org_1',
      title: 'June payroll',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T23:59:59.999Z'),
      scheduledPayDate: new Date('2026-07-05T00:00:00.000Z'),
      status: 'APPROVED',
      totalAmountCents: 6000,
    };
    const accountingSyncUpdateMock = jest.fn(async ({ data }) => ({
      id: 'accounting_sync_1',
      organizationId: 'org_1',
      provider: 'QUICKBOOKS_ONLINE',
      sourceType: 'STAFF_PAY_RUN',
      staffPayRunId: 'pay_run_1',
      ...data,
    }));
    const connectionUpdateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      organizationId: 'org_1',
      ...data,
    }));
    const client = {
      staffPayRun: {
        findFirst: jest.fn().mockResolvedValue(payRun),
        update: jest.fn(async ({ data }) => ({ ...payRun, ...data })),
      },
      organizationAccountingConnections: {
        findUnique: jest.fn(async (args: any) => {
          if (args?.select) {
            return {
              payrollExpenseAccountExternalId: '62',
              payrollExpenseAccountName: 'Payroll Expenses',
              payrollLiabilityAccountExternalId: '41',
              payrollLiabilityAccountName: 'Payroll Clearing',
            };
          }
          return {
            id: 'qbo_1',
            status: 'CONNECTED',
            environment: 'sandbox',
            externalCompanyIdEncrypted: encryptSecret('1234567890'),
            accessTokenEncrypted: encryptSecret('access-token'),
            refreshTokenEncrypted: encryptSecret('refresh-token'),
            accessTokenExpiresAt: new Date('2099-06-10T20:00:00.000Z'),
          };
        }),
        update: connectionUpdateMock,
      },
      accountingSyncRecords: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(async ({ create }) => create),
        update: accountingSyncUpdateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ intuit_tid: 'tid-123' }),
      json: async () => ({
        JournalEntry: {
          Id: '987',
          DocNumber: 'JE-14',
          SyncToken: '0',
        },
      }),
    } as Response));

    const result = await syncStaffPayRunToQuickBooks({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
      now: new Date('2026-06-15T18:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/company/1234567890/journalentry?minorversion=75'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"PostingType":"Debit"'),
      }),
    );
    expect(accountingSyncUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SYNCED',
        externalTxnId: '987',
        externalTxnType: 'JournalEntry',
        externalTxnDocNumber: 'JE-14',
        intuitTid: 'tid-123',
        syncedByUserId: 'owner_1',
      }),
    }));
    expect(client.staffPayRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        exportedAt: new Date('2026-06-15T18:00:00.000Z'),
        exportedByUserId: 'owner_1',
        exportCount: { increment: 1 },
        lastExportFormat: 'QUICKBOOKS_JOURNAL_ENTRY',
      }),
    }));
    expect(connectionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastIntuitTid: 'tid-123',
        lastError: null,
      }),
    }));
    expect(result.syncRecord.status).toBe('SYNCED');
    expect(result.alreadySynced).toBe(false);
  });

  it('requires explicit QuickBooks payroll account mappings before syncing', async () => {
    const client = {
      staffPayRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pay_run_1',
          organizationId: 'org_1',
          title: 'June payroll',
          periodStart: new Date('2026-06-01T00:00:00.000Z'),
          periodEnd: new Date('2026-06-30T23:59:59.999Z'),
          status: 'APPROVED',
          totalAmountCents: 6000,
        }),
      },
      organizationAccountingConnections: {
        findUnique: jest.fn().mockResolvedValue({
          payrollExpenseAccountExternalId: null,
          payrollLiabilityAccountExternalId: null,
        }),
      },
      accountingSyncRecords: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const fetchMock = jest.fn();

    await expect(syncStaffPayRunToQuickBooks({
      organizationId: 'org_1',
      payRunId: 'pay_run_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
    })).rejects.toThrow('Set QuickBooks payroll expense and liability account IDs before syncing pay runs.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.accountingSyncRecords.upsert).not.toHaveBeenCalled();
  });
});
