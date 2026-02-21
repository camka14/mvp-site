import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
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

  const existingAuth = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  const existingSensitive = existingAuth
    ? null
    : await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const displayName = tokenInfo.name?.trim() || null;
  const firstName = tokenInfo.given_name?.trim() || null;
  const lastName = tokenInfo.family_name?.trim() || null;

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
            userName: await reserveGeneratedUserName(
              tx,
              normalizedEmail.split('@')[0] ?? 'user',
              { excludeUserId: createdAuth.id, suffixSeed: createdAuth.id },
            ),
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
  const res = NextResponse.json(
    {
      user: toPublicUser(authUser),
      session,
      token,
      profile,
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
