import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';

export const dynamic = 'force-dynamic';

const PRODUCT_MUTABLE_FIELDS = new Set<string>([
  'name',
  'description',
  'priceCents',
  'period',
  'isActive',
  'stripeProductId',
  'stripePriceId',
  'organizationId',
  'createdBy',
]);
const PRODUCT_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const PRODUCT_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'organizationId',
  'createdBy',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'product',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payload = parsed.payload;
  const unknownPayloadKeys = findUnknownKeys(payload, [
    ...PRODUCT_MUTABLE_FIELDS,
    ...PRODUCT_HARD_IMMUTABLE_FIELDS,
    ...PRODUCT_ADMIN_OVERRIDABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown product patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }

  const hardImmutableKeys = findPresentKeys(payload, PRODUCT_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable product fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }
  const adminOverrideKeys = findPresentKeys(payload, PRODUCT_ADMIN_OVERRIDABLE_FIELDS);
  if (adminOverrideKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable product fields cannot be updated.', fields: adminOverrideKeys },
      { status: 403 },
    );
  }

  const targetOrganizationIdRaw = (() => {
    const nextId = payload.organizationId;
    if (typeof nextId === 'string' && nextId.trim().length > 0) {
      return nextId.trim();
    }
    return existing.organizationId;
  })();
  const org = await prisma.organizations.findUnique({ where: { id: targetOrganizationIdRaw } });
  if (!session.isAdmin && !(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  for (const key of PRODUCT_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updateData[key] = payload[key];
    }
  }
  if (typeof updateData.period === 'string') {
    updateData.period = String(updateData.period).toUpperCase();
  }
  if (payload.period) {
    updateData.period = String(payload.period).toUpperCase();
  }

  const updated = await prisma.products.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() } as any,
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: existing.organizationId } });
  if (!(await canManageOrganization(session, org))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.products.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
