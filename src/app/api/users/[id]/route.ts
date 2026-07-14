import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseAccountVisibility } from '@/lib/accountVisibility';
import { applyNameCaseToUserFields, formatNameParts, normalizeOptionalName } from '@/lib/nameCase';
import { requireSession, assertUserAccess, getOptionalSession } from '@/lib/permissions';
import { getBlockingStaffInvite } from '@/lib/staff';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  normalizeUserName,
} from '@/server/userNames';
import { resolveRequiredProfileFieldsCompletedAt } from '@/server/profileCompletion';
import { normalizeNotificationSettings } from '@/lib/notificationSettings';
import { normalizeOnboardingIntent } from '@/lib/onboardingIntent';
import { applyUserPrivacy, createVisibilityContext, currentUserSelect, publicUserSelect } from '@/server/userPrivacy';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';
import { isFutureDateOfBirth, parseDateOfBirth } from '@/lib/dateOfBirth';

const USER_MUTABLE_FIELDS = new Set<string>([
  'firstName',
  'lastName',
  'dateOfBirth',
  'friendIds',
  'userName',
  'followingIds',
  'friendRequestIds',
  'friendRequestSentIds',
  'uploadedImages',
  'profileImageId',
  'homePageOrganizationId',
  'onboardingIntent',
  'accountVisibility',
  'notificationSettings',
]);
const USER_SERVER_MANAGED_FIELDS = new Set<string>([
  'dobVerified',
  'dobVerifiedAt',
  'ageVerificationProvider',
  'hasStripeAccount',
]);
const USER_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);

const normalizeNameFields = (data: Record<string, unknown>) => {
  if (Object.prototype.hasOwnProperty.call(data, 'firstName')) {
    data.firstName = normalizeOptionalName(data.firstName);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'lastName')) {
    data.lastName = normalizeOptionalName(data.lastName);
  }
};

