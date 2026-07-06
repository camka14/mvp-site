/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  organizationAccountingConnections: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  accountingSyncRecords: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  organizationFinanceCategoryAccountingMappings: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};
const requireSessionMock = jest.fn();
const canManageOrganizationFinanceMock = jest.fn();
const loadOrganizationFinanceSummaryMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));
jest.mock('@/server/finance/financeAccess', () => ({
  canManageOrganizationFinance: (...args: unknown[]) => canManageOrganizationFinanceMock(...args),
}));
jest.mock('@/server/finance/financeRepository', () => ({
  loadOrganizationFinanceSummary: (...args: unknown[]) => loadOrganizationFinanceSummaryMock(...args),
}));

import { POST as connectQuickBooks } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/connect/route';
import { POST as disconnectQuickBooks } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/disconnect/route';
import { GET as listQuickBooksAccountsRoute } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/accounts/route';
import { PATCH as updateQuickBooksCategoryMappings } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/category-mappings/route';
import { GET as previewQuickBooksJournalEntry } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/journal-entry-preview/route';
import { POST as syncQuickBooksJournalEntry } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/journal-entry-sync/route';
import { PATCH as updateQuickBooksSettings } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/settings/route';
import { parseQuickBooksState } from '@/server/integrations/quickBooksConnection';
import { encryptSecret } from '@/server/integrations/secretCrypto';

