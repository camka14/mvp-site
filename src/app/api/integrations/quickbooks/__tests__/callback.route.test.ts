/** @jest-environment node */

import { NextRequest } from 'next/server';

const upsertMock = jest.fn();
const prismaMock = {
  organizationAccountingConnections: {
    upsert: upsertMock,
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/integrations/quickbooks/callback/route';
import { createQuickBooksState } from '@/server/integrations/quickBooksConnection';

describe('QuickBooks OAuth callback route', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID,
    INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET,
    INTUIT_REDIRECT_URI: process.env.INTUIT_REDIRECT_URI,
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.INTUIT_CLIENT_ID = 'intuit-client-id';
    process.env.INTUIT_CLIENT_SECRET = 'intuit-client-secret';
    delete process.env.INTUIT_REDIRECT_URI;
    upsertMock.mockImplementation(async ({ create, update }) => ({
      ...create,
      ...update,
      updatedAt: new Date('2026-06-10T19:00:00.000Z'),
    }));
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        x_refresh_token_expires_in: 8640000,
        x_refresh_token_hard_expires_in: 157680000,
        scope: 'com.intuit.quickbooks.accounting',
      }),
    } as Response));
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

  it('exchanges the code, stores encrypted tokens, and redirects to the finance tab', async () => {
    const state = createQuickBooksState(
      'org_1',
      'owner_1',
      'http://localhost/organizations/org_1/finance',
      'http://localhost/organizations/org_1/finance',
    );
    const url = new URL('http://localhost/api/integrations/quickbooks/callback');
    url.searchParams.set('code', 'auth-code');
    url.searchParams.set('realmId', '1234567890');
    url.searchParams.set('state', state);

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/organizations/org_1/finance?quickbooks=return');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        organizationId: 'org_1',
        provider: 'QUICKBOOKS_ONLINE',
        externalCompanyId: '1234567890',
        connectedByUserId: 'owner_1',
        accessTokenEncrypted: expect.not.stringContaining('access-token'),
        refreshTokenEncrypted: expect.not.stringContaining('refresh-token'),
      }),
      update: expect.objectContaining({
        externalCompanyId: '1234567890',
        connectedByUserId: 'owner_1',
      }),
    }));
  });

  it('redirects to an error when state is invalid', async () => {
    const url = new URL('http://localhost/api/integrations/quickbooks/callback');
    url.searchParams.set('code', 'auth-code');
    url.searchParams.set('realmId', '1234567890');
    url.searchParams.set('state', 'bad-state');

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/?quickbooks=error&reason=invalid_state');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('redirects to refresh URL when token exchange fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error_description: 'invalid grant' }),
    } as Response));
    const state = createQuickBooksState(
      'org_1',
      'owner_1',
      'http://localhost/organizations/org_1/finance',
      'http://localhost/organizations/org_1/finance',
    );
    const url = new URL('http://localhost/api/integrations/quickbooks/callback');
    url.searchParams.set('code', 'auth-code');
    url.searchParams.set('realmId', '1234567890');
    url.searchParams.set('state', state);

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/organizations/org_1/finance?quickbooks=error&reason=token_exchange_failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('QuickBooks OAuth callback failed', expect.any(Error));
    expect(upsertMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
