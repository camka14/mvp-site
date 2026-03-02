import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, assertUserAccess } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  findUserNameConflictUserId,
  isPrismaUserNameUniqueError,
  normalizeUserName,
} from '@/server/userNames';

const publicUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  dobVerified: true,
  dobVerifiedAt: true,
  ageVerificationProvider: true,
  teamIds: true,
  friendIds: true,
  userName: true,
  hasStripeAccount: true,
  followingIds: true,
  friendRequestIds: true,
  friendRequestSentIds: true,
  uploadedImages: true,
  profileImageId: true,
  homePageOrganizationId: true,
};

const updateSchema = z.object({
  data: z.record(z.string(), z.any()),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.userData.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  assertUserAccess(session, id);

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const nextData: Record<string, unknown> = { ...parsed.data.data };
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
            refIds: true,
          },
        });
        if (!organization) {
          return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
        }

        const isOrganizationRoleMember = organization.ownerId === id
          || organization.hostIds.includes(id)
          || organization.refIds.includes(id);
        if (!isOrganizationRoleMember) {
          return NextResponse.json(
            { error: 'Only organization owners, hosts, or referees can set this organization as home page.' },
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
    return NextResponse.json({ user: withLegacyFields(updated) }, { status: 200 });
  } catch (error) {
    if (isPrismaUserNameUniqueError(error)) {
      return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    }
    throw error;
  }
}
