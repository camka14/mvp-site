import crypto from 'crypto';
import { Prisma } from '@/generated/prisma/client';
import { INVITED_PLACEHOLDER_PASSWORD_HASH } from '@/lib/authUserPlaceholders';
import { normalizeOptionalName } from '@/lib/nameCase';

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const defaultInvitedUserName = (userId: string): string => {
  // UserData is public; never derive usernames from email (even partially).
  const compact = userId.replace(/-/g, '');
  return `invited-${compact.slice(0, 12) || 'user'}`;
};

const normalizeUserNameToken = (value: string | null): string => {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const buildInviteUserNamePrefix = (firstName: string | null, lastName: string | null): string | null => {
  const first = normalizeUserNameToken(firstName);
  const last = normalizeUserNameToken(lastName);
  if (!first || !last) {
    return null;
  }
  const maxPrefixLength = 58; // Keep room for 4 digits and stay under common 63-char limits.
  return `${first}.${last}`.slice(0, maxPrefixLength);
};

const randomFourDigitSuffix = (): string => String(crypto.randomInt(0, 10000)).padStart(4, '0');

const reserveInviteUserName = async (
  tx: Prisma.TransactionClient,
  userId: string,
  firstName: string | null,
  lastName: string | null,
): Promise<string> => {
  const prefix = buildInviteUserNamePrefix(firstName, lastName);
  if (!prefix) {
    return defaultInvitedUserName(userId);
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = `${prefix}${randomFourDigitSuffix()}`;
    const conflict = await tx.userData.findFirst({
      where: {
        userName: { equals: candidate, mode: 'insensitive' },
        id: { not: userId },
      },
      select: { id: true },
    });
    if (!conflict) {
      return candidate;
    }
  }

  return defaultInvitedUserName(userId);
};

/**
 * Ensures we have:
 * - an AuthUser row for `email` (placeholder passwordHash when invite-created)
 * - a UserData row (public profile, no email)
 * - a SensitiveUserData row mapping email -> userId
 */
export const ensureAuthUserAndUserDataByEmail = async (
  tx: Prisma.TransactionClient,
  email: string,
  now: Date,
  options: {
    firstName?: string | null;
    lastName?: string | null;
  } = {},
): Promise<{ userId: string; authUserExisted: boolean }> => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFirstName = normalizeOptionalName(options.firstName);
  const normalizedLastName = normalizeOptionalName(options.lastName);
  const normalizedAuthName = [normalizedFirstName, normalizedLastName]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim() || null;
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  const existingAuth = await tx.authUser.findUnique({ where: { email: normalizedEmail } });
  const existingSensitive = await tx.sensitiveUserData.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();
  const authUserExisted = Boolean(existingAuth);

  if (!existingAuth) {
    await tx.authUser.create({
      data: {
        id: userId,
        email: normalizedEmail,
        passwordHash: INVITED_PLACEHOLDER_PASSWORD_HASH,
        name: normalizedAuthName,
        emailVerifiedAt: null,
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
      },
    });
  } else if (normalizedAuthName && !normalizeOptionalName(existingAuth.name)) {
    await tx.authUser.update({
      where: { id: existingAuth.id },
      data: {
        name: normalizedAuthName,
        updatedAt: now,
      },
    });
  }

  const existingProfile = await tx.userData.findUnique({ where: { id: userId } });
  if (!existingProfile) {
    const reservedUserName = await reserveInviteUserName(tx, userId, normalizedFirstName, normalizedLastName);
    await tx.userData.create({
      data: {
        id: userId,
        createdAt: now,
        updatedAt: now,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        userName: reservedUserName,
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
  } else {
    const existingFirstName = normalizeOptionalName(existingProfile.firstName);
    const existingLastName = normalizeOptionalName(existingProfile.lastName);
    const userDataUpdate: Prisma.UserDataUpdateInput = {};
    if (normalizedFirstName && !existingFirstName) {
      userDataUpdate.firstName = normalizedFirstName;
    }
    if (normalizedLastName && !existingLastName) {
      userDataUpdate.lastName = normalizedLastName;
    }
    if (Object.keys(userDataUpdate).length) {
      userDataUpdate.updatedAt = now;
      await tx.userData.update({
        where: { id: userId },
        data: userDataUpdate,
      });
    }
  }

  await tx.sensitiveUserData.upsert({
    where: { id: existingSensitive?.id ?? userId },
    update: {
      email: normalizedEmail,
      userId,
      updatedAt: now,
    },
    create: {
      id: userId,
      email: normalizedEmail,
      userId,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { userId, authUserExisted };
};
