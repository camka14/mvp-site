import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

const AUTH_COOKIE_NAME = 'auth_token';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // Browser-friendly persistent session cap.
const AUTH_TOKEN_ISSUER = 'bracket-iq';
const SESSION_TOKEN_AUDIENCE = 'bracket-iq-session';
const WATCH_SETUP_TOKEN_AUDIENCE = 'bracket-iq-watch-setup';
const JWT_ALGORITHM = 'HS256' as const;
export const WATCH_SETUP_TOKEN_TTL_SECONDS = 60 * 5;

export type SessionDevice = 'web' | 'mobile' | 'watch';

export type SessionToken = {
  userId: string;
  isAdmin: boolean;
  sessionVersion: number;
  device?: SessionDevice;
};

export type VerifiedSessionToken = SessionToken & {
  issuedAtSeconds: number | null;
};

export type WatchSetupToken = {
  userId: string;
  sessionVersion: number;
  purpose: 'watch_setup';
  issuedAtSeconds: number | null;
};

export const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

const readBooleanEnvFlag = (value: string | undefined): boolean | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

export const shouldUseSecureAuthCookie = (): boolean => {
  const explicit = readBooleanEnvFlag(process.env.AUTH_COOKIE_SECURE);
  if (explicit !== null) return explicit;
  return process.env.NODE_ENV === 'production';
};

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
};

export const verifyPassword = async (plain: string, stored: string): Promise<boolean> => {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const derived = (await scrypt(plain, salt, hash.length)) as Buffer;
  return timingSafeEqual(hash, derived);
};

export const signSessionToken = (payload: SessionToken): string => {
  return jwt.sign(
    { ...payload, tokenType: 'session' },
    getAuthSecret(),
    {
      algorithm: JWT_ALGORITHM,
      issuer: AUTH_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      expiresIn: SESSION_COOKIE_MAX_AGE_SECONDS,
    },
  );
};

export const verifySessionToken = (token: string): VerifiedSessionToken | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: AUTH_TOKEN_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
    }) as JwtPayload;
    if (decoded.tokenType !== 'session') return null;
    if (typeof decoded.userId !== 'string' || decoded.userId.trim().length === 0) return null;
    if (!Number.isInteger(decoded.sessionVersion)) return null;
    if (typeof decoded.isAdmin !== 'boolean') return null;
    if (
      typeof decoded.iat !== 'number'
      || typeof decoded.exp !== 'number'
      || !Number.isInteger(decoded.iat)
      || !Number.isInteger(decoded.exp)
      || decoded.exp <= decoded.iat
    ) {
      return null;
    }
    return {
      userId: decoded.userId,
      isAdmin: decoded.isAdmin,
      sessionVersion: Number(decoded.sessionVersion),
      device: isSessionDevice(decoded.device) ? decoded.device : undefined,
      issuedAtSeconds: Number(decoded.iat),
    };
  } catch {
    return null;
  }
};

export const signWatchSetupToken = (payload: Pick<SessionToken, 'userId' | 'sessionVersion'>): string => {
  return jwt.sign(
    {
      userId: payload.userId,
      sessionVersion: payload.sessionVersion,
      purpose: 'watch_setup',
      tokenType: 'watch_setup',
    },
    getAuthSecret(),
    {
      algorithm: JWT_ALGORITHM,
      issuer: AUTH_TOKEN_ISSUER,
      audience: WATCH_SETUP_TOKEN_AUDIENCE,
      expiresIn: WATCH_SETUP_TOKEN_TTL_SECONDS,
    },
  );
};

export const verifyWatchSetupToken = (token: string): WatchSetupToken | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: AUTH_TOKEN_ISSUER,
      audience: WATCH_SETUP_TOKEN_AUDIENCE,
    }) as JwtPayload;
    if (decoded.purpose !== 'watch_setup' || decoded.tokenType !== 'watch_setup') return null;
    if (typeof decoded.userId !== 'string' || decoded.userId.trim().length === 0) return null;
    return {
      userId: decoded.userId,
      sessionVersion: Number.isInteger(decoded.sessionVersion) ? Number(decoded.sessionVersion) : 0,
      purpose: 'watch_setup',
      issuedAtSeconds: Number.isInteger(decoded.iat) ? Number(decoded.iat) : null,
    };
  } catch {
    return null;
  }
};

export const setAuthCookie = (res: Response | import('next/server').NextResponse, token: string): void => {
  const anyRes = res as any;
  if (anyRes?.cookies?.set) {
    anyRes.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureAuthCookie(),
      path: '/',
      maxAge: token ? SESSION_COOKIE_MAX_AGE_SECONDS : 0,
    });
  }
};

export const getTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (match) return decodeURIComponent(match.split('=')[1]);
  return null;
};

const isSessionDevice = (value: unknown): value is SessionDevice =>
  value === 'web' || value === 'mobile' || value === 'watch';
