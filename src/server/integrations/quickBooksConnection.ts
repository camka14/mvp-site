import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/server/integrations/secretCrypto';

type PrismaLike = any;

type FetchLike = typeof fetch;

export const QUICKBOOKS_PROVIDER = 'QUICKBOOKS_ONLINE' as const;
export const QUICKBOOKS_CALLBACK_PATH = '/api/integrations/quickbooks/callback';
const QUICKBOOKS_AUTHORIZATION_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_DEFAULT_SCOPE = 'com.intuit.quickbooks.accounting';
const QUICKBOOKS_STATE_TTL_SECONDS = 10 * 60;
const QUICKBOOKS_STATE_AUDIENCE = 'bracketiq-quickbooks';
const QUICKBOOKS_STATE_ISSUER = 'bracketiq';
const CANONICAL_HOSTS: Record<string, string> = {
  'www.bracket-iq.com': 'bracket-iq.com',
};

export type QuickBooksConnectionStatus = {
  id: string;
  provider: typeof QUICKBOOKS_PROVIDER;
  status: 'CONNECTED' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  externalCompanyId: string | null;
  externalCompanyName: string | null;
  environment: string;
  scopes: string[];
  tokenType: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  refreshTokenHardExpiresAt: string | null;
  connectedAt: string | null;
  connectedByUserId: string | null;
  disconnectedAt: string | null;
  disconnectedByUserId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type QuickBooksStatePayload = {
  organizationId: string;
  userId: string;
  returnUrl: string;
  refreshUrl: string;
  nonce: string;
};

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  x_refresh_token_hard_expires_in?: number;
  scope?: string;
};

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const normalizeAbsoluteUrl = (value: string | undefined | null): string | null => {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
};

const canonicalizeUrl = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const canonicalHost = CANONICAL_HOSTS[parsed.hostname.toLowerCase()];
    if (canonicalHost) {
      parsed.hostname = canonicalHost;
    }
    return parsed.toString();
  } catch {
    return value;
  }
};

const configuredRedirectUri = (): string | null => (
  canonicalizeUrl(normalizeAbsoluteUrl(process.env.INTUIT_REDIRECT_URI))
);

export const getQuickBooksCallbackUrl = (origin: string): string => {
  const configured = configuredRedirectUri();
  if (configured) {
    return configured;
  }
  const base = new URL(canonicalizeUrl(origin) ?? origin);
  base.pathname = QUICKBOOKS_CALLBACK_PATH;
  base.search = '';
  base.hash = '';
  return base.toString();
};

export const sanitizeSameOriginUrl = (value: string | null | undefined, origin: string): string | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const requestOrigin = new URL(canonicalizeUrl(origin) ?? origin);
    const parsedOrigin = new URL(canonicalizeUrl(parsed.origin) ?? parsed.origin);
    if (parsedOrigin.origin !== requestOrigin.origin) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const getQuickBooksEnvironment = (): string => {
  const normalized = process.env.INTUIT_ENVIRONMENT?.trim().toLowerCase();
  return normalized === 'production' ? 'production' : 'sandbox';
};

export const getQuickBooksScopes = (): string[] => {
  const raw = process.env.INTUIT_SCOPES?.trim() || QUICKBOOKS_DEFAULT_SCOPE;
  return Array.from(new Set(raw.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)));
};

export const createQuickBooksState = (
  organizationId: string,
  userId: string,
  returnUrl: string,
  refreshUrl: string,
): string => {
  const payload = {
    organizationId,
    userId,
    returnUrl,
    refreshUrl,
    nonce: crypto.randomBytes(8).toString('hex'),
  } satisfies QuickBooksStatePayload;

  return jwt.sign(payload, getAuthSecret(), {
    audience: QUICKBOOKS_STATE_AUDIENCE,
    issuer: QUICKBOOKS_STATE_ISSUER,
    expiresIn: `${QUICKBOOKS_STATE_TTL_SECONDS}s`,
  });
};

