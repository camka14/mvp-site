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
const QUICKBOOKS_REVOKE_ENDPOINT = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const QUICKBOOKS_DEFAULT_SCOPE = 'com.intuit.quickbooks.accounting';
const QUICKBOOKS_STATE_TTL_SECONDS = 30 * 60;
const QUICKBOOKS_STATE_AUDIENCE = 'bracketiq-quickbooks';
const QUICKBOOKS_STATE_ISSUER = 'bracketiq';
const QUICKBOOKS_ACCESS_TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
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
  lastIntuitTid: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  payrollExpenseAccountExternalId: string | null;
  payrollExpenseAccountName: string | null;
  payrollLiabilityAccountExternalId: string | null;
  payrollLiabilityAccountName: string | null;
  financeClearingAccountExternalId: string | null;
  financeClearingAccountName: string | null;
};

export type QuickBooksAccountSummary = {
  id: string;
  name: string;
  fullyQualifiedName: string | null;
  displayName: string;
  accountType: string | null;
  accountSubType: string | null;
  classification: string | null;
  accountNumber: string | null;
  active: boolean;
};

export type QuickBooksStatePayload = {
  organizationId: string;
  userId: string;
  returnUrl: string;
  refreshUrl: string;
  nonce: string;
};

export type QuickBooksStateParseError = 'invalid_state' | 'expired_state';

