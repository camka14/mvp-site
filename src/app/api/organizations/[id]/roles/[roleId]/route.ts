import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS, normalizeOrganizationPermissions } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { getOrganizationRolesWithPermissions } from '@/server/organizationRoles';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  permissions: z.array(z.string()).optional(),
}).passthrough();

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, roleId } = await params;
  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.ROLES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.organizationRoles.findFirst({
    where: {
      id: roleId,
      organizationId: id,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  }

  if (existing.isSystem && parsed.data.name && parsed.data.name !== existing.name) {
    return NextResponse.json({ error: 'System role names cannot be changed.' }, { status: 400 });
  }

  try {
    const role = await prisma.$transaction(async (tx) => {
      await tx.organizationRoles.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name && !existing.isSystem ? { name: parsed.data.name } : {}),
          updatedAt: new Date(),
        },
      });

      if (Object.prototype.hasOwnProperty.call(parsed.data, 'permissions')) {
        const permissions = normalizeOrganizationPermissions(parsed.data.permissions);
        await tx.organizationRolePermissions.deleteMany({
          where: { organizationRoleId: existing.id },
        });
        if (permissions.length > 0) {
          await tx.organizationRolePermissions.createMany({
            data: permissions.map((permission) => ({
              id: createId('org_role_permission'),
              organizationRoleId: existing.id,
              permission,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }

      const roles = await getOrganizationRolesWithPermissions(tx, id);
      return roles.find((entry) => entry.id === existing.id) ?? null;
    });

    return NextResponse.json({ role }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A role with that name already exists.' }, { status: 409 });
    }
    throw error;
  }
}
