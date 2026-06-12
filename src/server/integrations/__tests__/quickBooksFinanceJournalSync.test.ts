/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

const loadOrganizationFinanceSummaryMock = jest.fn();
const listOrganizationFinanceCategoryAccountingMappingsMock = jest.fn();

jest.mock('@/server/finance/financeRepository', () => ({
  loadOrganizationFinanceSummary: (...args: unknown[]) => loadOrganizationFinanceSummaryMock(...args),
}));

jest.mock('@/server/integrations/financeCategoryAccountingMappings', () => ({
  listOrganizationFinanceCategoryAccountingMappings: (...args: unknown[]) => (
    listOrganizationFinanceCategoryAccountingMappingsMock(...args)
  ),
}));

import { encryptSecret } from '@/server/integrations/secretCrypto';
import {
  buildFinanceJournalSyncSourceKey,
  syncOrganizationFinanceJournalEntryToQuickBooks,
} from '@/server/integrations/quickBooksFinanceJournalSync';

describe('quickBooksFinanceJournalSync', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    loadOrganizationFinanceSummaryMock.mockResolvedValue({
      organizationId: 'org_1',
      grossRevenueCents: 0,
      refundCents: 0,
      feeCents: 0,
      actualRevenueCents: 0,
      actualCostCents: 2500,
      actualProfitCents: -2500,
      futureCostCents: 0,
      projectedProfitCents: -2500,
      staffCostCents: 0,
      customCostCents: 2500,
      warnings: [],
      lineItems: [
        {
          id: 'custom:line_1',
          sourceType: 'custom_line_item',
          sourceId: 'line_1',
          scope: 'ORGANIZATION',
          label: 'Field rental',
          category: 'Rentals',
          amountCents: -2500,
          classification: 'custom_cost',
          status: 'ACTUAL',
          timing: 'ACTUAL',
          isGenerated: false,
        },
      ],
    });
    listOrganizationFinanceCategoryAccountingMappingsMock.mockResolvedValue([
      {
        id: 'mapping_1',
        organizationId: 'org_1',
        provider: 'QUICKBOOKS_ONLINE',
        category: 'Rentals',
        categoryKey: 'rentals',
        entryType: 'EXPENSE',
        accountExternalId: '75',
        accountName: 'Field Rental Expense',
        isActive: true,
      },
    ]);
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

  it('builds stable source keys from finance date ranges', () => {
    expect(buildFinanceJournalSyncSourceKey({
      organizationId: 'org_1',
      from: '2026-06-01T07:00:00.000Z',
      to: '2026-07-01T06:59:59.999Z',
    })).toBe('organization:org_1:finance-journal:2026-06-01:2026-07-01');
  });

  it('posts ready finance journal entries and records QuickBooks metadata', async () => {
    const accountingSyncUpdateMock = jest.fn(async ({ data }) => ({
      id: 'accounting_sync_1',
      organizationId: 'org_1',
      provider: 'QUICKBOOKS_ONLINE',
      sourceType: 'FINANCE_JOURNAL_ENTRY',
      sourceKey: 'organization:org_1:finance-journal:2026-06-01:2026-06-30',
      ...data,
    }));
    const connectionUpdateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      organizationId: 'org_1',
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn(async (args: any) => {
          if (args?.select) {
            return {
              status: 'CONNECTED',
              financeClearingAccountExternalId: '35',
              financeClearingAccountName: 'Undeposited Funds',
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
      headers: new Headers({ intuit_tid: 'tid-finance' }),
      json: async () => ({
        JournalEntry: {
          Id: '148',
          DocNumber: 'JE-26',
          SyncToken: '0',
        },
      }),
    } as Response));

    const result = await syncOrganizationFinanceJournalEntryToQuickBooks({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      from: '2026-06-01',
      to: '2026-06-30',
      client,
      fetchImpl: fetchMock,
      now: new Date('2026-06-15T18:00:00.000Z'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v3/company/1234567890/journalentry?minorversion=75'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"AccountRef":{"value":"75","name":"Field Rental Expense"}'),
      }),
    );
    expect(client.accountingSyncRecords.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sourceType: 'FINANCE_JOURNAL_ENTRY',
        sourceKey: 'organization:org_1:finance-journal:2026-06-01:2026-06-30',
        status: 'PENDING',
        createdBy: 'owner_1',
      }),
    }));
    expect(accountingSyncUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SYNCED',
        externalTxnId: '148',
        externalTxnType: 'JournalEntry',
        externalTxnDocNumber: 'JE-26',
        intuitTid: 'tid-finance',
        syncedByUserId: 'owner_1',
      }),
    }));
    expect(connectionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastIntuitTid: 'tid-finance',
        lastError: null,
      }),
    }));
    expect(result.preview.readyToSync).toBe(true);
    expect(result.syncRecord.status).toBe('SYNCED');
    expect(result.alreadySynced).toBe(false);
  });

  it('does not post when finance account mappings are incomplete', async () => {
    listOrganizationFinanceCategoryAccountingMappingsMock.mockResolvedValue([]);
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn(async (args: any) => {
          if (args?.select) {
            return {
              status: 'CONNECTED',
              financeClearingAccountExternalId: '35',
              financeClearingAccountName: 'Undeposited Funds',
            };
          }
          return null;
        }),
      },
      accountingSyncRecords: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const fetchMock = jest.fn();

    await expect(syncOrganizationFinanceJournalEntryToQuickBooks({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      from: '2026-06-01',
      to: '2026-06-30',
      client,
      fetchImpl: fetchMock,
    })).rejects.toThrow('Resolve the QuickBooks account mappings before syncing this journal entry.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.accountingSyncRecords.upsert).not.toHaveBeenCalled();
  });
});
