import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields, normalizeOptionalName } from '@/lib/nameCase';
import { requireSession, assertUserAccess, getOptionalSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { hasOrganizationStaffAccess } from '@/server/accessControl';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  normalizeUserName,
} from '@/server/userNames';
import { applyUserPrivacy, createVisibilityContext, publicUserSelect } from '@/server/userPrivacy';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';

const USER_MUTABLE_FIELDS = new Set<string>([
  'firstName',
  'lastName',
  'dateOfBirth',
  'dobVerified',
  'dobVerifiedAt',
  'ageVerificationProvider',
  'teamIds',
  'friendIds',
  'userName',
  'hasStripeAccount',
  'followingIds',
  'friendRequestIds',
  'friendRequestSentIds',
  'uploadedImages',
  'profileImageId',
  'homePageOrganizationId',
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.userData.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = getOptionalSession(_req);
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
  return NextResponse.json({ user: withLegacyFields(applyUserPrivacy(user, visibilityContext)) }, { status: 200 });
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

  const unknownKeys = findUnknownKeys(parsed.payload, [
    ...USER_MUTABLE_FIELDS,
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

  const nextData: Record<string, unknown> = {};
  for (const key of USER_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(parsed.payload, key)) {
      nextData[key] = parsed.payload[key];
    }
  }
  normalizeNameFields(nextData);
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
            hostIds: true,
            officialIds: true,
          },
        });
        if (!organization) {
          return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
        }

        const isOrganizationRoleMember = await hasOrganizationStaffAccess(
          { userId: id, isAdmin: false },
          organization,
          ['HOST', 'OFFICIAL', 'STAFF'],
        );
        if (!isOrganizationRoleMember) {
          return NextResponse.json(
            { error: 'Only organization owners, hosts, or officials can set this organization as home page.' },
            { status: 403 },
          );
        }

        nextData.homePageOrganizationId = homePageOrganizationId;
      }
    }
  }

  try {
    const updated = await prisma.userData.update({
      where: { id },
      data: { ...nextData, updatedAt: new Date() },
    });
    return NextResponse.json({ user: withLegacyFields(applyNameCaseToUserFields(updated)) }, { status: 200 });
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }
}
