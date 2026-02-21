import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { hashPassword, setAuthCookie, signSessionToken, SessionToken } from '@/lib/authServer';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  isSameUserName,
  normalizeUserName,
  reserveGeneratedUserName,
} from '@/server/userNames';

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

const parseDateOnly = (value?: string | null): Date | null => {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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
  firstName: normalizeText(input.firstName),
  lastName: normalizeText(input.lastName),
  userName: normalizeText(input.userName),
  dateOfBirth: normalizeDateOnly(input.dateOfBirth),
});

const buildExistingSnapshot = (profile: {
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  dateOfBirth: Date | null;
} | null): ProfileSnapshot => ({
  firstName: normalizeText(profile?.firstName),
  lastName: normalizeText(profile?.lastName),
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
    firstName: normalizeText(profileSelection?.firstName),
    lastName: normalizeText(profileSelection?.lastName),
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

export async function POST(req: NextRequest) {
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

  const existingSensitive = await prisma.sensitiveUserData.findFirst({ where: { email: normalizedEmail } });
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

  const parsedDateOfBirth = parseDateOnly(resolvedSnapshot.dateOfBirth);
  if (resolvedSnapshot.dateOfBirth && !parsedDateOfBirth) {
    return NextResponse.json({ error: 'Invalid dateOfBirth' }, { status: 400 });
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

      const profileRow = existingProfile
        ? await tx.userData.update({
            where: { id: createdAuth.id },
            data: {
              firstName: resolvedSnapshot.firstName ?? existingProfile.firstName,
              lastName: resolvedSnapshot.lastName ?? existingProfile.lastName,
              userName: finalUserName,
              dateOfBirth: parsedDateOfBirth ?? existingProfile.dateOfBirth,
              updatedAt: now,
            },
          })
        : await tx.userData.create({
            data: {
              id: createdAuth.id,
              createdAt: now,
              updatedAt: now,
              firstName: resolvedSnapshot.firstName,
              lastName: resolvedSnapshot.lastName,
              userName: finalUserName,
              dateOfBirth: parsedDateOfBirth ?? new Date('2000-01-01'),
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
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }

  const session: SessionToken = { userId: authUser.id, isAdmin: false };
  const token = signSessionToken(session);
  const res = NextResponse.json({
    user: toPublicUser(authUser),
    session,
    token,
    profile,
  }, { status: 201 });
  setAuthCookie(res, token);
  return res;
}
