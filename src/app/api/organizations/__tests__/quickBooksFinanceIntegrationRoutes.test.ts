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
};
const requireSessionMock = jest.fn();
const canManageOrganizationFinanceMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));
jest.mock('@/server/finance/financeAccess', () => ({
  canManageOrganizationFinance: (...args: unknown[]) => canManageOrganizationFinanceMock(...args),
}));

import { POST as connectQuickBooks } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/connect/route';
import { POST as disconnectQuickBooks } from '@/app/api/organizations/[id]/finance/integrations/quickbooks/disconnect/route';
import { parseQuickBooksState } from '@/server/integrations/quickBooksConnection';

describe('QuickBooks organization finance integration routes', () => {
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
    });
    prismaMock.organizationAccountingConnections.update.mockImplementation(async ({ data }) => ({
      id: 'qbo_1',
      provider: 'QUICKBOOKS_ONLINE',
      organizationId: 'org_1',
      environment: 'sandbox',
      scopes: [],
      ...data,
    }));
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
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        disconnectedByUserId: 'owner_1',
      }),
    }));
    expect(payload.connection.status).toBe('DISCONNECTED');
  });
});
