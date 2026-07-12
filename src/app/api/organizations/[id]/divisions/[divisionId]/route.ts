import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import {
  normalizeOrganizationDivisionInput,
  OrganizationDivisionValidationError,
  organizationDivisionView,
} from '@/server/organizationDivisions';

const divisionSchema = z.object({
  name: z.string().optional(),
  sportId: z.string(),
  gender: z.string(),
  skillDivisionTypeId: z.string(),
  ageDivisionTypeId: z.string(),
  price: z.number().int().nonnegative(),
  maxParticipants: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  registrationUrl: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  lastVerifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

const loadContext = async (organizationId: string, divisionId: string) => {
  const [organization, division] = await Promise.all([
    prisma.organizations.findUnique({ where: { id: organizationId }, select: { id: true, ownerId: true } }),
    prisma.divisions.findFirst({
      where: { id: divisionId, organizationId, scope: 'ORGANIZATION', eventId: null },
    }),
  ]);
  return { organization, division };
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; divisionId: string }> }) {
  const session = await requireSession(req);
  const { id, divisionId } = await params;
  const { organization, division } = await loadContext(id, divisionId);
  if (!organization || !division) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canManageOrganization(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = divisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const normalized = await normalizeOrganizationDivisionInput(parsed.data);
    const updated = await prisma.divisions.update({
      where: { id: divisionId },
      data: { ...normalized, updatedAt: new Date() },
    });
    return NextResponse.json({ division: organizationDivisionView(updated) }, { status: 200 });
  } catch (error) {
    if (error instanceof OrganizationDivisionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if ((error as { code?: unknown })?.code === 'P2002') {
      return NextResponse.json({ error: 'This organization already has that active division.' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; divisionId: string }> }) {
  const session = await requireSession(req);
  const { id, divisionId } = await params;
  const { organization, division } = await loadContext(id, divisionId);
  if (!organization || !division) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canManageOrganization(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const updated = await prisma.divisions.update({
    where: { id: divisionId },
    data: { status: 'ARCHIVED', updatedAt: new Date() },
  });
  return NextResponse.json({ division: organizationDivisionView(updated) }, { status: 200 });
}
