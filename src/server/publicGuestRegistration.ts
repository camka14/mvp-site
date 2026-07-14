import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Prisma } from '@/generated/prisma/client';
import { getAuthSecret } from '@/lib/authServer';
import { parseDateOfBirth } from '@/lib/dateOfBirth';
import { normalizeOptionalName } from '@/lib/nameCase';
import { prisma } from '@/lib/prisma';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { getPublicOrganizationBySlug, type PublicOrganizationSummary } from '@/server/publicOrganizationCatalog';

type PrismaLike = Prisma.TransactionClient | typeof prisma | any;

export type PublicGuestEventContext = {
  organization: PublicOrganizationSummary;
  event: Record<string, any>;
};

export type GuestRegistrationTokenPayload = JwtPayload & {
  kind: 'guest_registration';
  organizationId: string;
  eventId: string;
  registrationId: string;
  parentUserId: string;
  registrantId?: string | null;
  teamId?: string | null;
  eventTeamId?: string | null;
};

const DEFAULT_INVITED_DOB_TIME = new Date('2000-01-01T00:00:00.000Z').getTime();
const GUEST_TOKEN_TTL_SECONDS = 60 * 60 * 2;

export const normalizeGuestEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized && normalized.includes('@') ? normalized : null;
};

export const normalizeGuestText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const parseGuestDateOfBirth = (value: unknown): Date | null => {
  return parseDateOfBirth(value);
};

const buildGuestUserName = (prefix: string): string => {
  const compact = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}-${compact.slice(0, 18)}`;
};

export const ensureGuestParentIdentity = async (
  tx: PrismaLike,
  input: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: Date | null;
  },
  now: Date,
): Promise<{ userId: string; email: string; authUserExisted: boolean }> => {
  const email = normalizeGuestEmail(input.email);
  if (!email) {
    throw new Error('Parent email is required.');
  }

  const normalizedFirstName = normalizeOptionalName(input.firstName);
  const normalizedLastName = normalizeOptionalName(input.lastName);
  const [existingAuthUser, existingSensitiveUser] = await Promise.all([
    tx.authUser.findUnique({
      where: { email },
      select: { id: true },
    }),
    tx.sensitiveUserData.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { userId: true },
    }),
  ]);
  if (existingAuthUser || existingSensitiveUser) {
    throw Object.assign(
      new Error('An account already exists for this email. Sign in to register or manage this participant.'),
      { status: 409 },
    );
  }
  const identity = await ensureAuthUserAndUserDataByEmail(tx, email, now, {
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
  });

  if (input.dateOfBirth) {
    const profile = await tx.userData.findUnique({
      where: { id: identity.userId },
      select: { dateOfBirth: true },
    });
    const currentDobTime = profile?.dateOfBirth instanceof Date
      ? profile.dateOfBirth.getTime()
      : null;
    if (currentDobTime === DEFAULT_INVITED_DOB_TIME) {
      await tx.userData.update({
        where: { id: identity.userId },
        data: {
          dateOfBirth: input.dateOfBirth,
          updatedAt: now,
        },
      });
    }
  }

  return { ...identity, email };
};

export const ensureGuestChildUserData = async (
  tx: PrismaLike,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth: Date;
  },
  now: Date,
): Promise<{ userId: string }> => {
  if (!input.dateOfBirth || Number.isNaN(input.dateOfBirth.getTime())) {
    throw new Error('Child date of birth is required.');
  }

  const userId = crypto.randomUUID();
  await tx.userData.create({
    data: {
      id: userId,
      createdAt: now,
      updatedAt: now,
      firstName: normalizeOptionalName(input.firstName),
      lastName: normalizeOptionalName(input.lastName),
      userName: buildGuestUserName('guest-child'),
      dateOfBirth: input.dateOfBirth,
      friendIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      followingIds: [],
      uploadedImages: [],
      profileImageId: null,
    },
  });
  return { userId };
};

export const ensureGuestParentChildLink = async (
  tx: PrismaLike,
  input: {
    parentId: string;
    childId: string;
    relationship?: string | null;
  },
  now: Date,
): Promise<void> => {
  const existing = await tx.parentChildLinks.findFirst({
    where: {
      parentId: input.parentId,
      childId: input.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await tx.parentChildLinks.create({
    data: {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      parentId: input.parentId,
      childId: input.childId,
      status: 'ACTIVE',
      relationship: normalizeGuestText(input.relationship) ?? 'child',
      linkMethod: 'PUBLIC_WIDGET_GUEST',
      createdBy: input.parentId,
      endedAt: null,
    },
  });
};

export const assertPublicWidgetEvent = async (
  slugInput: string,
  eventIdInput: string,
): Promise<PublicGuestEventContext | null> => {
  const slug = normalizeGuestText(slugInput)?.toLowerCase() ?? '';
  const eventId = normalizeGuestText(eventIdInput);
  if (!slug || !eventId) {
    return null;
  }

  const organization = await getPublicOrganizationBySlug(slug, { surface: 'widget' });
  if (!organization) {
    return null;
  }

  const event = await (prisma as any).events.findUnique({
    where: { id: eventId },
  });
  if (!event || event.organizationId !== organization.id) {
    return null;
  }

  const state = String(event.state ?? '').trim().toUpperCase();
  if (state && state !== 'PUBLISHED') {
    return null;
  }

  return { organization, event };
};

export const normalizeRequiredTemplateIds = (values: unknown): string[] => (
  Array.isArray(values)
    ? Array.from(new Set(
      values
        .map((value) => normalizeGuestText(value))
        .filter((value): value is string => Boolean(value)),
    ))
    : []
);

export const signGuestRegistrationToken = (payload: Omit<GuestRegistrationTokenPayload, keyof JwtPayload | 'kind'>): string => (
  jwt.sign(
    {
      kind: 'guest_registration',
      ...payload,
    },
    getAuthSecret(),
    { expiresIn: GUEST_TOKEN_TTL_SECONDS },
  )
);

export const verifyGuestRegistrationToken = (
  token: unknown,
): GuestRegistrationTokenPayload | null => {
  const normalized = normalizeGuestText(token);
  if (!normalized) {
    return null;
  }
  try {
    const decoded = jwt.verify(normalized, getAuthSecret());
    if (!decoded || typeof decoded !== 'object') {
      return null;
    }
    const payload = decoded as GuestRegistrationTokenPayload;
    if (payload.kind !== 'guest_registration') {
      return null;
    }
    if (!payload.organizationId || !payload.eventId || !payload.registrationId || !payload.parentUserId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
