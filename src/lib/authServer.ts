import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

const AUTH_COOKIE_NAME = 'auth_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionToken = {
  userId: string;
  isAdmin: boolean;
};

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
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
  return jwt.sign(payload, getAuthSecret(), { expiresIn: TOKEN_TTL_SECONDS });
};

export const verifySessionToken = (token: string): SessionToken | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret()) as JwtPayload;
    return {
      userId: decoded.userId as string,
      isAdmin: Boolean(decoded.isAdmin),
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
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: token ? TOKEN_TTL_SECONDS : 0,
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
