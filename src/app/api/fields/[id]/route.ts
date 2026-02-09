import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  field: z.record(z.string(), z.any()).optional(),
}).passthrough();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const field = await prisma.fields.findUnique({ where: { id } });
  if (!field) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyFields(field), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.fields.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.organizationId) {
    const org = await prisma.organizations.findUnique({
      where: { id: existing.organizationId },
      select: { ownerId: true },
    });
    if (!org) {
      if (!session.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (!session.isAdmin && org.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const payload = parsed.data.field ?? parsed.data ?? {};
  const updated = await prisma.fields.update({
    where: { id },
    data: { ...payload, updatedAt: new Date() },
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.fields.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const orgId = existing.organizationId;
  const organization = orgId
    ? await prisma.organizations.findUnique({
        where: { id: orgId },
        select: { id: true, ownerId: true, fieldIds: true },
      })
    : null;

  if (orgId && !organization) {
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (organization && !session.isAdmin && organization.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.fields.delete({ where: { id } });

    if (organization && orgId) {
      const currentIds = Array.isArray(organization.fieldIds) ? organization.fieldIds : [];
      const nextIds = currentIds.filter((fieldId) => fieldId !== id);
      await tx.organizations.update({
        where: { id: orgId },
        data: { fieldIds: nextIds, updatedAt: new Date() },
      });
    }
  });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
