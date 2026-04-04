/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();

const stripeAuthorizeUrlMock = jest.fn();
const stripeInstance = {
  oauth: {
    authorizeUrl: stripeAuthorizeUrlMock,
  },
};
const StripeMock = jest.fn(() => stripeInstance);

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    update: jest.fn(),
  },
  stripeAccounts: {
    upsert: jest.fn(),
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

import { POST } from '@/app/api/billing/host/connect/route';
import { parseConnectState } from '@/app/api/billing/host/stripeConnectState';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const buildStatefulBody = (options: {
  user?: Record<string, unknown>;
  organization?: Record<string, unknown>;
}) => ({
  ...options,
  returnUrl: 'http://localhost/profile?stripe=return',
  refreshUrl: 'http://localhost/profile?stripe=refresh',
});

describe('POST /api/billing/host/connect', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    PUBLIC_WEB_BASE_URL: process.env.PUBLIC_WEB_BASE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
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
    prismaMock.organizations.update.mockResolvedValue({ id: 'org_1' });
    prismaMock.userData.update.mockResolvedValue({ id: 'user_1' });
    prismaMock.stripeAccounts.upsert.mockResolvedValue({
      id: 'user_user_1',
      userId: 'user_1',
      accountId: 'acct_mock_user_1',
    });
    stripeAuthorizeUrlMock.mockImplementation((options: { client_id?: string; state: string; response_type?: string; scope?: string; redirect_uri?: string; stripe_user?: { email?: string } }) => {
      const params = new URLSearchParams({
        state: options.state,
      });
      if (options.client_id) {
        params.set('client_id', options.client_id);
      }
      if (options.response_type) {
        params.set('response_type', options.response_type);
      }
      if (options.scope) {
        params.set('scope', options.scope);
      }
      if (options.redirect_uri) {
        params.set('redirect_uri', options.redirect_uri);
      }
      if (options.stripe_user?.email) {
        params.set('stripe_user[email]', options.stripe_user.email);
      }
      return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
    });
    stripeInstance.oauth.authorizeUrl.mockClear();
  });

  afterEach(() => {
    if (originalEnv.AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
    }

    if (originalEnv.PUBLIC_WEB_BASE_URL === undefined) {
      delete process.env.PUBLIC_WEB_BASE_URL;
    } else {
      process.env.PUBLIC_WEB_BASE_URL = originalEnv.PUBLIC_WEB_BASE_URL;
    }

    if (originalEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;
    }

    if (originalEnv.STRIPE_CONNECT_CLIENT_ID === undefined) {
      delete process.env.STRIPE_CONNECT_CLIENT_ID;
    } else {
      process.env.STRIPE_CONNECT_CLIENT_ID = originalEnv.STRIPE_CONNECT_CLIENT_ID;
    }

    if (originalEnv.STRIPE_CONNECT_REDIRECT_URI === undefined) {
      delete process.env.STRIPE_CONNECT_REDIRECT_URI;
    } else {
      process.env.STRIPE_CONNECT_REDIRECT_URI = originalEnv.STRIPE_CONNECT_REDIRECT_URI;
    }
  });

  it('returns 401 when session is missing', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    const res = await POST(
      jsonPost('http://localhost/api/billing/host/connect', buildStatefulBody({ user: { id: 'user_1' } })),
    );

    expect(res.status).toBe(401);
  });

  it('returns 403 when current user cannot manage organization context', async () => {
    canManageOrganizationMock.mockReturnValueOnce(false);

    const res = await POST(
      jsonPost('http://localhost/api/billing/host/connect', {
        ...buildStatefulBody({ organization: { id: 'org_1' } }),
        organizationEmail: 'org@example.com',
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(canManageOrganizationMock).toHaveBeenCalledWith({ userId: 'user_1', isAdmin: false }, {
      ownerId: 'user_1',
      hostIds: [],
    });
  });

  it('returns a mock connect link in mock mode and stores mock account state', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const res = await POST(jsonPost('http://localhost/api/billing/host/connect', buildStatefulBody({ user: { id: 'user_1', email: 'user@example.com' } })));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.onboardingUrl).toBe('http://localhost/profile?stripe=return');
    expect(prismaMock.userData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ hasStripeAccount: true }),
      }),
    );
    expect(prismaMock.stripeAccounts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_user_1' },
        create: expect.objectContaining({
          id: 'user_user_1',
          userId: 'user_1',
          accountId: 'acct_mock_user_1',
          email: 'user@example.com',
        }),
        update: expect.objectContaining({
          accountId: 'acct_mock_user_1',
          email: 'user@example.com',
        }),
      }),
    );
  });

  it('returns OAuth authorize URL in live mode with a signed state', async () => {
    const res = await POST(jsonPost('http://localhost/api/billing/host/connect', buildStatefulBody({ user: { id: 'user_1', email: 'user@example.com' } })));
    const payload = await res.json();
    const authorizeUrl = new URL(payload.onboardingUrl);
    const state = parseConnectState(authorizeUrl.searchParams.get('state') ?? '');

    expect(res.status).toBe(200);
    expect(payload.onboardingUrl).toContain('connect.stripe.com/oauth/authorize');
    expect(state).toEqual(
      expect.objectContaining({
        kind: 'user',
        ownerId: 'user_1',
        returnUrl: 'http://localhost/profile?stripe=return',
        refreshUrl: 'http://localhost/profile?stripe=refresh',
      }),
    );
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('scope')).toBe('read_write');
    expect(authorizeUrl.searchParams.get('client_id')).toBe('ca_test_123');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe('http://localhost/api/billing/host/callback');
    expect(authorizeUrl.searchParams.get('stripe_user[email]')).toBe('user@example.com');
    expect(stripeInstance.oauth.authorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'ca_test_123',
        redirect_uri: 'http://localhost/api/billing/host/callback',
        state: authorizeUrl.searchParams.get('state'),
      }),
    );
  });

  it('uses STRIPE_CONNECT_REDIRECT_URI when provided', async () => {
    process.env.STRIPE_CONNECT_REDIRECT_URI = 'https://bracket-iq.com/api/billing/host/callback';

    const res = await POST(jsonPost('http://localhost/api/billing/host/connect', buildStatefulBody({ user: { id: 'user_1', email: 'user@example.com' } })));
    const payload = await res.json();
    const authorizeUrl = new URL(payload.onboardingUrl);

    expect(res.status).toBe(200);
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe('https://bracket-iq.com/api/billing/host/callback');
    expect(stripeInstance.oauth.authorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect_uri: 'https://bracket-iq.com/api/billing/host/callback',
      }),
    );
  });

  it('rewrites localhost redirect URLs onto the public dev origin', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://untarnished-berserkly-everette.ngrok-free.dev';

    const res = await POST(jsonPost('http://localhost/api/billing/host/connect', buildStatefulBody({ user: { id: 'user_1', email: 'user@example.com' } })));
    const payload = await res.json();
    const authorizeUrl = new URL(payload.onboardingUrl);
    const state = parseConnectState(authorizeUrl.searchParams.get('state') ?? '');

    expect(res.status).toBe(200);
    expect(state).toEqual(
      expect.objectContaining({
        returnUrl: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=return',
        refreshUrl: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=refresh',
      }),
    );
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'https://untarnished-berserkly-everette.ngrok-free.dev/api/billing/host/callback',
    );
  });

  it('rewrites Android emulator redirect URLs onto the public dev origin', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://untarnished-berserkly-everette.ngrok-free.dev';

    const res = await POST(
      jsonPost('http://localhost/api/billing/host/connect', {
        user: { id: 'user_1', email: 'user@example.com' },
        returnUrl: 'http://10.0.2.2:3000/profile?stripe=return',
        refreshUrl: 'http://10.0.2.2:3000/profile?stripe=refresh',
      }),
    );
    const payload = await res.json();
    const authorizeUrl = new URL(payload.onboardingUrl);
    const state = parseConnectState(authorizeUrl.searchParams.get('state') ?? '');

    expect(res.status).toBe(200);
    expect(state).toEqual(
      expect.objectContaining({
        returnUrl: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=return',
        refreshUrl: 'https://untarnished-berserkly-everette.ngrok-free.dev/profile?stripe=refresh',
      }),
    );
  });

  it('validates return/refresh URLs to be same-origin', async () => {
    const res = await POST(
      jsonPost('http://localhost/api/billing/host/connect', {
        returnUrl: 'https://evil.local/return',
        refreshUrl: 'http://localhost/profile?stripe=refresh',
      }),
    );

    expect(res.status).toBe(400);
  });
});
