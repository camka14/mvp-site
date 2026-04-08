import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt, { JwtHeader, JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import { reserveGeneratedUserName } from '@/server/userNames';

const mobileAppleSchema = z.object({
  identityToken: z.string().min(1),
  user: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
});

type AppleJsonWebKey = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

type AppleKeysResponse = {
  keys?: AppleJsonWebKey[];
};

type AppleIdentityTokenPayload = JwtPayload & {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  aud?: string;
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
  const values = [process.env.APPLE_MOBILE_BUNDLE_ID, 'com.razumly.mvp']
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
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
  const response = await fetch('https://appleid.apple.com/auth/keys', { cache: 'no-store' });
  const payload = (await response.json().catch(() => ({}))) as AppleKeysResponse;

  if (!response.ok || !Array.isArray(payload.keys)) {
    throw new Error('Apple signing keys could not be retrieved');
  }

  return payload.keys;
};

const verifyAppleIdentityToken = async (
  identityToken: string,
  expectedUser: string | undefined,
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

  const publicKey = crypto.createPublicKey({
    key: signingKey as JsonWebKey,
    format: 'jwk',
  });

  const verified = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: audiences,
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mobileAppleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { identityToken, user, email, firstName, lastName } = parsed.data;

  let tokenInfo: AppleIdentityTokenPayload;
  try {
    tokenInfo = await verifyAppleIdentityToken(identityToken, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_apple_token';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const normalizedTokenEmail = tokenInfo.email?.trim().toLowerCase() || null;
  const normalizedProvidedEmail = email?.trim().toLowerCase() || null;
  if (normalizedTokenEmail && normalizedProvidedEmail && normalizedTokenEmail !== normalizedProvidedEmail) {
    return NextResponse.json({ error: 'Apple email does not match identity token' }, { status: 401 });
  }

  const normalizedEmail = normalizedTokenEmail ?? normalizedProvidedEmail;
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Apple sign-in did not provide an email address' }, { status: 401 });
  }

  if (!normalizedTokenEmail && !isEmailVerified(tokenInfo.email_verified)) {
    return NextResponse.json({ error: 'Apple account email is not verified' }, { status: 401 });
  }

  const now = new Date();
  const existingAuth = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  const existingSensitive = existingAuth
    ? null
    : await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
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
            firstName: existingProfile.firstName ?? normalizedFirstName,
            lastName: existingProfile.lastName ?? normalizedLastName,
            updatedAt: now,
          },
        })
      : await tx.userData.create({
          data: {
            id: createdAuth.id,
            createdAt: now,
            updatedAt: now,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            userName: await reserveGeneratedUserName(tx, normalizedEmail.split('@')[0] ?? 'user', {
              excludeUserId: createdAuth.id,
              suffixSeed: createdAuth.id,
            }),
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
      profile: applyNameCaseToUserFields(profile),
    },
    { status: 200 },
  );
  setAuthCookie(res, token);
  return res;
}
