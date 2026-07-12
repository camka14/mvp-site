import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { hashPassword } from '@/lib/authServer';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import { getRequestOrigin } from '@/lib/requestOrigin';
import {
  isInitialEmailVerificationAvailable,
  sendInitialEmailVerification,
} from '@/server/authEmailVerification';
import { sendAdminAccountCreatedNotification } from '@/server/adminNotifications';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  isSameUserName,
  normalizeUserName,
  reserveGeneratedUserName,
} from '@/server/userNames';
import {
  buildProfileCompletionState,
  resolveRequiredProfileFieldsCompletedAt,
} from '@/server/profileCompletion';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';
import { applyRateLimit, RATE_LIMIT_POLICIES } from '@/server/rateLimit';
import { isFutureDateOfBirth, parseDateOfBirth } from '@/lib/dateOfBirth';

const profileSelectionSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  userName: z.string().optional(),
  dateOfBirth: z.string().optional(),
}).optional();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  userName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  enforceProfileConflictSelection: z.boolean().optional(),
  profileSelection: profileSelectionSchema,
});

const PROFILE_CONFLICT_CODE = 'PROFILE_CONFLICT' as const;
const UNKNOWN_DATE_OF_BIRTH = new Date(0);

type ProfileField = 'firstName' | 'lastName' | 'userName' | 'dateOfBirth';

type ProfileSnapshot = {
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  dateOfBirth: string | null;
};

const PROFILE_FIELDS: ProfileField[] = ['firstName', 'lastName', 'userName', 'dateOfBirth'];

