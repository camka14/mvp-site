/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organizationAccountingConnections: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { decryptSecret, encryptSecret } from '@/server/integrations/secretCrypto';
import {
  buildQuickBooksAuthorizeUrl,
  createQuickBooksState,
  decryptQuickBooksRealmId,
  disconnectQuickBooksConnection,
  getQuickBooksApiConnection,
  listQuickBooksAccounts,
  parseQuickBooksState,
  quickBooksApiFetch,
  QUICKBOOKS_PROVIDER,
  upsertQuickBooksConnection,
} from '@/server/integrations/quickBooksConnection';

describe('secretCrypto', () => {
  it('encrypts and decrypts secrets without storing plaintext', () => {
    const encrypted = encryptSecret('refresh-token-123', 'test-key');

    expect(encrypted).not.toContain('refresh-token-123');
    expect(decryptSecret(encrypted, 'test-key')).toBe('refresh-token-123');
  });
});

describe('quickBooksConnection helpers', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
    INTUIT_SCOPES: process.env.INTUIT_SCOPES,
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    process.env.INTUIT_SCOPES = 'com.intuit.quickbooks.accounting';
  });

  afterEach(() => {
    if (originalEnv.AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
    }
    if (originalEnv.INTUIT_CLIENT_ID === undefined) {
      delete process.env.INTUIT_CLIENT_ID;
    } else {
      process.env.INTUIT_CLIENT_ID = originalEnv.INTUIT_CLIENT_ID;
    }
    if (originalEnv.INTUIT_CLIENT_SECRET === undefined) {
      delete process.env.INTUIT_CLIENT_SECRET;
    } else {
      process.env.INTUIT_CLIENT_SECRET = originalEnv.INTUIT_CLIENT_SECRET;
    }
    if (originalEnv.INTUIT_ENVIRONMENT === undefined) {
      delete process.env.INTUIT_ENVIRONMENT;
    } else {
      process.env.INTUIT_ENVIRONMENT = originalEnv.INTUIT_ENVIRONMENT;
    }
    if (originalEnv.INTUIT_SCOPES === undefined) {
      delete process.env.INTUIT_SCOPES;
    } else {
      process.env.INTUIT_SCOPES = originalEnv.INTUIT_SCOPES;
    }
  });

  it('creates parseable signed state and QuickBooks authorization URLs', () => {
    const state = createQuickBooksState(
      'org_1',
      'user_1',
      'http://localhost:3000/organizations/org_1/finance',
      'http://localhost:3000/organizations/org_1/finance',
    );
    const parsed = parseQuickBooksState(state);

    expect(parsed).toEqual(expect.objectContaining({
      organizationId: 'org_1',
      userId: 'user_1',
      returnUrl: 'http://localhost:3000/organizations/org_1/finance',
    }));

    const url = new URL(buildQuickBooksAuthorizeUrl({
      clientId: 'intuit-client-id',
      redirectUri: 'https://example.com/api/integrations/quickbooks/callback',
      scopes: ['com.intuit.quickbooks.accounting'],
      state,
    }));

    expect(url.origin + url.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(url.searchParams.get('client_id')).toBe('intuit-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/api/integrations/quickbooks/callback');
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('upserts QuickBooks connections with encrypted tokens and sanitized output', async () => {
    const upsertMock = jest.fn(async ({ create, update }) => ({
      ...create,
      ...update,
      updatedAt: new Date('2026-06-10T19:00:00.000Z'),
    }));
    const updateManyMock = jest.fn();
    const client = {
      organizationAccountingConnections: {
        upsert: upsertMock,
      },
      accountingSyncRecords: {
        updateMany: updateManyMock,
      },
    };

    const connection = await upsertQuickBooksConnection({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      realmId: '1234567890',
      now: new Date('2026-06-10T19:00:00.000Z'),
      token: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        x_refresh_token_expires_in: 8640000,
        x_refresh_token_hard_expires_in: 157680000,
        scope: 'com.intuit.quickbooks.accounting',
      },
      client,
    });

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId_provider: {
          organizationId: 'org_1',
          provider: QUICKBOOKS_PROVIDER,
        },
      },
      create: expect.objectContaining({
        organizationId: 'org_1',
        provider: QUICKBOOKS_PROVIDER,
        externalCompanyId: null,
        externalCompanyIdEncrypted: expect.not.stringContaining('1234567890'),
        accessTokenEncrypted: expect.not.stringContaining('access-token'),
        refreshTokenEncrypted: expect.not.stringContaining('refresh-token'),
      }),
      update: expect.objectContaining({
        status: 'CONNECTED',
        externalCompanyId: null,
        externalCompanyIdEncrypted: expect.not.stringContaining('1234567890'),
        connectedByUserId: 'owner_1',
      }),
    }));
    const upsertCall = upsertMock.mock.calls[0][0];
    expect(decryptQuickBooksRealmId(upsertCall.update)).toBe('1234567890');
    expect(connection).toEqual(expect.objectContaining({
      provider: QUICKBOOKS_PROVIDER,
      status: 'CONNECTED',
      externalCompanyId: null,
      scopes: ['com.intuit.quickbooks.accounting'],
      accessTokenExpiresAt: '2026-06-10T20:00:00.000Z',
    }));
    expect(JSON.stringify(connection)).not.toContain('access-token');
    expect(JSON.stringify(connection)).not.toContain('refresh-token');
    expect(JSON.stringify(connection)).not.toContain('1234567890');
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        provider: QUICKBOOKS_PROVIDER,
        status: 'REAUTH_REQUIRED',
      },
      data: {
        status: 'FAILED',
        errorCode: 'READY_TO_RETRY',
        errorMessage: 'QuickBooks reconnected. Retry sync.',
        updatedBy: 'owner_1',
      },
    });
  });

  it('queries and sanitizes active QuickBooks accounts for mapping choices', async () => {
    const updateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: QUICKBOOKS_PROVIDER,
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qbo_1',
          status: 'CONNECTED',
          provider: QUICKBOOKS_PROVIDER,
          externalCompanyIdEncrypted: encryptSecret('1234567890'),
          accessTokenEncrypted: encryptSecret('access-token'),
          refreshTokenEncrypted: encryptSecret('refresh-token'),
          accessTokenExpiresAt: new Date('2099-06-10T20:00:00.000Z'),
          environment: 'sandbox',
        }),
        update: updateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
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
              AcctNum: '6005',
              Active: true,
            },
            {
              Id: '41',
              Name: 'Payroll Clearing',
              AccountType: 'Other Current Liability',
              AccountSubType: 'OtherCurrentLiabilities',
              Classification: 'Liability',
              Active: true,
            },
          ],
        },
      }),
    } as Response));

    const accounts = await listQuickBooksAccounts({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
    });

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://sandbox-quickbooks.api.intuit.com/v3/company/1234567890/query');
    expect(calledUrl.searchParams.get('query')).toBe('SELECT * FROM Account WHERE Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000');
    expect(accounts).toEqual([
      expect.objectContaining({
        id: '62',
        name: 'Payroll Expenses',
        displayName: '6005 · Payroll Expenses · Expense · PayrollExpenses',
        accountType: 'Expense',
        active: true,
      }),
      expect.objectContaining({
        id: '41',
        name: 'Payroll Clearing',
        displayName: 'Payroll Clearing · Other Current Liability · OtherCurrentLiabilities',
        accountType: 'Other Current Liability',
        active: true,
      }),
    ]);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastIntuitTid: 'tid-accounts',
        lastError: null,
      }),
    }));
  });

  it('revokes QuickBooks tokens before disconnecting and clearing credentials', async () => {
    const findUniqueMock = jest.fn().mockResolvedValue({
      id: 'qbo_1',
      refreshTokenEncrypted: encryptSecret('refresh-token'),
    });
    const updateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: QUICKBOOKS_PROVIDER,
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: findUniqueMock,
        update: updateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    } as Response));

    const connection = await disconnectQuickBooksConnection({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ token: 'refresh-token' }),
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
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
    expect(connection?.status).toBe('DISCONNECTED');
  });

  it('does not clear local QuickBooks credentials when token revocation fails', async () => {
    const findUniqueMock = jest.fn().mockResolvedValue({
      id: 'qbo_1',
      refreshTokenEncrypted: encryptSecret('refresh-token'),
    });
    const updateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: QUICKBOOKS_PROVIDER,
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: findUniqueMock,
        update: updateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_request' }),
    } as Response));

    await expect(disconnectQuickBooksConnection({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
    })).rejects.toThrow('QuickBooks token revocation failed.');

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastError: 'QuickBooks token revocation failed. Disconnect was not completed.',
        updatedBy: 'owner_1',
      }),
    }));
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
      }),
    }));
  });

  it('captures Intuit TID from successful QuickBooks API responses', async () => {
    const updateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: QUICKBOOKS_PROVIDER,
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qbo_1',
          status: 'CONNECTED',
          environment: 'sandbox',
          externalCompanyIdEncrypted: encryptSecret('1234567890'),
          accessTokenEncrypted: encryptSecret('access-token'),
          refreshTokenEncrypted: encryptSecret('refresh-token'),
          accessTokenExpiresAt: new Date('2099-06-10T20:00:00.000Z'),
        }),
        update: updateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ intuit_tid: 'tid-123' }),
      json: async () => ({ JournalEntry: { Id: '987' } }),
    } as Response));

    const result = await quickBooksApiFetch({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      path: '/journalentry',
      method: 'POST',
      body: { Line: [] },
      client,
      fetchImpl: fetchMock,
    });

    expect(result.intuitTid).toBe('tid-123');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://sandbox-quickbooks.api.intuit.com/v3/company/1234567890/journalentry?minorversion=75'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastIntuitTid: 'tid-123',
        lastError: null,
        lastSyncedAt: expect.any(Date),
      }),
    }));
  });

  it('marks the connection reauth required when refresh returns invalid_grant', async () => {
    const updateMock = jest.fn(async ({ data }) => ({
      id: 'qbo_1',
      provider: QUICKBOOKS_PROVIDER,
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
    const client = {
      organizationAccountingConnections: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qbo_1',
          status: 'CONNECTED',
          environment: 'sandbox',
          externalCompanyIdEncrypted: encryptSecret('1234567890'),
          accessTokenEncrypted: encryptSecret('expired-access-token'),
          refreshTokenEncrypted: encryptSecret('refresh-token'),
          accessTokenExpiresAt: new Date('2026-06-10T18:00:00.000Z'),
        }),
        update: updateMock,
      },
    };
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 400,
      headers: new Headers({ intuit_tid: 'tid-refresh' }),
      json: async () => ({ error: 'invalid_grant' }),
    } as Response));

    await expect(getQuickBooksApiConnection({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      client,
      fetchImpl: fetchMock,
      now: new Date('2026-06-10T19:00:00.000Z'),
    })).rejects.toThrow('QuickBooks token request failed.');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'REAUTH_REQUIRED',
        lastError: 'QuickBooks authorization expired. Reconnect QuickBooks to continue.',
        lastErrorAt: expect.any(Date),
        lastIntuitTid: 'tid-refresh',
        updatedBy: 'owner_1',
      }),
    }));
  });
});
