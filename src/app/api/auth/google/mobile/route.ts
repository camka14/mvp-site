import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import {
  buildProfileCompletionState,
  resolveRequiredProfileFieldsCompletedAt,
} from '@/server/profileCompletion';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { reserveGeneratedUserName } from '@/server/userNames';

const mobileGoogleSchema = z.object({
  idToken: z.string().min(1),
});

type GoogleTokenInfoResponse = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  exp?: string;
  error_description?: string;
};

const toPublicUser = (user: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const allowedAudiences = (): string[] => {
  const values = [
    process.env.GOOGLE_MOBILE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_MOBILE_IOS_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_ID,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
};

const isEmailVerified = (value: GoogleTokenInfoResponse['email_verified']): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
};

const isValidIssuer = (issuer: string | undefined): boolean => {
  return issuer === 'https://accounts.google.com' || issuer === 'accounts.google.com';
};

const isValidExpiry = (exp: string | undefined): boolean => {
  if (!exp) return false;
  const parsed = Number(exp);
  if (!Number.isFinite(parsed)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return parsed > nowSeconds;
};

const UNKNOWN_DATE_OF_BIRTH = new Date(0);

const verifyGoogleIdToken = async (idToken: string): Promise<GoogleTokenInfoResponse> => {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    throw new Error(
      'Google mobile OAuth is not configured. Set GOOGLE_MOBILE_ANDROID_CLIENT_ID and/or GOOGLE_MOBILE_IOS_CLIENT_ID.',
    );
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url, { cache: 'no-store' });
  const tokenInfo = (await response.json().catch(() => ({}))) as GoogleTokenInfoResponse;

  if (!response.ok) {
    const reason = tokenInfo.error_description?.trim() || 'tokeninfo_failed';
    throw new Error(`Google token verification failed: ${reason}`);
  }

  if (!tokenInfo.sub) {
    throw new Error('Google token is missing subject');
  }

  if (!tokenInfo.email) {
    throw new Error('Google token is missing email');
  }

  if (!isEmailVerified(tokenInfo.email_verified)) {
    throw new Error('Google account email is not verified');
  }

  if (!isValidIssuer(tokenInfo.iss)) {
    throw new Error('Google token has invalid issuer');
  }

  if (!isValidExpiry(tokenInfo.exp)) {
    throw new Error('Google token is expired');
  }

  if (!tokenInfo.aud || !audiences.includes(tokenInfo.aud)) {
    throw new Error('Google token audience is not allowed');
  }

  return tokenInfo;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mobileGoogleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { idToken } = parsed.data;

  let tokenInfo: GoogleTokenInfoResponse;
  try {
    tokenInfo = await verifyGoogleIdToken(idToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_google_token';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const normalizedEmail = tokenInfo.email!.toLowerCase();
  const now = new Date();

  const existingAuthByGoogleSubject = await prisma.authUser.findUnique({ where: { googleSubject: tokenInfo.sub } });
  const existingAuthByEmail = !existingAuthByGoogleSubject
    ? await prisma.authUser.findUnique({ where: { email: normalizedEmail } })
    : null;
  const existingAuth = existingAuthByGoogleSubject ?? existingAuthByEmail;
  if (isAuthUserSuspended(existingAuth)) {
    return NextResponse.json(
      { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
      { status: 403 },
    );
  }
  const existingSensitive = existingAuth
    ? null
    : await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const displayName = tokenInfo.name?.trim() || null;
  const firstName = normalizeOptionalName(tokenInfo.given_name);
  const lastName = normalizeOptionalName(tokenInfo.family_name);

  const [authUser, profile] = await prisma.$transaction(async (tx) => {
    const createdAuth = existingAuth
      ? await tx.authUser.update({
          where: { id: existingAuth.id },
          data: {
            googleSubject: tokenInfo.sub,
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
            googleSubject: tokenInfo.sub,
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

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);
  const res = NextResponse.json(
    {
      user: toPublicUser(authUser),
      session,
      token,
      profile: applyNameCaseToUserFields(profile),
      ...buildProfileCompletionState({ authUser, profile }),
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
