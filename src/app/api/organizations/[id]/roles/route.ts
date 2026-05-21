import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS, normalizeOrganizationPermissions } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ensureDefaultOrganizationRoles, getOrganizationRolesWithPermissions } from '@/server/organizationRoles';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.string()).default([]),
}).passthrough();

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
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

  const roles = await ensureDefaultOrganizationRoles(prisma, id);
  return NextResponse.json({ roles }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
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
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.ROLES_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const permissions = normalizeOrganizationPermissions(parsed.data.permissions);
  try {
    const role = await prisma.$transaction(async (tx) => {
      await ensureDefaultOrganizationRoles(tx, id);
      const created = await tx.organizationRoles.create({
        data: {
          id: createId('org_role'),
          organizationId: id,
          name: parsed.data.name,
          kind: 'STAFF',
          systemKey: null,
          isSystem: false,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (permissions.length > 0) {
        await tx.organizationRolePermissions.createMany({
          data: permissions.map((permission) => ({
            id: createId('org_role_permission'),
            organizationRoleId: created.id,
            permission,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }
      const roles = await getOrganizationRolesWithPermissions(tx, id);
      return roles.find((entry) => entry.id === created.id) ?? { ...created, permissions };
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A role with that name already exists.' }, { status: 409 });
    }
    throw error;
  }
}