export type QuickBooksStateParseResult = {
  state: QuickBooksStatePayload | null;
  expiredState: QuickBooksStatePayload | null;
  error: QuickBooksStateParseError | null;
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

export class QuickBooksIntegrationError extends Error {
  code?: string;
  intuitTid?: string;
  isReauthRequired: boolean;

  constructor(
    message: string,
    public status = 502,
    options: { code?: string | null; intuitTid?: string | null; isReauthRequired?: boolean } = {},
  ) {
    super(message);
    this.name = 'QuickBooksIntegrationError';
    this.code = options.code ?? undefined;
    this.intuitTid = options.intuitTid ?? undefined;
    this.isReauthRequired = Boolean(options.isReauthRequired);
  }
}

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

export const getQuickBooksApiBaseUrl = (): string => (
  getQuickBooksEnvironment() === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
);

export const getQuickBooksMinorVersion = (): string => {
  const configured = process.env.INTUIT_MINOR_VERSION?.trim();
  return configured && /^\d+$/.test(configured) ? configured : '75';
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

const coerceQuickBooksStatePayload = (
  decoded: (JwtPayload & Partial<QuickBooksStatePayload>) | string,
): QuickBooksStatePayload | null => {
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
};

const verifyQuickBooksStatePayload = (
  token: string,
  options: { ignoreExpiration?: boolean } = {},
): QuickBooksStatePayload | null => {
  const decoded = jwt.verify(token, getAuthSecret(), {
    audience: QUICKBOOKS_STATE_AUDIENCE,
    issuer: QUICKBOOKS_STATE_ISSUER,
    ...(options.ignoreExpiration
      ? { ignoreExpiration: true }
      : { maxAge: `${QUICKBOOKS_STATE_TTL_SECONDS}s` }),
    algorithms: ['HS256'],
  }) as JwtPayload & Partial<QuickBooksStatePayload>;

  return coerceQuickBooksStatePayload(decoded);
};

export const parseQuickBooksStateResult = (token: string): QuickBooksStateParseResult => {
  try {
    const state = verifyQuickBooksStatePayload(token);
    return state
      ? { state, expiredState: null, error: null }
      : { state: null, expiredState: null, error: 'invalid_state' };
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      try {
        const expiredState = verifyQuickBooksStatePayload(token, { ignoreExpiration: true });
        return expiredState
          ? { state: null, expiredState, error: 'expired_state' }
          : { state: null, expiredState: null, error: 'invalid_state' };
      } catch {
        return { state: null, expiredState: null, error: 'invalid_state' };
      }
    }
    return { state: null, expiredState: null, error: 'invalid_state' };
  }
};

export const parseQuickBooksState = (token: string): QuickBooksStatePayload | null => (
  parseQuickBooksStateResult(token).state
);

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

export const getQuickBooksIntuitTid = (headers?: Headers | null): string | null => {
  if (!headers || typeof headers.get !== 'function') {
    return null;
  }
  return headers.get('intuit_tid')
    ?? headers.get('intuit-tid')
    ?? headers.get('Intuit-Tid');
};

const stringFromUnknown = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const parseQuickBooksProviderError = (payload: unknown): { code: string | null; message: string | null } => {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const directCode = stringFromUnknown(record.error) ?? stringFromUnknown(record.code);
  const directMessage = stringFromUnknown(record.error_description)
    ?? stringFromUnknown(record.message)
    ?? stringFromUnknown(record.detail);
  const fault = record.Fault && typeof record.Fault === 'object' ? record.Fault as Record<string, unknown> : null;
  const errors = Array.isArray(fault?.Error) ? fault.Error : [];
  const firstError = errors[0] && typeof errors[0] === 'object' ? errors[0] as Record<string, unknown> : null;
  return {
    code: directCode ?? stringFromUnknown(firstError?.code) ?? null,
    message: directMessage
      ?? stringFromUnknown(firstError?.Message)
      ?? stringFromUnknown(firstError?.Detail)
      ?? null,
  };
};

export const isQuickBooksReauthError = (error: unknown): boolean => (
  error instanceof QuickBooksIntegrationError
    && (
      error.isReauthRequired
      || error.code === 'invalid_grant'
      || error.status === 401
    )
);

const sanitizeQuickBooksErrorMessage = (fallback: string, payload: unknown): string => {
  const parsed = parseQuickBooksProviderError(payload);
  return parsed.message ? parsed.message.slice(0, 500) : fallback;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const readBoolean = (record: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
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
    const providerError = parseQuickBooksProviderError(payload);
    throw new QuickBooksIntegrationError('QuickBooks token request failed.', response.status, {
      code: providerError.code,
      intuitTid: getQuickBooksIntuitTid(response.headers),
      isReauthRequired: providerError.code === 'invalid_grant' || response.status === 401,
    });
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

export const revokeQuickBooksToken = async (
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> => {
  if (!token) {
    throw new QuickBooksIntegrationError('QuickBooks revoke request is missing a token.', 400);
  }
  const { clientId, clientSecret } = getCredentials();
  const response = await fetchImpl(QUICKBOOKS_REVOKE_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const providerError = parseQuickBooksProviderError(payload);
    throw new QuickBooksIntegrationError('QuickBooks token revocation failed.', response.status, {
      code: providerError.code,
      intuitTid: getQuickBooksIntuitTid(response.headers),
    });
  }
};

const scopesFromToken = (token: QuickBooksTokenResponse): string[] => (
  token.scope?.trim()
    ? Array.from(new Set(token.scope.trim().split(/\s+/).filter(Boolean)))
    : getQuickBooksScopes()
);

export const decryptQuickBooksRealmId = (row: {
  externalCompanyId?: string | null;
  externalCompanyIdEncrypted?: string | null;
}): string | null => {
  if (row.externalCompanyIdEncrypted) {
    return decryptSecret(row.externalCompanyIdEncrypted);
  }
  return row.externalCompanyId ?? null;
};

export const sanitizeAccountingConnection = (row: any): QuickBooksConnectionStatus => ({
  id: row.id,
  provider: QUICKBOOKS_PROVIDER,
  status: row.status,
  externalCompanyId: null,
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
  lastIntuitTid: row.lastIntuitTid ?? null,
  lastErrorAt: row.lastErrorAt?.toISOString?.() ?? null,
  lastError: row.lastError ?? null,
  payrollExpenseAccountExternalId: row.payrollExpenseAccountExternalId ?? null,
  payrollExpenseAccountName: row.payrollExpenseAccountName ?? null,
  payrollLiabilityAccountExternalId: row.payrollLiabilityAccountExternalId ?? null,
  payrollLiabilityAccountName: row.payrollLiabilityAccountName ?? null,
  financeClearingAccountExternalId: row.financeClearingAccountExternalId ?? null,
  financeClearingAccountName: row.financeClearingAccountName ?? null,
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

const markQuickBooksReauthSyncRecordsRetryable = async ({
  organizationId,
  actingUserId,
  client,
}: {
  organizationId: string;
  actingUserId?: string | null;
  client: PrismaLike;
}) => {
  if (!client.accountingSyncRecords?.updateMany) {
    return;
  }
  await client.accountingSyncRecords.updateMany({
    where: {
      organizationId,
      provider: QUICKBOOKS_PROVIDER,
      status: 'REAUTH_REQUIRED',
    },
    data: {
      status: 'FAILED',
      errorCode: 'READY_TO_RETRY',
      errorMessage: 'QuickBooks reconnected. Retry sync.',
      updatedBy: actingUserId ?? null,
    },
  });
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
    externalCompanyId: null,
    externalCompanyIdEncrypted: encryptSecret(realmId),
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
    lastIntuitTid: null,
    lastErrorAt: null,
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
  await markQuickBooksReauthSyncRecordsRetryable({
    organizationId,
    actingUserId,
    client,
  });
  return sanitizeAccountingConnection(row);
};

export const disconnectQuickBooksConnection = async ({
  organizationId,
  actingUserId,
  client = prisma,
  fetchImpl,
}: {
  organizationId: string;
  actingUserId: string;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
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
  if (existing.refreshTokenEncrypted) {
    try {
      await revokeQuickBooksToken(decryptSecret(existing.refreshTokenEncrypted), fetchImpl);
    } catch (error) {
      await client.organizationAccountingConnections.update({
        where: {
          organizationId_provider: {
            organizationId,
            provider: QUICKBOOKS_PROVIDER,
          },
        },
        data: {
          lastError: 'QuickBooks token revocation failed. Disconnect was not completed.',
          lastErrorAt: now,
          updatedBy: actingUserId,
        },
      });
      throw error;
    }
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
      externalCompanyId: null,
      externalCompanyIdEncrypted: null,
      externalCompanyName: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      refreshTokenHardExpiresAt: null,
      lastIntuitTid: null,
      lastErrorAt: null,
      lastError: null,
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
      lastErrorAt: null,
      lastError: null,
      updatedBy: row.updatedBy ?? row.connectedByUserId ?? null,
    },
  });
  await markQuickBooksReauthSyncRecordsRetryable({
    organizationId,
    actingUserId: row.updatedBy ?? row.connectedByUserId ?? null,
    client,
  });
  return sanitizeAccountingConnection(updated);
};

export const markQuickBooksConnectionReauthRequired = async ({
  organizationId,
  actingUserId,
  errorMessage,
  intuitTid,
  client = prisma,
  now = new Date(),
}: {
  organizationId: string;
  actingUserId?: string | null;
  errorMessage?: string | null;
  intuitTid?: string | null;
  client?: PrismaLike;
  now?: Date;
}) => {
  const row = await client.organizationAccountingConnections.update({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    data: {
      status: 'REAUTH_REQUIRED',
      lastError: errorMessage?.trim() || 'QuickBooks authorization expired. Reconnect QuickBooks to continue.',
      lastErrorAt: now,
      lastIntuitTid: intuitTid ?? null,
      updatedBy: actingUserId ?? null,
    },
  });
  return sanitizeAccountingConnection(row);
};

export const updateQuickBooksAccountMapping = async ({
  organizationId,
  actingUserId,
  payrollExpenseAccountExternalId,
  payrollExpenseAccountName,
  payrollLiabilityAccountExternalId,
  payrollLiabilityAccountName,
  financeClearingAccountExternalId,
  financeClearingAccountName,
  client = prisma,
}: {
  organizationId: string;
  actingUserId: string;
  payrollExpenseAccountExternalId?: string | null;
  payrollExpenseAccountName?: string | null;
  payrollLiabilityAccountExternalId?: string | null;
  payrollLiabilityAccountName?: string | null;
  financeClearingAccountExternalId?: string | null;
  financeClearingAccountName?: string | null;
  client?: PrismaLike;
}) => {
  const row = await client.organizationAccountingConnections.update({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    data: {
      payrollExpenseAccountExternalId: payrollExpenseAccountExternalId?.trim() || null,
      payrollExpenseAccountName: payrollExpenseAccountName?.trim() || null,
      payrollLiabilityAccountExternalId: payrollLiabilityAccountExternalId?.trim() || null,
      payrollLiabilityAccountName: payrollLiabilityAccountName?.trim() || null,
      financeClearingAccountExternalId: financeClearingAccountExternalId?.trim() || null,
      financeClearingAccountName: financeClearingAccountName?.trim() || null,
      updatedBy: actingUserId,
    },
  });
  return sanitizeAccountingConnection(row);
};

type QuickBooksApiConnection = {
  row: any;
  realmId: string;
  accessToken: string;
  environment: string;
};

const shouldRefreshAccessToken = (expiresAt: unknown, now: Date): boolean => {
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    return true;
  }
  return expiresAt.getTime() <= now.getTime() + QUICKBOOKS_ACCESS_TOKEN_REFRESH_SKEW_MS;
};

export const getQuickBooksApiConnection = async ({
  organizationId,
  actingUserId,
  client = prisma,
  fetchImpl,
  now = new Date(),
}: {
  organizationId: string;
  actingUserId?: string | null;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<QuickBooksApiConnection> => {
  const row = await client.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
  });
  if (!row || row.status === 'DISCONNECTED') {
    throw new QuickBooksIntegrationError('QuickBooks is not connected.', 400);
  }
  if (row.status === 'REAUTH_REQUIRED') {
    throw new QuickBooksIntegrationError('Reconnect QuickBooks before syncing.', 409, { isReauthRequired: true });
  }
  const realmId = decryptQuickBooksRealmId(row);
  if (!realmId) {
    await markQuickBooksConnectionReauthRequired({
      organizationId,
      actingUserId,
      errorMessage: 'QuickBooks company id is missing. Reconnect QuickBooks before syncing.',
      client,
      now,
    });
    throw new QuickBooksIntegrationError('QuickBooks company id is missing. Reconnect QuickBooks before syncing.', 409, {
      isReauthRequired: true,
    });
  }
  if (!row.accessTokenEncrypted && !row.refreshTokenEncrypted) {
    await markQuickBooksConnectionReauthRequired({
      organizationId,
      actingUserId,
      errorMessage: 'QuickBooks tokens are missing. Reconnect QuickBooks before syncing.',
      client,
      now,
    });
    throw new QuickBooksIntegrationError('QuickBooks tokens are missing. Reconnect QuickBooks before syncing.', 409, {
      isReauthRequired: true,
    });
  }

  if (!shouldRefreshAccessToken(row.accessTokenExpiresAt, now) && row.accessTokenEncrypted) {
    return {
      row,
      realmId,
      accessToken: decryptSecret(row.accessTokenEncrypted),
      environment: row.environment ?? getQuickBooksEnvironment(),
    };
  }

  if (!row.refreshTokenEncrypted) {
    await markQuickBooksConnectionReauthRequired({
      organizationId,
      actingUserId,
      errorMessage: 'QuickBooks refresh token is missing. Reconnect QuickBooks to continue.',
      client,
      now,
    });
    throw new QuickBooksIntegrationError('Reconnect QuickBooks before syncing.', 409, { isReauthRequired: true });
  }

  try {
    const token = await refreshQuickBooksTokens(decryptSecret(row.refreshTokenEncrypted), fetchImpl);
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
        lastErrorAt: null,
        updatedBy: actingUserId ?? row.updatedBy ?? row.connectedByUserId ?? null,
      },
    });
    await markQuickBooksReauthSyncRecordsRetryable({
      organizationId,
      actingUserId: actingUserId ?? row.updatedBy ?? row.connectedByUserId ?? null,
      client,
    });
    return {
      row: updated,
      realmId,
      accessToken: token.access_token,
      environment: updated.environment ?? getQuickBooksEnvironment(),
    };
  } catch (error) {
    if (isQuickBooksReauthError(error)) {
      await markQuickBooksConnectionReauthRequired({
        organizationId,
        actingUserId,
        errorMessage: 'QuickBooks authorization expired. Reconnect QuickBooks to continue.',
        intuitTid: error instanceof QuickBooksIntegrationError ? error.intuitTid : null,
        client,
        now,
      });
    }
    throw error;
  }
};

export const quickBooksApiFetch = async ({
  organizationId,
  actingUserId,
  path,
  method,
  body,
  client = prisma,
  fetchImpl = fetch,
}: {
  organizationId: string;
  actingUserId?: string | null;
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
}): Promise<{ payload: unknown; intuitTid: string | null }> => {
  const connection = await getQuickBooksApiConnection({
    organizationId,
    actingUserId,
    client,
    fetchImpl,
  });
  const url = new URL(`/v3/company/${encodeURIComponent(connection.realmId)}${path}`, getQuickBooksApiBaseUrl());
  url.searchParams.set('minorversion', getQuickBooksMinorVersion());
  const response = await fetchImpl(url.toString(), {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const intuitTid = getQuickBooksIntuitTid(response.headers);
  const payload = await response.json().catch(() => null);
  const now = new Date();

  if (!response.ok) {
    const providerError = parseQuickBooksProviderError(payload);
    const message = sanitizeQuickBooksErrorMessage('QuickBooks API request failed.', payload);
    await client.organizationAccountingConnections.update({
      where: {
        organizationId_provider: {
          organizationId,
          provider: QUICKBOOKS_PROVIDER,
        },
      },
      data: {
        ...(response.status === 401 ? { status: 'REAUTH_REQUIRED' } : {}),
        lastIntuitTid: intuitTid,
        lastErrorAt: now,
        lastError: message,
        updatedBy: actingUserId ?? null,
      },
    });
    throw new QuickBooksIntegrationError('QuickBooks API request failed.', response.status, {
      code: providerError.code,
      intuitTid,
      isReauthRequired: response.status === 401,
    });
  }

  await client.organizationAccountingConnections.update({
    where: {
      organizationId_provider: {
        organizationId,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    data: {
      lastIntuitTid: intuitTid,
      lastError: null,
      lastErrorAt: null,
      lastSyncedAt: now,
      updatedBy: actingUserId ?? null,
    },
  });

  return { payload, intuitTid };
};

const sanitizeQuickBooksAccount = (value: unknown): QuickBooksAccountSummary | null => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!record) {
    return null;
  }
  const id = readString(record, 'Id');
  const name = readString(record, 'Name');
  if (!id || !name) {
    return null;
  }
  const fullyQualifiedName = readString(record, 'FullyQualifiedName');
  const accountNumber = readString(record, 'AcctNum');
  const accountType = readString(record, 'AccountType');
  const accountSubType = readString(record, 'AccountSubType');
  const classification = readString(record, 'Classification');
  const active = readBoolean(record, 'Active', true);
  return {
    id,
    name,
    fullyQualifiedName,
    displayName: [
      accountNumber,
      fullyQualifiedName ?? name,
      accountType,
      accountSubType,
    ].filter(Boolean).join(' · '),
    accountType,
    accountSubType,
    classification,
    accountNumber,
    active,
  };
};

export const listQuickBooksAccounts = async ({
  organizationId,
  actingUserId,
  client = prisma,
  fetchImpl = fetch,
}: {
  organizationId: string;
  actingUserId?: string | null;
  client?: PrismaLike;
  fetchImpl?: FetchLike;
}): Promise<QuickBooksAccountSummary[]> => {
  const query = 'SELECT * FROM Account WHERE Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000';
  const params = new URLSearchParams({ query });
  const { payload } = await quickBooksApiFetch({
    organizationId,
    actingUserId,
    path: `/query?${params.toString()}`,
    method: 'GET',
    client,
    fetchImpl,
  });
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const queryResponse = record.QueryResponse && typeof record.QueryResponse === 'object'
    ? record.QueryResponse as Record<string, unknown>
    : {};
  const accounts = Array.isArray(queryResponse.Account) ? queryResponse.Account : [];
  return accounts
    .map(sanitizeQuickBooksAccount)
    .filter((account): account is QuickBooksAccountSummary => Boolean(account))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};
