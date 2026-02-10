import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, assertUserAccess } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

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

  const updated = await prisma.userData.update({
    where: { id },
    data: { ...parsed.data.data, updatedAt: new Date() },
  });
  return NextResponse.json({ user: withLegacyFields(updated) }, { status: 200 });
}