export const parseQuickBooksState = (token: string): QuickBooksStatePayload | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      audience: QUICKBOOKS_STATE_AUDIENCE,
      issuer: QUICKBOOKS_STATE_ISSUER,
      maxAge: `${QUICKBOOKS_STATE_TTL_SECONDS}s`,
      algorithms: ['HS256'],
    }) as JwtPayload & Partial<QuickBooksStatePayload>;

    if (!decoded || typeof decoded !== 'object') {
      return null;
    }
    const organizationId = decoded.organizationId;
    const userId = decoded.userId;
    const returnUrl = decoded.returnUrl;
    const refreshUrl = decoded.refreshUrl;
    const nonce = decoded.nonce;
    if (
      typeof organizationId !== 'string'
      || !organizationId
      || typeof userId !== 'string'
      || !userId
      || typeof returnUrl !== 'string'
      || !returnUrl
      || typeof refreshUrl !== 'string'
      || !refreshUrl
      || typeof nonce !== 'string'
      || !nonce
    ) {
      return null;
    }
    return { organizationId, userId, returnUrl, refreshUrl, nonce };
  } catch {
    return null;
  }
};

export const appendQuickBooksResultQuery = (
  target: string,
  result: 'return' | 'error',
  options?: { reason?: string },
): string => {
  const parsed = new URL(target);
  parsed.searchParams.set('quickbooks', result);
  if (options?.reason) {
    parsed.searchParams.set('reason', options.reason);
  }
  return parsed.toString();
};

export const buildQuickBooksAuthorizeUrl = ({
  clientId,
  redirectUri,
  scopes,
  state,
}: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string => {
  const url = new URL(QUICKBOOKS_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
};

const getCredentials = (): { clientId: string; clientSecret: string } => {
  const clientId = process.env.INTUIT_CLIENT_ID?.trim();
  const clientSecret = process.env.INTUIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET are required.');
  }
  return { clientId, clientSecret };
};

const addSeconds = (base: Date, seconds?: number): Date | null => {
  if (!Number.isFinite(seconds) || Number(seconds) <= 0) {
    return null;
  }
  return new Date(base.getTime() + Number(seconds) * 1000);
};

const parseTokenResponse = (payload: unknown): QuickBooksTokenResponse => {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const accessToken = typeof record.access_token === 'string' ? record.access_token.trim() : '';
  const refreshToken = typeof record.refresh_token === 'string' ? record.refresh_token.trim() : '';
  if (!accessToken || !refreshToken) {
    throw new Error('QuickBooks token response is missing tokens.');
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: typeof record.token_type === 'string' ? record.token_type : undefined,
    expires_in: typeof record.expires_in === 'number' ? record.expires_in : undefined,
    x_refresh_token_expires_in: typeof record.x_refresh_token_expires_in === 'number' ? record.x_refresh_token_expires_in : undefined,
    x_refresh_token_hard_expires_in: typeof record.x_refresh_token_hard_expires_in === 'number' ? record.x_refresh_token_hard_expires_in : undefined,
    scope: typeof record.scope === 'string' ? record.scope : undefined,
  };
};

const postTokenRequest = async (
  body: URLSearchParams,
  fetchImpl: FetchLike = fetch,
): Promise<QuickBooksTokenResponse> => {
  const { clientId, clientSecret } = getCredentials();
  const response = await fetchImpl(QUICKBOOKS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-include-refresh-token-hard-expires-in': 'true',
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorDescription = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).error_description
      : null;
    throw new Error(typeof errorDescription === 'string' && errorDescription.trim()
      ? errorDescription
      : 'QuickBooks token request failed.');
  }
  return parseTokenResponse(payload);
};

