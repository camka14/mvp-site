import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { normalizeOptionalName } from '@/lib/nameCase';
import {
  buildProfileCompletionState,
  resolveRequiredProfileFieldsCompletedAt,
} from '@/server/profileCompletion';
import { isAuthUserSuspended } from '@/server/authState';
import { reserveGeneratedUserName } from '@/server/userNames';

const STATE_COOKIE = 'google_oauth_state';
const VERIFIER_COOKIE = 'google_oauth_verifier';
const NEXT_COOKIE = 'google_oauth_next';
const MAX_NEXT_PATH_LENGTH = 2048;
const UNKNOWN_DATE_OF_BIRTH = new Date(0);

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

  const existingAuthByGoogleSubject = userInfo.sub
    ? await prisma.authUser.findUnique({ where: { googleSubject: userInfo.sub } })
    : null;
  const existingAuthByEmail = !existingAuthByGoogleSubject
    ? await prisma.authUser.findUnique({ where: { email: normalizedEmail } })
    : null;
  const existingAuth = existingAuthByGoogleSubject ?? existingAuthByEmail;
  if (isAuthUserSuspended(existingAuth)) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=account_suspended', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }
  const existingSensitive = existingAuth ? null : await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const displayName = userInfo.name?.trim() || null;
  const firstName = normalizeOptionalName(userInfo.given_name);
  const lastName = normalizeOptionalName(userInfo.family_name);

  const [authUser, profile] = await prisma.$transaction(async (tx) => {
    const createdAuth = existingAuth
      ? await tx.authUser.update({
          where: { id: existingAuth.id },
          data: {
            googleSubject: userInfo.sub ?? existingAuth.googleSubject,
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
            googleSubject: userInfo.sub ?? null,
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
      ? await (() => {
          const nextProfile = {
            firstName: existingProfile.firstName ?? firstName,
            lastName: existingProfile.lastName ?? lastName,
            dateOfBirth: existingProfile.dateOfBirth,
            requiredProfileFieldsCompletedAt: existingProfile.requiredProfileFieldsCompletedAt,
          };
          const requiredProfileFieldsCompletedAt = resolveRequiredProfileFieldsCompletedAt({
            authUser: createdAuth,
            profile: nextProfile,
            now,
          });
          return tx.userData.update({
            where: { id: createdAuth.id },
            data: {
              firstName: nextProfile.firstName,
              lastName: nextProfile.lastName,
              requiredProfileFieldsCompletedAt,
              updatedAt: now,
            },
          });
        })()
      : await (async () => {
          const nextProfile = {
            firstName,
            lastName,
            dateOfBirth: UNKNOWN_DATE_OF_BIRTH,
            requiredProfileFieldsCompletedAt: null,
          };
          const requiredProfileFieldsCompletedAt = resolveRequiredProfileFieldsCompletedAt({
            authUser: createdAuth,
            profile: nextProfile,
            now,
          });
          return tx.userData.create({
            data: {
              id: createdAuth.id,
              createdAt: now,
              updatedAt: now,
              firstName: nextProfile.firstName,
              lastName: nextProfile.lastName,
              userName: await reserveGeneratedUserName(
                tx,
                normalizedEmail.split('@')[0] ?? 'user',
                { excludeUserId: createdAuth.id, suffixSeed: createdAuth.id },
              ),
              dateOfBirth: nextProfile.dateOfBirth,
              requiredProfileFieldsCompletedAt,
              teamIds: [],
              friendIds: [],
              friendRequestIds: [],
              friendRequestSentIds: [],
              followingIds: [],
              uploadedImages: [],
              profileImageId: null,
            },
          });
        })();

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

  if (isAuthUserSuspended(authUser)) {
    const res = NextResponse.redirect(new URL('/login?oauth=google&error=account_suspended', origin), { status: 302 });
    clearOauthCookies(res);
    return res;
  }

  const session: SessionToken = {
    userId: authUser.id,
    isAdmin: false,
    sessionVersion: authUser.sessionVersion ?? 0,
  };
  const token = signSessionToken(session);
  const profileCompletionState = buildProfileCompletionState({ authUser, profile });
  const destinationUrl = new URL(
    profileCompletionState.requiresProfileCompletion ? '/complete-profile' : next,
    origin,
  );
  if (profileCompletionState.requiresProfileCompletion) {
    destinationUrl.searchParams.set('next', next);
  }

  const res = NextResponse.redirect(destinationUrl, { status: 302 });
  clearOauthCookies(res);
  setAuthCookie(res, token);
  return res;
}
