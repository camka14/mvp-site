import crypto from 'crypto';
import { Prisma } from '@/generated/prisma/client';
import { INVITED_PLACEHOLDER_PASSWORD_HASH } from '@/lib/authUserPlaceholders';

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const defaultInvitedUserName = (userId: string): string => {
  // UserData is public; never derive usernames from email (even partially).
  const compact = userId.replace(/-/g, '');
  return `invited-${compact.slice(0, 12) || 'user'}`;
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
): Promise<{ userId: string; authUserExisted: boolean }> => {
  const normalizedEmail = normalizeEmail(email);
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
        name: null,
        emailVerifiedAt: null,
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const existingProfile = await tx.userData.findUnique({ where: { id: userId } });
  if (!existingProfile) {
    await tx.userData.create({
      data: {
        id: userId,
        createdAt: now,
        updatedAt: now,
        firstName: null,
        lastName: null,
        userName: defaultInvitedUserName(userId),
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
