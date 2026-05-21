import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getStaffMemberTypesForOrganizationRole, normalizeStaffMemberTypes } from '@/lib/staff';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { resolveDefaultOrganizationRoleIdForStaffTypes } from '@/server/organizationRoles';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  userId: z.string(),
  types: z.array(z.string()).optional(),
  roleId: z.string().nullable().optional(),
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
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.STAFF_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!Object.prototype.hasOwnProperty.call(parsed.data, 'types')
    && !Object.prototype.hasOwnProperty.call(parsed.data, 'roleId')) {
    return NextResponse.json({ error: 'At least one staff field is required' }, { status: 400 });
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

  const data: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  let nextTypes = normalizeStaffMemberTypes(existing.types);
  if (Object.prototype.hasOwnProperty.call(parsed.data, 'types')) {
    nextTypes = normalizeStaffMemberTypes(parsed.data.types);
    if (!nextTypes.length) {
      return NextResponse.json({ error: 'At least one staff type is required' }, { status: 400 });
    }
    data.types = nextTypes;
  }

  if (typeof parsed.data.roleId === 'string') {
    const role = await prisma.organizationRoles.findFirst({
      where: {
        id: parsed.data.roleId,
        organizationId: id,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        systemKey: true,
      },
    });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    nextTypes = getStaffMemberTypesForOrganizationRole(role);
    data.types = nextTypes;
    data.roleId = role.id;
  } else if (parsed.data.roleId === null) {
    data.roleId = await resolveDefaultOrganizationRoleIdForStaffTypes(prisma, id, nextTypes);
  } else if (!existing.roleId && Object.prototype.hasOwnProperty.call(parsed.data, 'types')) {
    data.roleId = await resolveDefaultOrganizationRoleIdForStaffTypes(prisma, id, nextTypes);
  }

  const updated = await prisma.staffMembers.update({
    where: { id: existing.id },
    data,
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
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.STAFF_MANAGE))) {
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
