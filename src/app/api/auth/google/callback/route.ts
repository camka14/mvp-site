import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';

const STATE_COOKIE = 'google_oauth_state';
const VERIFIER_COOKIE = 'google_oauth_verifier';
const NEXT_COOKIE = 'google_oauth_next';
const MAX_NEXT_PATH_LENGTH = 2048;

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
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

const clearOauthCookies = (res: NextResponse) => {
  const cookieBase = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
  res.cookies.set(STATE_COOKIE, '', cookieBase);
  res.cookies.set(VERIFIER_COOKIE, '', cookieBase);
  res.cookies.set(NEXT_COOKIE, '', cookieBase);
};

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;

  const next = safeNextPath(req.cookies.get(NEXT_COOKIE)?.value ?? null);

  const error = req.nextUrl.searchParams.get('error');
  if (error) {
    const res = NextResponse.redirect(new URL(`/login?oauth=google&error=${encodeURIComponent(error)}`, origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const code = req.nextUrl.searchParams.get('code');
  const returnedState = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get(STATE_COOKIE)?.value ?? null;
  const verifier = req.cookies.get(VERIFIER_COOKIE)?.value ?? null;

  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=invalid_state', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }).toString(),
  });

  const tokenJson = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=token_exchange_failed', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userInfo = (await userInfoRes.json().catch(() => ({}))) as GoogleUserInfo;
  if (!userInfoRes.ok || !userInfo.email) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=userinfo_failed', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const normalizedEmail = userInfo.email.toLowerCase();
  if (userInfo.email_verified === false) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=email_not_verified', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const now = new Date();

  const existingAuth = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  const existingSensitive = existingAuth ? null : await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const displayName = userInfo.name?.trim() || null;
  const firstName = userInfo.given_name?.trim() || null;
  const lastName = userInfo.family_name?.trim() || null;

  const [authUser, profile] = await prisma.$transaction(async (tx) => {
    const createdAuth = existingAuth
      ? await tx.authUser.update({
          where: { id: existingAuth.id },
          data: {
            name: existingAuth.name ?? displayName,
            emailVerifiedAt: existingAuth.emailVerifiedAt ?? now,
            lastLogin: now,
            updatedAt: now,
          },
        })
      : await tx.authUser.create({
          data: {
            id: userId,
            email: normalizedEmail,
            passwordHash: await hashPassword(crypto.randomBytes(48).toString('base64url')),
            name: displayName,
            emailVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
            lastLogin: now,
          },
        });

    const existingProfile = await tx.userData.findUnique({ where: { id: createdAuth.id } });
    const profileRow = existingProfile
      ? await tx.userData.update({
          where: { id: createdAuth.id },
          data: {
            firstName: existingProfile.firstName ?? firstName,
            lastName: existingProfile.lastName ?? lastName,
            updatedAt: now,
          },
        })
      : await tx.userData.create({
          data: {
            id: createdAuth.id,
            createdAt: now,
            updatedAt: now,
            firstName,
            lastName,
            userName: normalizedEmail.split('@')[0] ?? 'user',
            dateOfBirth: new Date('2000-01-01'),
            teamIds: [],
            friendIds: [],
            friendRequestIds: [],
            friendRequestSentIds: [],
            followingIds: [],
            uploadedImages: [],
            profileImageId: null,
          },
        });

    await tx.sensitiveUserData.upsert({
      where: { id: existingSensitive?.id ?? createdAuth.id },
      update: {
        email: normalizedEmail,
        userId: createdAuth.id,
        updatedAt: now,
      },
      create: {
        id: createdAuth.id,
        email: normalizedEmail,
        userId: createdAuth.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    return [createdAuth, profileRow] as const;
  });

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);

  const res = NextResponse.redirect(new URL(next, origin), { status: 302 });
  clearOauthCookies(res);
  setAuthCookie(res, token);
  return res;
}
