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
  disconnectQuickBooksConnection,
  parseQuickBooksState,
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
    INTUIT_ENVIRONMENT: process.env.INTUIT_ENVIRONMENT,
    INTUIT_SCOPES: process.env.INTUIT_SCOPES,
  };

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    process.env.INTUIT_SCOPES = 'com.intuit.quickbooks.accounting';
  });

  afterEach(() => {
    if (originalEnv.AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
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
    const client = {
      organizationAccountingConnections: {
        upsert: upsertMock,
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
        accessTokenEncrypted: expect.not.stringContaining('access-token'),
        refreshTokenEncrypted: expect.not.stringContaining('refresh-token'),
      }),
      update: expect.objectContaining({
        status: 'CONNECTED',
        externalCompanyId: '1234567890',
        connectedByUserId: 'owner_1',
      }),
    }));
    expect(connection).toEqual(expect.objectContaining({
      provider: QUICKBOOKS_PROVIDER,
      status: 'CONNECTED',
      externalCompanyId: '1234567890',
      scopes: ['com.intuit.quickbooks.accounting'],
      accessTokenExpiresAt: '2026-06-10T20:00:00.000Z',
    }));
    expect(JSON.stringify(connection)).not.toContain('access-token');
    expect(JSON.stringify(connection)).not.toContain('refresh-token');
  });

  it('disconnects QuickBooks connections and clears tokens', async () => {
    const findUniqueMock = jest.fn().mockResolvedValue({ id: 'qbo_1' });
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

    const connection = await disconnectQuickBooksConnection({
      organizationId: 'org_1',
      actingUserId: 'owner_1',
      client,
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'DISCONNECTED',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        disconnectedByUserId: 'owner_1',
      }),
    }));
    expect(connection?.status).toBe('DISCONNECTED');
  });
});