const canSetHomePageOrganization = async (
  userId: string,
  organization: { id?: string | null; ownerId?: string | null },
): Promise<boolean> => {
  if (organization.ownerId === userId) {
    return true;
  }
  const organizationId = typeof organization.id === 'string' ? organization.id.trim() : '';
  if (!organizationId) {
    return false;
  }

  const [staffMember, invites] = await Promise.all([
    prisma.staffMembers.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        organizationId: true,
        userId: true,
      },
    }),
    prisma.invites.findMany({
      where: {
        organizationId,
        userId,
        type: 'STAFF',
      },
      select: {
        organizationId: true,
        userId: true,
        type: true,
        status: true,
      },
    }),
  ]);

  return Boolean(staffMember) && !getBlockingStaffInvite(invites, organizationId, userId);
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOptionalSession(_req);
  const shouldExposeCurrentUserFields = Boolean(session?.isAdmin || session?.userId === id);
  const user = await prisma.userData.findUnique({
    where: { id },
    select: shouldExposeCurrentUserFields ? currentUserSelect : publicUserSelect,
  });
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const query = _req.nextUrl.searchParams;
  const parseContextId = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  };

  const visibilityContext = await createVisibilityContext(prisma, {
    viewerId: session?.userId,
    isAdmin: session?.isAdmin,
    teamId: parseContextId(query.get('teamId')),
    eventId: parseContextId(query.get('eventId')),
  });
  const [userWithDerivedTeamIds] = await withDerivedCanonicalTeamIds([user], prisma);
  return NextResponse.json({ user: applyUserPrivacy(userWithDerivedTeamIds, visibilityContext) }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  assertUserAccess(session, id);

  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'data',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(parsed.payload, 'teamIds')) {
    return NextResponse.json(
      { error: 'teamIds is derived from team memberships and cannot be updated directly.' },
      { status: 403 },
    );
  }

  const serverManagedKeys = findPresentKeys(parsed.payload, USER_SERVER_MANAGED_FIELDS);
  if (serverManagedKeys.length) {
    return NextResponse.json(
      { error: 'Server-managed user fields cannot be updated directly.', fields: serverManagedKeys },
      { status: 403 },
    );
  }

  const unknownKeys = findUnknownKeys(parsed.payload, [
    ...USER_MUTABLE_FIELDS,
    ...USER_SERVER_MANAGED_FIELDS,
    ...USER_IMMUTABLE_FIELDS,
  ]);
  if (unknownKeys.length) {
    return NextResponse.json(
      { error: 'Unknown user patch fields.', unknownKeys },
      { status: 400 },
    );
  }
  const immutableKeys = findPresentKeys(parsed.payload, USER_IMMUTABLE_FIELDS);
  if (immutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable user fields cannot be updated.', fields: immutableKeys },
      { status: 403 },
    );
  }

  const [currentUser, authUser] = await Promise.all([
    prisma.userData.findUnique({
      where: { id },
      select: {
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        requiredProfileFieldsCompletedAt: true,
      },
    }),
    prisma.authUser.findUnique({
      where: { id },
      select: {
        appleSubject: true,
        googleSubject: true,
      },
    }),
  ]);
  if (!currentUser || !authUser) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const nextData: Record<string, unknown> = {};
  for (const key of USER_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(parsed.payload, key)) {
      nextData[key] = parsed.payload[key];
    }
  }
  normalizeNameFields(nextData);
  if (Object.prototype.hasOwnProperty.call(nextData, 'dateOfBirth')) {
    const parsedDate = parseDateOfBirth(nextData.dateOfBirth);
    if (!parsedDate) {
      return NextResponse.json({ error: 'dateOfBirth must be a valid date.' }, { status: 400 });
    }
    if (isFutureDateOfBirth(parsedDate)) {
      return NextResponse.json({ error: 'dateOfBirth cannot be in the future.' }, { status: 400 });
    }
    nextData.dateOfBirth = parsedDate;
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'userName')) {
    const normalizedUserName = normalizeUserName(nextData.userName);
    if (!normalizedUserName) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
    }
    const conflictUserId = await findUserNameConflictUserId(prisma, normalizedUserName, id);
    if (conflictUserId) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    nextData.userName = normalizedUserName;
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'notificationSettings')) {
    nextData.notificationSettings = normalizeNotificationSettings(nextData.notificationSettings);
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'onboardingIntent')) {
    const rawOnboardingIntent = nextData.onboardingIntent;
    if (rawOnboardingIntent == null || rawOnboardingIntent === '') {
      nextData.onboardingIntent = null;
    } else {
      const onboardingIntent = normalizeOnboardingIntent(rawOnboardingIntent);
      if (!onboardingIntent) {
        return NextResponse.json({ error: 'onboardingIntent is invalid.' }, { status: 400 });
      }
      nextData.onboardingIntent = onboardingIntent;
    }
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'accountVisibility')) {
    const accountVisibility = parseAccountVisibility(nextData.accountVisibility);
    if (!accountVisibility) {
      return NextResponse.json({ error: 'accountVisibility is invalid.' }, { status: 400 });
    }
    nextData.accountVisibility = accountVisibility;
  }

  if (Object.prototype.hasOwnProperty.call(nextData, 'homePageOrganizationId')) {
    const rawHomePageOrganizationId = nextData.homePageOrganizationId;

    if (rawHomePageOrganizationId == null || rawHomePageOrganizationId === '') {
      nextData.homePageOrganizationId = null;
    } else if (typeof rawHomePageOrganizationId !== 'string') {
      return NextResponse.json({ error: 'homePageOrganizationId must be a string or null.' }, { status: 400 });
    } else {
      const homePageOrganizationId = rawHomePageOrganizationId.trim();
      if (!homePageOrganizationId) {
        nextData.homePageOrganizationId = null;
      } else {
        const organization = await prisma.organizations.findUnique({
          where: { id: homePageOrganizationId },
          select: {
            id: true,
            ownerId: true,
          },
        });
        if (!organization) {
          return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
        }

        if (!await canSetHomePageOrganization(id, organization)) {
          return NextResponse.json(
            { error: 'Only organization members can set this organization as home page.' },
            { status: 403 },
          );
        }

        nextData.homePageOrganizationId = homePageOrganizationId;
      }
    }
  }

  try {
    const updatedAt = new Date();
    const nextFirstName = Object.prototype.hasOwnProperty.call(nextData, 'firstName')
      ? (nextData.firstName as string | null)
      : currentUser.firstName;
    const nextLastName = Object.prototype.hasOwnProperty.call(nextData, 'lastName')
      ? (nextData.lastName as string | null)
      : currentUser.lastName;
    const requiredProfileFieldsCompletedAt = resolveRequiredProfileFieldsCompletedAt({
      authUser,
      profile: {
        firstName: nextFirstName,
        lastName: nextLastName,
        dateOfBirth: Object.prototype.hasOwnProperty.call(nextData, 'dateOfBirth')
          ? (nextData.dateOfBirth as Date)
          : currentUser.dateOfBirth,
        requiredProfileFieldsCompletedAt: currentUser.requiredProfileFieldsCompletedAt,
      },
      now: updatedAt,
    });
    const updated = await prisma.userData.update({
      where: { id },
      data: {
        ...nextData,
        requiredProfileFieldsCompletedAt,
        updatedAt,
      },
    });
    if (
      Object.prototype.hasOwnProperty.call(nextData, 'firstName') ||
      Object.prototype.hasOwnProperty.call(nextData, 'lastName')
    ) {
      await prisma.authUser.update({
        where: { id },
        data: {
          name: formatNameParts(nextFirstName, nextLastName) || null,
          updatedAt,
        },
      });
    }
    const [updatedWithDerivedTeamIds] = await withDerivedCanonicalTeamIds([updated], prisma);
    return NextResponse.json({ user: applyNameCaseToUserFields(updatedWithDerivedTeamIds) }, { status: 200 });
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }
}
