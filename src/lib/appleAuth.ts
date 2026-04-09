import crypto, { type JsonWebKey as CryptoJsonWebKey } from 'crypto';
import jwt, { JwtHeader, JwtPayload } from 'jsonwebtoken';

type AppleJsonWebKey = CryptoJsonWebKey & {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

type AppleKeysResponse = {
  keys?: AppleJsonWebKey[];
};

type AppleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type AppleIdentityTokenPayload = JwtPayload & {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  aud?: string;
};

type AppleCodeExchangeResult = {
  idToken: string;
  refreshToken: string | null;
};

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;
const DEFAULT_APPLE_MOBILE_BUNDLE_ID = 'com.razumly.mvp';

const getAppleMobileClientId = (): string => {
  return process.env.APPLE_MOBILE_BUNDLE_ID?.trim() || DEFAULT_APPLE_MOBILE_BUNDLE_ID;
};

const allowedAudiences = (): string[] => {
  return Array.from(new Set([getAppleMobileClientId(), DEFAULT_APPLE_MOBILE_BUNDLE_ID]));
};

const isEmailVerified = (value: AppleIdentityTokenPayload['email_verified']): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
};

const parseAppleIdentityTokenHeader = (identityToken: string): JwtHeader => {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded !== 'object' || !decoded.header) {
    throw new Error('Apple identity token is malformed');
  }

  return decoded.header as JwtHeader;
};

const fetchAppleSigningKeys = async (): Promise<AppleJsonWebKey[]> => {
  const response = await fetch(APPLE_KEYS_URL, { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as AppleKeysResponse;

  if (!response.ok || !Array.isArray(payload.keys)) {
    throw new Error('Apple signing keys could not be retrieved');
  }

  return payload.keys;
};

const getAppleClientSecretConfig = () => {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!teamId || !keyId || !privateKey) {
    throw new Error(
      'Apple Sign in is not fully configured. Set APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.',
    );
  }

  return { teamId, keyId, privateKey };
};

const createAppleClientSecret = (): string => {
  const { teamId, keyId, privateKey } = getAppleClientSecretConfig();

  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    issuer: teamId,
    subject: getAppleMobileClientId(),
    audience: APPLE_ISSUER,
    keyid: keyId,
    expiresIn: '5m',
  });
};

const postAppleForm = async (
  url: string,
  body: Record<string, string>,
): Promise<AppleTokenResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as AppleTokenResponse;

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Apple OAuth request failed');
  }

  return payload;
};

export const verifyAppleIdentityToken = async (
  identityToken: string,
  expectedUser?: string,
): Promise<AppleIdentityTokenPayload> => {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    throw new Error('Apple mobile OAuth is not configured. Set APPLE_MOBILE_BUNDLE_ID.');
  }

  const header = parseAppleIdentityTokenHeader(identityToken);
  if (header.alg !== 'RS256') {
    throw new Error('Apple identity token algorithm is invalid');
  }

  const keyId = header.kid?.trim();
  if (!keyId) {
    throw new Error('Apple identity token is missing key id');
  }

  const signingKeys = await fetchAppleSigningKeys();
  const signingKey = signingKeys.find((candidate) => candidate.kid === keyId);
  if (!signingKey) {
    throw new Error('Apple signing key was not found');
  }
  const [firstAudience, ...additionalAudiences] = audiences;
  const audience = additionalAudiences.length > 0
    ? [firstAudience, ...additionalAudiences] as [string, ...string[]]
    : firstAudience;

  const publicKey = crypto.createPublicKey({
    key: signingKey,
    format: 'jwk',
  });

  const verified = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience,
  }) as AppleIdentityTokenPayload;

  if (!verified.sub) {
    throw new Error('Apple identity token is missing subject');
  }

  if (expectedUser && verified.sub !== expectedUser) {
    throw new Error('Apple identity token subject does not match credential user');
  }

  if (verified.email && !isEmailVerified(verified.email_verified)) {
    throw new Error('Apple account email is not verified');
  }

  return verified;
};

export const exchangeAppleAuthorizationCode = async (
  authorizationCode: string,
): Promise<AppleCodeExchangeResult> => {
  const normalizedAuthorizationCode = authorizationCode.trim();
  if (!normalizedAuthorizationCode) {
    throw new Error('Apple authorization code is required');
  }

  const payload = await postAppleForm(APPLE_TOKEN_URL, {
    grant_type: 'authorization_code',
    code: normalizedAuthorizationCode,
    client_id: getAppleMobileClientId(),
    client_secret: createAppleClientSecret(),
  });

  const idToken = payload.id_token?.trim();
  if (!idToken) {
    throw new Error('Apple authorization code exchange did not return an identity token');
  }

  return {
    idToken,
    refreshToken: payload.refresh_token?.trim() || null,
  };
};

export const revokeAppleRefreshToken = async (refreshToken: string): Promise<void> => {
  const normalizedRefreshToken = refreshToken.trim();
  if (!normalizedRefreshToken) {
    throw new Error('Apple refresh token is required');
  }

  await postAppleForm(APPLE_REVOKE_URL, {
    client_id: getAppleMobileClientId(),
    client_secret: createAppleClientSecret(),
    token: normalizedRefreshToken,
    token_type_hint: 'refresh_token',
  });
};
