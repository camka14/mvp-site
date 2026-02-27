/** @jest-environment node */

import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const stripeTokenMock = jest.fn();
const stripeInstance = {
  oauth: {
    token: stripeTokenMock,
  },
};
const StripeMock = jest.fn(() => stripeInstance);

const prismaMock = {
  organizations: {
    update: jest.fn(),
  },
  userData: {
    update: jest.fn(),
  },
  stripeAccounts: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
    callback({
      organizations: prismaMock.organizations,
      userData: prismaMock.userData,
      stripeAccounts: prismaMock.stripeAccounts,
    }),
  ),
};

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET } from '@/app/api/billing/host/callback/route';
import { createConnectState } from '@/app/api/billing/host/stripeConnectState';

const makeGetRequest = (url: string) =>
  new NextRequest(url, {
    method: 'GET',
  });

describe('GET /api/billing/host/callback', () => {
  const originalEnv = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    prismaMock.organizations.update.mockResolvedValue({ id: 'org_1' });
    prismaMock.userData.update.mockResolvedValue({ id: 'user_1' });
    prismaMock.stripeAccounts.upsert.mockResolvedValue({
      id: 'user_user_1',
      userId: 'user_1',
      accountId: 'acct_123',
    });
    stripeTokenMock.mockResolvedValue({ stripe_user_id: 'acct_123' });
  });

  afterEach(() => {
    if (originalEnv.AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalEnv.AUTH_SECRET;
    }

    if (originalEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;
    }
  });

  it('redirects to refresh flow on missing or invalid state', async () => {
    const missingStateRes = await GET(makeGetRequest('http://localhost/api/billing/host/callback?code=auth_code'));
    const missingStateLocation = new URL(missingStateRes.headers.get('location') ?? '/');
    expect(missingStateRes.status).toBe(302);
    expect(missingStateLocation.pathname).toBe('/');
    expect(missingStateLocation.searchParams.get('stripe')).toBe('error');

    const invalidStateRes = await GET(makeGetRequest('http://localhost/api/billing/host/callback?code=auth_code&state=not-a-valid-state'));
    const invalidStateLocation = new URL(invalidStateRes.headers.get('location') ?? '/');
    expect(invalidStateRes.status).toBe(302);
    expect(invalidStateLocation.pathname).toBe('/');
    expect(invalidStateLocation.searchParams.get('stripe')).toBe('error');
  });

  it('redirects to refresh URL when Stripe returns an error', async () => {
    const state = createConnectState('user', 'user_1', 'http://localhost/profile?stripe=return', 'http://localhost/profile?stripe=refresh');
    const encodedState = encodeURIComponent(state);

    const res = await GET(
      makeGetRequest(`http://localhost/api/billing/host/callback?error=access_denied&state=${encodedState}`),
    );

    const redirect = new URL(res.headers.get('location') ?? '/');

    expect(res.status).toBe(302);
    expect(redirect.pathname).toBe('/profile');
    expect(redirect.searchParams.get('stripe')).toBe('error');
    expect(redirect.searchParams.get('reason')).toBe('access_denied');
  });

  it('writes the accountId and enables hasStripeAccount for valid code exchange', async () => {
    const state = createConnectState('user', 'user_1', 'http://localhost/profile?stripe=return', 'http://localhost/profile?stripe=refresh');

    const res = await GET(makeGetRequest(`http://localhost/api/billing/host/callback?code=auth_code&state=${state}`));
    const redirect = new URL(res.headers.get('location') ?? '/');

    expect(res.status).toBe(302);
    expect(redirect.pathname).toBe('/profile');
    expect(redirect.searchParams.get('stripe')).toBe('return');
    expect(stripeTokenMock).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'auth_code',
    });
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
          accountId: 'acct_123',
        }),
        update: expect.objectContaining({
          accountId: 'acct_123',
          userId: 'user_1',
        }),
      }),
    );
  });

  it('writes the accountId and enables hasStripeAccount for organization code exchange', async () => {
    const state = createConnectState('organization', 'org_1', 'http://localhost/organizations/org_1?stripe=return', 'http://localhost/organizations/org_1?stripe=refresh');

    const res = await GET(makeGetRequest(`http://localhost/api/billing/host/callback?code=auth_code&state=${state}`));
    const redirect = new URL(res.headers.get('location') ?? '/');

    expect(res.status).toBe(302);
    expect(redirect.pathname).toBe('/organizations/org_1');
    expect(redirect.searchParams.get('stripe')).toBe('return');
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
        data: expect.objectContaining({ hasStripeAccount: true }),
      }),
    );
    expect(prismaMock.stripeAccounts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_org_1' },
        create: expect.objectContaining({
          id: 'org_org_1',
          organizationId: 'org_1',
          accountId: 'acct_123',
        }),
        update: expect.objectContaining({
          accountId: 'acct_123',
          organizationId: 'org_1',
        }),
      }),
    );
  });

  it('redirects to error for expired or malformed OAuth state token', async () => {
    const expiredState = jwt.sign(
      {
        kind: 'user',
        ownerId: 'user_1',
        returnUrl: 'http://localhost/profile?stripe=return',
        refreshUrl: 'http://localhost/profile?stripe=refresh',
        nonce: 'expired',
      },
      'test-auth-secret',
      { expiresIn: '-1s' },
    );

    const res = await GET(makeGetRequest(`http://localhost/api/billing/host/callback?code=auth_code&state=${expiredState}`));
    const redirect = new URL(res.headers.get('location') ?? '/');

    expect(res.status).toBe(302);
    expect(redirect.pathname).toBe('/');
    expect(redirect.searchParams.get('stripe')).toBe('error');
  });
});
