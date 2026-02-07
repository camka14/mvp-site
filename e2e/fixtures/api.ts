import { APIRequestContext, APIResponse, expect, request as playwrightRequest, test as base } from '@playwright/test';
import { SEED_USERS as RAW_SEED_USERS } from '../../prisma/seed-data';

type SeedUserRole = 'host' | 'participant';

type SeedUser = {
  role: SeedUserRole;
  email: string;
  password: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  userName?: string;
};

type BypassAuthResult = {
  token: string;
  headers: Record<string, string>;
  cookie: string;
  response: APIResponse;
};

type ApiFixtures = {
  bypassAuth: (role?: SeedUserRole, options?: { mode?: 'header' | 'cookie' }) => Promise<BypassAuthResult>;
  hostApi: APIRequestContext;
  participantApi: APIRequestContext;
};

const DEFAULT_BASE_URL = 'http://localhost:3000';
const AUTH_COOKIE_NAME = 'auth_token';

export const SEED_USERS: Record<SeedUserRole, SeedUser> = {
  host: { role: 'host', ...RAW_SEED_USERS.host },
  participant: { role: 'participant', ...RAW_SEED_USERS.participant },
};

export const resolveBaseUrl = (): string =>
  process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL;

const loginViaApi = async (context: APIRequestContext, user: SeedUser): Promise<BypassAuthResult> => {
  const response = await context.post('/api/auth/login', {
    data: {
      email: user.email,
      password: user.password,
    },
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new Error(`Login failed for ${user.role} (${response.status()}): ${body}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { token?: string };
  if (!payload.token) {
    throw new Error(`Login response missing token for ${user.role}`);
  }

  const token = payload.token;
  const cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`;

  return {
    token,
    cookie,
    headers: { Authorization: `Bearer ${token}` },
    response,
  };
};

const buildBypassHeaders = async (
  context: APIRequestContext,
  user: SeedUser,
  mode: 'header' | 'cookie',
): Promise<BypassAuthResult> => {
  const result = await loginViaApi(context, user);
  if (mode === 'cookie') {
    return {
      ...result,
      headers: { Cookie: result.cookie },
    };
  }
  return result;
};

export const test = base.extend<ApiFixtures>({
  bypassAuth: async ({}, use) => {
    await use(async (role = 'host', options) => {
      const user = SEED_USERS[role];
      const mode = options?.mode ?? 'header';
      const context = await playwrightRequest.newContext({ baseURL: resolveBaseUrl() });
      try {
        return await buildBypassHeaders(context, user, mode);
      } finally {
        await context.dispose();
      }
    });
  },
  hostApi: async ({ bypassAuth }, use) => {
    const { headers } = await bypassAuth('host');
    const context = await playwrightRequest.newContext({
      baseURL: resolveBaseUrl(),
      extraHTTPHeaders: headers,
    });
    await use(context);
    await context.dispose();
  },
  participantApi: async ({ bypassAuth }, use) => {
    const { headers } = await bypassAuth('participant');
    const context = await playwrightRequest.newContext({
      baseURL: resolveBaseUrl(),
      extraHTTPHeaders: headers,
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };
export type { SeedUser, SeedUserRole, BypassAuthResult };