const toPublicUser = (user: { id: string; email: string; name: string | null; createdAt: Date | null; updatedAt: Date | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerifiedAt: null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const normalizeText = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeDateOnly = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.split('T')[0] ?? null;
};

const dateToDateOnly = (value?: Date | null): string | null => {
  if (!value) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
};

const buildIncomingSnapshot = (input: {
  firstName?: string;
  lastName?: string;
  userName?: string;
  dateOfBirth?: string;
}): ProfileSnapshot => ({
  firstName: normalizeOptionalName(input.firstName),
  lastName: normalizeOptionalName(input.lastName),
  userName: normalizeText(input.userName),
  dateOfBirth: normalizeDateOnly(input.dateOfBirth),
});

const buildExistingSnapshot = (profile: {
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  dateOfBirth: Date | null;
} | null): ProfileSnapshot => ({
  firstName: normalizeOptionalName(profile?.firstName),
  lastName: normalizeOptionalName(profile?.lastName),
  userName: normalizeText(profile?.userName),
  dateOfBirth: dateToDateOnly(profile?.dateOfBirth),
});

const getConflictingFields = (existing: ProfileSnapshot, incoming: ProfileSnapshot): ProfileField[] => {
  return PROFILE_FIELDS.filter((field) => {
    const incomingValue = incoming[field];
    if (incomingValue == null) return false;
    return incomingValue !== existing[field];
  });
};

const resolveProfileSnapshot = ({
  existing,
  incoming,
  conflicts,
  profileSelection,
}: {
  existing: ProfileSnapshot;
  incoming: ProfileSnapshot;
  conflicts: ProfileField[];
  profileSelection?: {
    firstName?: string;
    lastName?: string;
    userName?: string;
    dateOfBirth?: string;
  };
}): ProfileSnapshot => {
  const selected: ProfileSnapshot = {
    firstName: normalizeOptionalName(profileSelection?.firstName),
    lastName: normalizeOptionalName(profileSelection?.lastName),
    userName: normalizeText(profileSelection?.userName),
    dateOfBirth: normalizeDateOnly(profileSelection?.dateOfBirth),
  };

  const resolved: ProfileSnapshot = { ...existing };
  PROFILE_FIELDS.forEach((field) => {
    const incomingValue = incoming[field];
    if (incomingValue == null) return;

    if (conflicts.includes(field)) {
      // If selection omits a field, default to existing value for safety.
      resolved[field] = selected[field] ?? existing[field];
      return;
    }

    resolved[field] = incomingValue;
  });

  return resolved;
};

const profileConflictResponse = (
  existing: ProfileSnapshot,
  incoming: ProfileSnapshot,
  conflicts: ProfileField[],
) => {
  return NextResponse.json({
    error: 'Profile selection required',
    code: PROFILE_CONFLICT_CODE,
    conflict: {
      fields: conflicts,
      existing,
      incoming,
    },
  }, { status: 409 });
};

const resolveInviteHomeOrganizationId = async (client: any, userId: string): Promise<string | null> => {
  const invite = await client.invites.findFirst({
    where: {
      userId,
      type: 'STAFF',
      organizationId: { not: null },
      status: { notIn: ['DECLINED', 'FAILED'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  if (typeof invite?.organizationId === 'string' && invite.organizationId.trim()) {
    return invite.organizationId.trim();
  }

  const staffMember = await client.staffMembers.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  if (typeof staffMember?.organizationId === 'string' && staffMember.organizationId.trim()) {
    return staffMember.organizationId.trim();
  }

  return null;
};

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, RATE_LIMIT_POLICIES.authRegister);
  if (rateLimited) {
    return rateLimited;
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    email,
    password,
    name,
    firstName,
    lastName,
    userName,
    dateOfBirth,
    enforceProfileConflictSelection,
    profileSelection,
  } = parsed.data;

  const normalizedEmail = email.toLowerCase();

  const existingAuth = await prisma.authUser.findUnique({ where: { email: normalizedEmail } });
  if (existingAuth && !isInvitePlaceholderAuthUser(existingAuth)) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const existingSensitive = await prisma.sensitiveUserData.findUnique({ where: { email: normalizedEmail } });
  const userId = existingAuth?.id || existingSensitive?.userId || crypto.randomUUID();

  const existingProfile = (existingAuth || existingSensitive)
    ? await prisma.userData.findUnique({ where: { id: userId } })
    : null;

  const existingSnapshot = buildExistingSnapshot(existingProfile);
  const incomingSnapshot = buildIncomingSnapshot({ firstName, lastName, userName, dateOfBirth });
  const conflictFields = existingProfile
    ? getConflictingFields(existingSnapshot, incomingSnapshot)
    : [];

  if (existingProfile && enforceProfileConflictSelection && conflictFields.length > 0 && !profileSelection) {
    return profileConflictResponse(existingSnapshot, incomingSnapshot, conflictFields);
  }

  const resolvedSnapshot = existingProfile
    ? resolveProfileSnapshot({
        existing: existingSnapshot,
        incoming: incomingSnapshot,
        conflicts: conflictFields,
        profileSelection,
      })
    : incomingSnapshot;

  const parsedDateOfBirth = parseDateOfBirth(resolvedSnapshot.dateOfBirth);
  if (resolvedSnapshot.dateOfBirth && !parsedDateOfBirth) {
    return NextResponse.json({ error: 'Invalid dateOfBirth' }, { status: 400 });
  }
  if (parsedDateOfBirth && isFutureDateOfBirth(parsedDateOfBirth)) {
    return NextResponse.json({ error: 'dateOfBirth cannot be in the future' }, { status: 400 });
  }

  const existingUserName = normalizeUserName(existingProfile?.userName);
  const selectedUserName = normalizeUserName(resolvedSnapshot.userName);
  const shouldAutoGenerateUserName = !selectedUserName && !existingUserName;
  const baseUserName = selectedUserName
    ?? existingUserName
    ?? normalizedEmail.split('@')[0]
    ?? 'user';

  const finalUserName = shouldAutoGenerateUserName
    ? await reserveGeneratedUserName(prisma, baseUserName, { excludeUserId: userId, suffixSeed: userId })
    : baseUserName;

  const userNameConflictUserId = await findUserNameConflictUserId(prisma, finalUserName, userId);
  if (userNameConflictUserId && !isSameUserName(existingUserName, finalUserName)) {
    return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const now = new Date();

  let authUser: Awaited<ReturnType<typeof prisma.authUser.create>>;
  let profile: Awaited<ReturnType<typeof prisma.userData.create>>;
  try {
    [authUser, profile] = await prisma.$transaction(async (tx) => {
      const createdAuth = existingAuth
        ? await tx.authUser.update({
            where: { id: existingAuth.id },
            data: {
              passwordHash,
              name: name ?? existingAuth.name,
              updatedAt: now,
              lastLogin: now,
            },
          })
        : await tx.authUser.create({
            data: {
              id: userId,
              email: normalizedEmail,
              passwordHash,
              name: name ?? null,
              createdAt: now,
              updatedAt: now,
              lastLogin: now,
            },
          });

      const inviteHomeOrganizationId = existingAuth && isInvitePlaceholderAuthUser(existingAuth)
        ? await resolveInviteHomeOrganizationId(tx, createdAuth.id)
        : null;

      const profileRow = existingProfile
        ? await (() => {
            const nextProfile = {
              firstName: resolvedSnapshot.firstName ?? existingProfile.firstName,
              lastName: resolvedSnapshot.lastName ?? existingProfile.lastName,
              dateOfBirth: parsedDateOfBirth ?? existingProfile.dateOfBirth,
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
                userName: finalUserName,
                dateOfBirth: nextProfile.dateOfBirth,
                ...(inviteHomeOrganizationId && !existingProfile.homePageOrganizationId
                  ? { homePageOrganizationId: inviteHomeOrganizationId }
                  : {}),
                requiredProfileFieldsCompletedAt,
                updatedAt: now,
              },
            });
          })()
        : await (() => {
            const nextProfile = {
              firstName: resolvedSnapshot.firstName,
              lastName: resolvedSnapshot.lastName,
              dateOfBirth: parsedDateOfBirth ?? UNKNOWN_DATE_OF_BIRTH,
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
                userName: finalUserName,
                dateOfBirth: nextProfile.dateOfBirth,
                requiredProfileFieldsCompletedAt,
                teamIds: [],
                friendIds: [],
                friendRequestIds: [],
                friendRequestSentIds: [],
                followingIds: [],
                uploadedImages: [],
                profileImageId: null,
                homePageOrganizationId: inviteHomeOrganizationId,
              },
            });
          })();

      await tx.sensitiveUserData.upsert({
        where: { userId: createdAuth.id },
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
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }

  const shouldNotifyAccountCreated = !existingAuth || isInvitePlaceholderAuthUser(existingAuth);
  const adminNotificationPromise = shouldNotifyAccountCreated
    ? sendAdminAccountCreatedNotification({
        userId: authUser.id,
        email: authUser.email,
        name: authUser.name,
        firstName: profile.firstName,
        lastName: profile.lastName,
        userName: profile.userName,
        dateOfBirth: profile.dateOfBirth,
        createdAt: authUser.createdAt ?? now,
        authProvider: 'password',
        wasInviteClaim: Boolean(existingAuth && isInvitePlaceholderAuthUser(existingAuth)),
      }).catch((error) => {
        console.warn('Failed to send admin account creation notification', {
          userId: authUser.id,
          error,
        });
      })
    : Promise.resolve();

  let verificationEmailSent = false;
  if (!isInitialEmailVerificationAvailable()) {
    console.warn('Email verification is unavailable during registration', { userId: authUser.id });
  } else {
    try {
      await sendInitialEmailVerification({
        userId: authUser.id,
        email: authUser.email,
        origin: getRequestOrigin(req),
      });
      verificationEmailSent = true;
    } catch (error) {
      // Account persistence is complete. Return its authenticated, unverified
      // state so the client can offer a resend rather than treating signup as
      // failed and retrying into a duplicate-email error.
      console.error('Failed to send verification email during registration', error);
    }
  }
  await adminNotificationPromise;

  const [profileWithDerivedTeamIds] = await withDerivedCanonicalTeamIds([profile], prisma);

  const response = NextResponse.json(
    {
      error: verificationEmailSent
        ? 'Email not verified. We sent a verification link to your email.'
        : 'Your account was created, but we could not send a verification email. You can resend it from the sign-in screen.',
      code: 'EMAIL_NOT_VERIFIED',
      email: authUser.email,
      requiresEmailVerification: true,
      verificationEmailSent,
      user: toPublicUser(authUser),
      profile: applyNameCaseToUserFields(profileWithDerivedTeamIds),
      ...buildProfileCompletionState({ authUser, profile }),
    },
    { status: 202 },
  );
  return response;
}
