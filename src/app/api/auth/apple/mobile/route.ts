import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import {
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} from '@/lib/appleAuth';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import {
  buildProfileCompletionState,
  resolveRequiredProfileFieldsCompletedAt,
} from '@/server/profileCompletion';
import { ACCOUNT_SUSPENDED_CODE, isAuthUserSuspended } from '@/server/authState';
import { reserveGeneratedUserName } from '@/server/userNames';

const mobileAppleSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().trim().min(1),
  user: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
});

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

const UNKNOWN_DATE_OF_BIRTH = new Date(0);


export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mobileAppleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { identityToken, authorizationCode, user, email, firstName, lastName } = parsed.data;

  let tokenInfo: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    tokenInfo = await verifyAppleIdentityToken(identityToken, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_apple_token';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let exchangedTokenInfo: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  let exchangedRefreshToken: string | null;
  try {
    const exchange = await exchangeAppleAuthorizationCode(authorizationCode);
    exchangedTokenInfo = await verifyAppleIdentityToken(exchange.idToken);
    if (exchangedTokenInfo.sub !== tokenInfo.sub) {
      throw new Error('Apple authorization code subject does not match identity token');
    }
    exchangedRefreshToken = exchange.refreshToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_apple_authorization_code';
    const status = message.toLowerCase().includes('configured') ? 500 : 401;
    return NextResponse.json({ error: message }, { status });
  }

  const normalizedTokenEmail = tokenInfo.email?.trim().toLowerCase() || null;
  const normalizedExchangeEmail = exchangedTokenInfo.email?.trim().toLowerCase() || null;
  const normalizedProvidedEmail = email?.trim().toLowerCase() || null;
  if (normalizedTokenEmail && normalizedProvidedEmail && normalizedTokenEmail !== normalizedProvidedEmail) {
    return NextResponse.json({ error: 'Apple email does not match identity token' }, { status: 401 });
  }

  if (normalizedTokenEmail && normalizedExchangeEmail && normalizedTokenEmail !== normalizedExchangeEmail) {
    return NextResponse.json({ error: 'Apple token exchange email does not match identity token' }, { status: 401 });
  }

  const now = new Date();
  const existingAuthByAppleSubject = await prisma.authUser.findUnique({ where: { appleSubject: tokenInfo.sub } });
  const candidateEmail = normalizedTokenEmail ?? normalizedExchangeEmail ?? normalizedProvidedEmail;
  const existingAuthByEmail = !existingAuthByAppleSubject && candidateEmail
    ? await prisma.authUser.findUnique({ where: { email: candidateEmail } })
    : null;
  const existingAuth = existingAuthByAppleSubject ?? existingAuthByEmail;
  if (isAuthUserSuspended(existingAuth)) {
    return NextResponse.json(
      { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
      { status: 403 },
    );
  }
  const existingSensitive = existingAuth
    ? await prisma.sensitiveUserData.findFirst({ where: { userId: existingAuth.id } })
    : candidateEmail
      ? await prisma.sensitiveUserData.findFirst({ where: { email: candidateEmail } })
      : null;
  const normalizedEmail = existingAuth?.email?.trim().toLowerCase()
    || candidateEmail
    || existingSensitive?.email?.trim().toLowerCase()
    || null;

  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Apple sign-in did not provide an email address' }, { status: 401 });
  }

  const refreshToken = exchangedRefreshToken || existingSensitive?.appleRefreshToken?.trim() || null;
  if (!refreshToken) {
    return NextResponse.json(
      { error: 'Apple sign-in did not return a refresh token. Remove the app from Apple ID settings and try again.' },
      { status: 401 },
    );
  }

  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const normalizedFirstName = normalizeOptionalName(firstName);
  const normalizedLastName = normalizeOptionalName(lastName);
  const displayName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ').trim() || null;

  const [authUser, profile] = await prisma.$transaction(async (tx) => {
    const createdAuth = existingAuth
      ? await tx.authUser.update({
          where: { id: existingAuth.id },
          data: {
            name: existingAuth.name ?? displayName,
            appleSubject: tokenInfo.sub,
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
            appleSubject: tokenInfo.sub,
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
            firstName: existingProfile.firstName ?? normalizedFirstName,
            lastName: existingProfile.lastName ?? normalizedLastName,
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
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
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
              userName: await reserveGeneratedUserName(tx, normalizedEmail.split('@')[0] ?? 'user', {
                excludeUserId: createdAuth.id,
                suffixSeed: createdAuth.id,
              }),
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
        appleRefreshToken: refreshToken,
        updatedAt: now,
      },
      create: {
        id: createdAuth.id,
        email: normalizedEmail,
        userId: createdAuth.id,
        appleRefreshToken: refreshToken,
        createdAt: now,
        updatedAt: now,
      },
    });

    return [createdAuth, profileRow] as const;
  });

  if (isAuthUserSuspended(authUser)) {
    return NextResponse.json(
      { error: 'Account suspended', code: ACCOUNT_SUSPENDED_CODE },
      { status: 403 },
    );
  }

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
