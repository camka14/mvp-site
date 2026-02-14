import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const STATE_COOKIE = 'google_oauth_state';
const VERIFIER_COOKIE = 'google_oauth_verifier';
const NEXT_COOKIE = 'google_oauth_next';

const OAUTH_COOKIE_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_NEXT_PATH_LENGTH = 2048;

const base64url = (buf: Buffer): string => {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
};

const getRequestOrigin = (req: NextRequest): string => {
  const proto = (req.headers.get('x-forwarded-proto') || '').split(',')[0]?.trim();
  const host =
    (req.headers.get('x-forwarded-host') || '').split(',')[0]?.trim() ||
    (req.headers.get('host') || '').trim();
  if (proto && host) return `${proto}://${host}`;
  return req.nextUrl.origin;
};

const safeNextPath = (value: string | null): string => {
  if (!value) return '/discover';
  const next = value.trim();
  if (!next.startsWith('/')) return '/discover';
  if (next.startsWith('//')) return '/discover';
  if (next.length > MAX_NEXT_PATH_LENGTH) return '/discover';
  if (/[\r\n\t]/.test(next)) return '/discover';
  return next;
};

export async function GET(req: NextRequest) {
  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');

  const origin = getRequestOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;

  const next = safeNextPath(req.nextUrl.searchParams.get('next'));

  const state = base64url(crypto.randomBytes(16));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('scope', 'openid email profile');
  params.set('state', state);
  params.set('code_challenge', challenge);
  params.set('code_challenge_method', 'S256');
  params.set('prompt', 'select_account');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const res = NextResponse.redirect(authUrl, { status: 302 });

  const cookieBase = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_COOKIE_TTL_SECONDS,
  };

  res.cookies.set(STATE_COOKIE, state, cookieBase);
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieBase);
  res.cookies.set(NEXT_COOKIE, next, { ...cookieBase, httpOnly: true });

  return res;
}
