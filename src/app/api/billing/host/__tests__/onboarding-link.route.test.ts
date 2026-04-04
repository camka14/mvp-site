/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();

const accountsRetrieveMock = jest.fn();
const accountsCreateLoginLinkMock = jest.fn();
const accountLinksCreateMock = jest.fn();
const stripeAuthorizeUrlMock = jest.fn();
const stripeInstance = {
  accounts: {
    retrieve: accountsRetrieveMock,
    createLoginLink: accountsCreateLoginLinkMock,
  },
  accountLinks: {
    create: accountLinksCreateMock,
  },
  oauth: {
    authorizeUrl: stripeAuthorizeUrlMock,
  },
};
const StripeMock = jest.fn(() => stripeInstance);

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  stripeAccounts: {
    findFirst: jest.fn(),
  },
};

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
}));

import { POST } from '@/app/api/billing/host/onboarding-link/route';
import { parseConnectState } from '@/app/api/billing/host/stripeConnectState';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/host/onboarding-link', () => {
  const originalEnv = {
    PUBLIC_WEB_BASE_URL: process.env.PUBLIC_WEB_BASE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
    AUTH_SECRET: process.env.AUTH_SECRET,
    STRIPE_CONNECT_REDIRECT_URI: process.env.STRIPE_CONNECT_REDIRECT_URI,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageOrganizationMock.mockReturnValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({ ownerId: 'user_1', hostIds: [] });
    prismaMock.stripeAccounts.findFirst.mockResolvedValue(null);
    accountsRetrieveMock.mockReset();
    accountsCreateLoginLinkMock.mockReset();
    accountLinksCreateMock.mockReset();
    stripeAuthorizeUrlMock.mockReset();
  });

  afterEach(() => {
    if (originalEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;
    }

    if (originalEnv.PUBLIC_WEB_BASE_URL === undefined) {
      delete process.env.PUBLIC_WEB_BASE_URL;
    } else {
      process.env.PUBLIC_WEB_BASE_URL = originalEnv.PUBLIC_WEB_BASE_URL;
    }

    if (originalEnv.STRIPE_CONNECT_CLIENT_ID === undefined) {
      delete process.env.STRIPE_CONNECT_CLIENT_ID;
    } else {
      process.env.STRIPE_CONNECT_CLIENT_ID = originalEnv.STRIPE_CONNECT_CLIENT_ID;
    }

    if (originalEnv.AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
    }

    if (originalEnv.STRIPE_CONNECT_REDIRECT_URI === undefined) {
      delete process.env.STRIPE_CONNECT_REDIRECT_URI;
    } else {
      process.env.STRIPE_CONNECT_REDIRECT_URI = originalEnv.STRIPE_CONNECT_REDIRECT_URI;
    }
  });

  it('returns returnUrl when no connected account exists', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.onboardingUrl).toBe('http://localhost/profile?stripe=return');
    expect(accountsRetrieveMock).not.toHaveBeenCalled();
    expect(accountsCreateLoginLinkMock).not.toHaveBeenCalled();
    expect(accountLinksCreateMock).not.toHaveBeenCalled();
  });

  it('rewrites localhost management redirects onto the public dev origin', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://untarnished-berserkly-everette.ngrok-free.dev';
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'custom',
      livemode: false,
      controller: { stripe_dashboard: { type: 'none' } },
    });
    accountLinksCreateMock.mockResolvedValue({
      url: 'https://connect.stripe.com/account-links/acct_123',
      expires_at: 999,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );

    expect(response.status).toBe(200);
    expect(accountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=refresh',
        return_url: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=return',
      }),
    );
  });

  it('rewrites Android emulator management redirects onto the public dev origin', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://untarnished-berserkly-everette.ngrok-free.dev';
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'custom',
      livemode: false,
      controller: { stripe_dashboard: { type: 'none' } },
    });
    accountLinksCreateMock.mockResolvedValue({
      url: 'https://connect.stripe.com/account-links/acct_123',
      expires_at: 999,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://10.0.2.2:3000/profile?stripe=refresh',
        returnUrl: 'http://10.0.2.2:3000/profile?stripe=return',
      }),
    );

    expect(response.status).toBe(200);
    expect(accountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=refresh',
        return_url: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=return',
      }),
    );
  });

  it('returns Stripe Dashboard URL for standard connected accounts', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'standard',
      livemode: false,
      controller: { stripe_dashboard: { type: 'full' } },
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.onboardingUrl).toBe('https://dashboard.stripe.com/test/dashboard');
    expect(accountsCreateLoginLinkMock).not.toHaveBeenCalled();
    expect(accountLinksCreateMock).not.toHaveBeenCalled();
    expect(stripeAuthorizeUrlMock).not.toHaveBeenCalled();
  });

  it('uses createLoginLink for express connected accounts', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'express',
      livemode: false,
      controller: { stripe_dashboard: { type: 'express' } },
    });
    accountsCreateLoginLinkMock.mockResolvedValue({
      url: 'https://connect.stripe.com/express/acct_123/login_abc',
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.onboardingUrl).toBe('https://connect.stripe.com/express/acct_123/login_abc');
    expect(accountsCreateLoginLinkMock).toHaveBeenCalledWith('acct_123');
    expect(accountLinksCreateMock).not.toHaveBeenCalled();
    expect(stripeAuthorizeUrlMock).not.toHaveBeenCalled();
  });

  it('uses accountLinks.create for non-dashboard account types', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'custom',
      livemode: false,
      controller: { stripe_dashboard: { type: 'none' } },
    });
    accountLinksCreateMock.mockResolvedValue({
      url: 'https://connect.stripe.com/account-links/acct_123',
      expires_at: 999,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.onboardingUrl).toBe('https://connect.stripe.com/account-links/acct_123');
    expect(payload.expiresAt).toBe(999);
    expect(accountLinksCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_123',
        refresh_url: 'http://localhost/profile?stripe=refresh',
        return_url: 'http://localhost/profile?stripe=return',
        type: 'account_onboarding',
      }),
    );
    expect(accountsCreateLoginLinkMock).not.toHaveBeenCalled();
    expect(stripeAuthorizeUrlMock).not.toHaveBeenCalled();
  });

  it('falls back to OAuth authorize URL when management flow fails', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'custom',
      livemode: false,
      controller: { stripe_dashboard: { type: 'none' } },
    });
    accountLinksCreateMock.mockRejectedValue(new Error('accountLinks.create unsupported for this account type'));
    stripeAuthorizeUrlMock.mockImplementation((options: { state: string }) =>
      `https://connect.stripe.com/oauth/authorize?${new URLSearchParams({
        state: options.state,
      }).toString()}`,
    );

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1', email: 'user@example.com' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();
    const authorizeUrl = new URL(payload.onboardingUrl);
    const state = parseConnectState(authorizeUrl.searchParams.get('state') ?? '');

    expect(response.status).toBe(200);
    expect(payload.onboardingUrl).toContain('connect.stripe.com/oauth/authorize');
    expect(state).toEqual(
      expect.objectContaining({
        kind: 'user',
        ownerId: 'user_1',
        returnUrl: 'http://localhost/profile?stripe=return',
        refreshUrl: 'http://localhost/profile?stripe=refresh',
      }),
    );
    expect(accountLinksCreateMock).toHaveBeenCalled();
    expect(stripeAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'ca_test_123',
        state: authorizeUrl.searchParams.get('state'),
        redirect_uri: 'http://localhost/api/billing/host/callback',
      }),
    );
  });

  it('uses STRIPE_CONNECT_REDIRECT_URI in OAuth fallback when provided', async () => {
    process.env.STRIPE_CONNECT_REDIRECT_URI = 'https://bracket-iq.com/api/billing/host/callback';
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    accountsRetrieveMock.mockResolvedValue({
      type: 'custom',
      livemode: false,
      controller: { stripe_dashboard: { type: 'none' } },
    });
    accountLinksCreateMock.mockRejectedValue(new Error('accountLinks.create unsupported for this account type'));
    stripeAuthorizeUrlMock.mockImplementation((options: { state: string; redirect_uri?: string }) =>
      `https://connect.stripe.com/oauth/authorize?${new URLSearchParams({
        state: options.state,
        ...(options.redirect_uri ? { redirect_uri: options.redirect_uri } : {}),
      }).toString()}`,
    );

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        user: { id: 'user_1', email: 'user@example.com' },
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        returnUrl: 'http://localhost/profile?stripe=return',
      }),
    );
    const payload = await response.json();
    const authorizeUrl = new URL(payload.onboardingUrl);

    expect(response.status).toBe(200);
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe('https://bracket-iq.com/api/billing/host/callback');
    expect(stripeAuthorizeUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect_uri: 'https://bracket-iq.com/api/billing/host/callback',
      }),
    );
  });

  it('enforces organization owner/host permissions', async () => {
    canManageOrganizationMock.mockReturnValueOnce(false);
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_123' });
    prismaMock.organizations.findUnique.mockResolvedValue({ ownerId: 'owner_1', hostIds: [] });

    const response = await POST(
      jsonPost('http://localhost/api/billing/host/onboarding-link', {
        organization: { id: 'org_1' },
        refreshUrl: 'http://localhost/organizations/org_1?stripe=refresh',
        returnUrl: 'http://localhost/organizations/org_1?stripe=return',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(canManageOrganizationMock).toHaveBeenCalledWith({ userId: 'user_1', isAdmin: false }, {
      ownerId: 'owner_1',
      hostIds: [],
    });
  });
});
