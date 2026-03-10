import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeStaffMemberTypes } from '@/lib/staff';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  userId: z.string(),
  types: z.array(z.string()),
}).passthrough();

const deleteSchema = z.object({
  userId: z.string(),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const types = normalizeStaffMemberTypes(parsed.data.types);
  if (!types.length) {
    return NextResponse.json({ error: 'At least one staff type is required' }, { status: 400 });
  }

  const existing = await prisma.staffMembers.findUnique({
    where: {
      organizationId_userId: {
        organizationId: id,
        userId: parsed.data.userId,
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  }

  const updated = await prisma.staffMembers.update({
    where: { id: existing.id },
    data: {
      types,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ staffMember: updated }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.staffMembers.deleteMany({
      where: {
        organizationId: id,
        userId: parsed.data.userId,
      },
    });
    await tx.invites.deleteMany({
      where: {
        organizationId: id,
        userId: parsed.data.userId,
        type: 'STAFF',
      },
    });
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