export const exchangeQuickBooksAuthorizationCode = async ({
  code,
  redirectUri,
  fetchImpl,
}: {
  code: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<QuickBooksTokenResponse> => {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  return postTokenRequest(body, fetchImpl);
};

export const refreshQuickBooksTokens = async (
  refreshToken: string,
  fetchImpl?: FetchLike,
): Promise<QuickBooksTokenResponse> => {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  return postTokenRequest(body, fetchImpl);
};

const scopesFromToken = (token: QuickBooksTokenResponse): string[] => (
  token.scope?.trim()
    ? Array.from(new Set(token.scope.trim().split(/\s+/).filter(Boolean)))
    : getQuickBooksScopes()
);

export const sanitizeAccountingConnection = (row: any): QuickBooksConnectionStatus => ({
  id: row.id,
  provider: QUICKBOOKS_PROVIDER,
  status: row.status,
  externalCompanyId: row.externalCompanyId ?? null,
  externalCompanyName: row.externalCompanyName ?? null,
  environment: row.environment ?? 'sandbox',
  scopes: Array.isArray(row.scopes) ? row.scopes : [],
  tokenType: row.tokenType ?? null,
  accessTokenExpiresAt: row.accessTokenExpiresAt?.toISOString?.() ?? null,
  refreshTokenExpiresAt: row.refreshTokenExpiresAt?.toISOString?.() ?? null,
  refreshTokenHardExpiresAt: row.refreshTokenHardExpiresAt?.toISOString?.() ?? null,
  connectedAt: row.connectedAt?.toISOString?.() ?? null,
  connectedByUserId: row.connectedByUserId ?? null,
  disconnectedAt: row.disconnectedAt?.toISOString?.() ?? null,
  disconnectedByUserId: row.disconnectedByUserId ?? null,
  lastSyncedAt: row.lastSyncedAt?.toISOString?.() ?? null,
  lastError: row.lastError ?? null,
});

export const listOrganizationAccountingConnections = async (
  organizationId: string,
  client: PrismaLike = prisma,
): Promise<QuickBooksConnectionStatus[]> => {
  const rows = await client.organizationAccountingConnections.findMany({
    where: { organizationId },
    orderBy: [{ provider: 'asc' }],
  });
  return rows.map(sanitizeAccountingConnection);
};

export const upsertQuickBooksConnection = async ({
  organizationId,
  actingUserId,
  realmId,
  token,
  client = prisma,
  now = new Date(),
}: {
  organizationId: string;
  actingUserId: string;
  realmId: string;
  token: QuickBooksTokenResponse;
  client?: PrismaLike;
  now?: Date;
}) => {
  const scopes = scopesFromToken(token);
  const data = {
    status: 'CONNECTED',
    externalCompanyId: realmId,
    environment: getQuickBooksEnvironment(),
    scopes,
    accessTokenEncrypted: encryptSecret(token.access_token),
    refreshTokenEncrypted: encryptSecret(token.refresh_token),
    tokenType: token.token_type ?? 'bearer',
    accessTokenExpiresAt: addSeconds(now, token.expires_in),
    refreshTokenExpiresAt: addSeconds(now, token.x_refresh_token_expires_in),
    refreshTokenHardExpiresAt: addSeconds(now, token.x_refresh_token_hard_expires_in),
    connectedAt: now,
    connectedByUserId: actingUserId,
    disconnectedAt: null,
    disconnectedByUserId: null,
    lastError: null,
    updatedBy: actingUserId,
  };

  const row = await client.organizationAccountingConnections.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    create: {
      id: createId('org_accounting_connection'),
      organizationId,
      provider: QUICKBOOKS_PROVIDER,
      createdBy: actingUserId,
      ...data,
    },
    update: data,
  });
  return sanitizeAccountingConnection(row);
};

export const disconnectQuickBooksConnection = async ({
  organizationId,
  actingUserId,
  client = prisma,
}: {
  organizationId: string;
  actingUserId: string;
  client?: PrismaLike;
}) => {
  const now = new Date();
  const existing = await client.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
  });
  if (!existing) {
    return null;
  }
  const row = await client.organizationAccountingConnections.update({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    data: {
      status: 'DISCONNECTED',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      refreshTokenHardExpiresAt: null,
      disconnectedAt: now,
      disconnectedByUserId: actingUserId,
      updatedBy: actingUserId,
    },
  });
  return sanitizeAccountingConnection(row);
};

export const refreshStoredQuickBooksConnection = async ({
  organizationId,
  client = prisma,
  fetchImpl,
}: {
  organizationId: string;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
}) => {
  const row = await client.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
  });
  if (!row?.refreshTokenEncrypted || row.status === 'DISCONNECTED') {
    throw new Error('QuickBooks connection is not refreshable.');
  }
  const refreshToken = decryptSecret(row.refreshTokenEncrypted);
  const token = await refreshQuickBooksTokens(refreshToken, fetchImpl);
  const now = new Date();
  const updated = await client.organizationAccountingConnections.update({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    data: {
      status: 'CONNECTED',
      scopes: scopesFromToken(token),
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      tokenType: token.token_type ?? row.tokenType ?? 'bearer',
      accessTokenExpiresAt: addSeconds(now, token.expires_in),
      refreshTokenExpiresAt: addSeconds(now, token.x_refresh_token_expires_in),
      refreshTokenHardExpiresAt: addSeconds(now, token.x_refresh_token_hard_expires_in),
      lastError: null,
      updatedBy: row.updatedBy ?? row.connectedByUserId ?? null,
    },
  });
  return sanitizeAccountingConnection(updated);
};