describe('QuickBooks organization finance integration routes', () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_REDIRECT_URI: process.env.INTUIT_REDIRECT_URI,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    delete process.env.INTUIT_REDIRECT_URI;
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    canManageOrganizationFinanceMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.organizationAccountingConnections.findUnique.mockResolvedValue({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      status: 'CONNECTED',
      environment: 'sandbox',
      externalCompanyIdEncrypted: encryptSecret('1234567890'),
      accessTokenEncrypted: encryptSecret('access-token'),
      refreshTokenEncrypted: encryptSecret('refresh-token'),
      accessTokenExpiresAt: new Date('2099-06-10T20:00:00.000Z'),
      financeClearingAccountExternalId: '35',
      financeClearingAccountName: 'Undeposited Funds',
    });
    prismaMock.organizationAccountingConnections.update.mockImplementation(async ({ data }) => ({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    prismaMock.organizationFinanceCategoryAccountingMappings.findMany.mockResolvedValue([
      {
        id: 'finance_category_accounting_mapping_1',
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
    prismaMock.organizationFinanceCategoryAccountingMappings.findUnique.mockResolvedValue(null);
    prismaMock.organizationFinanceCategoryAccountingMappings.upsert.mockImplementation(async ({ create, update }) => ({
      ...create,
      ...update,
    }));
    prismaMock.organizationFinanceCategoryAccountingMappings.update.mockImplementation(async ({ data }) => ({
      id: 'finance_category_accounting_mapping_1',
      ...data,
    }));
    prismaMock.accountingSyncRecords.findUnique.mockResolvedValue(null);
    prismaMock.accountingSyncRecords.upsert.mockImplementation(async ({ create }) => create);
    prismaMock.accountingSyncRecords.update.mockImplementation(async ({ data }) => ({
      id: 'accounting_sync_1',
      organizationId: 'org_1',
      provider: 'QUICKBOOKS_ONLINE',
      sourceType: 'FINANCE_JOURNAL_ENTRY',
      sourceKey: 'organization:org_1:finance-journal:2026-06-01:2026-06-30',
      ...data,
    }));
    loadOrganizationFinanceSummaryMock.mockResolvedValue({
      organizationId: 'org_1',
      grossRevenueCents: 10000,
      refundCents: 0,
      feeCents: 0,
      actualRevenueCents: 10000,
      actualCostCents: 2500,
      actualProfitCents: 7500,
      futureCostCents: 0,
      potentialRevenueCents: 0,
      projectedProfitCents: 7500,
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('returns an Intuit authorization URL with signed organization state', async () => {
    const response = await connectQuickBooks(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/connect', {
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'http://localhost/organizations/org_1/finance',
          refreshUrl: 'http://localhost/organizations/org_1/finance',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();
    const authorizationUrl = new URL(payload.authorizationUrl);
    const parsedState = parseQuickBooksState(authorizationUrl.searchParams.get('state') ?? '');

    expect(response.status).toBe(200);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('intuit-client-id');
    expect(authorizationUrl.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe('http://localhost/api/integrations/quickbooks/callback');
    expect(parsedState).toEqual(expect.objectContaining({
      organizationId: 'org_1',
      userId: 'owner_1',
      returnUrl: 'http://localhost/organizations/org_1/finance',
    }));
    expect(payload.environment).toBe('sandbox');
  });

  it('rejects connect when QuickBooks is not configured', async () => {
    delete process.env.INTUIT_CLIENT_ID;

    const response = await connectQuickBooks(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/connect', {
        method: 'POST',
        body: JSON.stringify({
          returnUrl: 'http://localhost/organizations/org_1/finance',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe('QuickBooks is not configured.');
  });

  it('disconnects an existing QuickBooks connection', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response));

    const response = await disconnectQuickBooks(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/disconnect', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.organizationAccountingConnections.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'DISCONNECTED',
        externalCompanyId: null,
        externalCompanyIdEncrypted: null,
        externalCompanyName: null,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        disconnectedByUserId: 'owner_1',
      }),
    }));
    expect(payload.connection.status).toBe('DISCONNECTED');
  });

  it('saves QuickBooks payroll account mappings', async () => {
    const response = await updateQuickBooksSettings(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          payrollExpenseAccountExternalId: '62',
          payrollExpenseAccountName: 'Payroll Expenses',
          payrollLiabilityAccountExternalId: '41',
          payrollLiabilityAccountName: 'Payroll Clearing',
          financeClearingAccountExternalId: '35',
          financeClearingAccountName: 'Undeposited Funds',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.organizationAccountingConnections.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payrollExpenseAccountExternalId: '62',
        payrollExpenseAccountName: 'Payroll Expenses',
        payrollLiabilityAccountExternalId: '41',
        payrollLiabilityAccountName: 'Payroll Clearing',
        financeClearingAccountExternalId: '35',
        financeClearingAccountName: 'Undeposited Funds',
        updatedBy: 'owner_1',
      }),
    }));
    expect(payload.connection.payrollExpenseAccountExternalId).toBe('62');
    expect(payload.connection.externalCompanyId).toBeNull();
  });

  it('previews QuickBooks journal entries for finance line items', async () => {
    const response = await previewQuickBooksJournalEntry(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/journal-entry-preview?from=2026-06-01&to=2026-06-30'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loadOrganizationFinanceSummaryMock).toHaveBeenCalledWith('org_1', prismaMock, {
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(payload.preview.readyToSync).toBe(true);
    expect(payload.preview.isBalanced).toBe(true);
    expect(payload.preview.debitTotalCents).toBe(2500);
    expect(payload.preview.creditTotalCents).toBe(2500);
    expect(payload.preview.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        postingType: 'Debit',
        accountExternalId: '75',
        accountName: 'Field Rental Expense',
      }),
      expect.objectContaining({
        postingType: 'Credit',
        accountExternalId: '35',
        accountName: 'Undeposited Funds',
        role: 'CLEARING_ACCOUNT',
      }),
    ]));
  });

  it('syncs QuickBooks journal entries for finance line items', async () => {
    global.fetch = jest.fn(async () => ({
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

    const response = await syncQuickBooksJournalEntry(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/journal-entry-sync?from=2026-06-01&to=2026-06-30', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.accountingSyncRecords.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        organizationId: 'org_1',
        provider: 'QUICKBOOKS_ONLINE',
        sourceType: 'FINANCE_JOURNAL_ENTRY',
        sourceKey: 'organization:org_1:finance-journal:2026-06-01:2026-06-30',
        status: 'PENDING',
        createdBy: 'owner_1',
      }),
    }));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v3/company/1234567890/journalentry?minorversion=75'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"AccountRef":{"value":"75","name":"Field Rental Expense"}'),
      }),
    );
    expect(prismaMock.accountingSyncRecords.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SYNCED',
        externalTxnId: '148',
        externalTxnType: 'JournalEntry',
        externalTxnDocNumber: 'JE-26',
        intuitTid: 'tid-finance',
        syncedByUserId: 'owner_1',
      }),
    }));
    expect(payload.syncRecord.status).toBe('SYNCED');
    expect(payload.syncRecord.externalTxnId).toBe('148');
    expect(payload.preview.readyToSync).toBe(true);
  });

  it('saves QuickBooks category mappings for future finance line-item sync', async () => {
    const response = await updateQuickBooksCategoryMappings(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/category-mappings', {
        method: 'PATCH',
        body: JSON.stringify({
          mappings: [
            {
              category: 'Rentals',
              entryType: 'EXPENSE',
              accountExternalId: '75',
              accountName: 'Field Rental Expense',
              notes: 'Custom rental costs',
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.organizationFinanceCategoryAccountingMappings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        organizationId: 'org_1',
        provider: 'QUICKBOOKS_ONLINE',
        category: 'Rentals',
        categoryKey: 'rentals',
        entryType: 'EXPENSE',
        accountExternalId: '75',
        accountName: 'Field Rental Expense',
        notes: 'Custom rental costs',
        createdBy: 'owner_1',
      }),
      update: expect.objectContaining({
        accountExternalId: '75',
        accountName: 'Field Rental Expense',
        notes: 'Custom rental costs',
        isActive: true,
        updatedBy: 'owner_1',
      }),
    }));
    expect(payload.mappings[0].category).toBe('Rentals');
  });

  it('lists QuickBooks accounts for payroll mapping assistance', async () => {
    prismaMock.organizationAccountingConnections.findUnique.mockResolvedValue({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      status: 'CONNECTED',
      externalCompanyIdEncrypted: encryptSecret('1234567890'),
      accessTokenEncrypted: encryptSecret('access-token'),
      refreshTokenEncrypted: encryptSecret('refresh-token'),
      accessTokenExpiresAt: new Date('2099-06-10T20:00:00.000Z'),
      environment: 'sandbox',
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: new Headers({ intuit_tid: 'tid-accounts' }),
      json: async () => ({
        QueryResponse: {
          Account: [
            {
              Id: '62',
              Name: 'Payroll Expenses',
              FullyQualifiedName: 'Payroll Expenses',
              AccountType: 'Expense',
              AccountSubType: 'PayrollExpenses',
              Classification: 'Expense',
              Active: true,
            },
          ],
        },
      }),
    } as Response));

    const response = await listQuickBooksAccountsRoute(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/accounts'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accounts).toEqual([
      expect.objectContaining({
        id: '62',
        name: 'Payroll Expenses',
        accountType: 'Expense',
      }),
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v3/company/1234567890/query?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not clear local QuickBooks credentials when Intuit revocation fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.organizationAccountingConnections.findUnique.mockResolvedValue({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      refreshTokenEncrypted: encryptSecret('refresh-token'),
    });
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_request' }),
    } as Response));

    const response = await disconnectQuickBooks(
      new NextRequest('http://localhost/api/organizations/org_1/finance/integrations/quickbooks/disconnect', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe(
      'QuickBooks disconnect failed. QuickBooks tokens were not cleared because revocation could not be confirmed.',
    );
    expect(prismaMock.organizationAccountingConnections.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.organizationAccountingConnections.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastError: 'QuickBooks token revocation failed. Disconnect was not completed.',
      }),
    }));
    expect(consoleErrorSpy).toHaveBeenCalledWith('QuickBooks disconnect failed', {
      message: 'QuickBooks token revocation failed.',
    });
    consoleErrorSpy.mockRestore();
  });
});
