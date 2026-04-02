import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import { findPresentKeys, findUnknownKeys } from '@/server/http/strictPatch';

export const dynamic = 'force-dynamic';

const updateEnvelopeSchema = z.object({
  field: z.record(z.string(), z.unknown()),
}).strict();

const fieldPatchSchema = z.object({
  name: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  long: z.number().nullable().optional(),
  fieldNumber: z.number().optional(),
  heading: z.number().nullable().optional(),
  inUse: z.boolean().nullable().optional(),
  rentalSlotIds: z.array(z.string()).optional(),
  organizationId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
}).strict();

const FIELD_MUTABLE_FIELDS = new Set<string>([
  'name',
  'location',
  'lat',
  'long',
  'fieldNumber',
  'heading',
  'inUse',
  'rentalSlotIds',
  'organizationId',
  'createdBy',
]);
const FIELD_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const FIELD_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'organizationId',
  'createdBy',
]);

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const deriveLegacyOrglessFieldOwner = async (fieldId: string): Promise<string | null> => {
  const earliestLinkedEvent = await prisma.events.findFirst({
    where: {
      fieldIds: { has: fieldId },
    },
    select: {
      hostId: true,
    },
    orderBy: [
      { start: 'asc' },
      { createdAt: 'asc' },
    ],
  });
  return normalizeId(earliestLinkedEvent?.hostId);
};

const isUnknownPrismaCreatedByArgError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Unknown argument `createdBy`/i.test(message);
};

const findFieldOwnership = async (id: string): Promise<{
  id: string;
  organizationId: string | null;
  createdBy: string | null;
} | null> => {
  const fieldsDelegate = prisma.fields as any;
  try {
    return await fieldsDelegate.findUnique({
      where: { id },
      select: { id: true, organizationId: true, createdBy: true },
    });
  } catch (error) {
    if (!isUnknownPrismaCreatedByArgError(error)) {
      throw error;
    }
    const fallback = await fieldsDelegate.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    return fallback ? { ...fallback, createdBy: null } : null;
  }
};

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
  const parsedEnvelope = updateEnvelopeSchema.safeParse(body ?? {});
  if (!parsedEnvelope.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedEnvelope.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await findFieldOwnership(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payloadRecord = parsedEnvelope.data.field;
  const unknownPayloadKeys = findUnknownKeys(payloadRecord, [
    ...FIELD_MUTABLE_FIELDS,
    ...FIELD_HARD_IMMUTABLE_FIELDS,
    ...FIELD_ADMIN_OVERRIDABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown field patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }
  const hardImmutableKeys = findPresentKeys(payloadRecord, FIELD_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable field fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }
  const adminOverrideKeys = findPresentKeys(payloadRecord, FIELD_ADMIN_OVERRIDABLE_FIELDS);
  if (adminOverrideKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable field fields cannot be updated.', fields: adminOverrideKeys },
      { status: 403 },
    );
  }

  let resolvedCreatedBy = normalizeId(existing.createdBy);
  if (existing.organizationId) {
    const org = await prisma.organizations.findUnique({
      where: { id: existing.organizationId },
      select: { id: true, ownerId: true },
    });
    if (!org) {
      if (!session.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (!(await canManageOrganization(session, org))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    if (!resolvedCreatedBy) {
      const derivedOwnerId = await deriveLegacyOrglessFieldOwner(id);
      if (derivedOwnerId) {
        resolvedCreatedBy = derivedOwnerId;
        try {
          await (prisma.fields as any).update({
            where: { id },
            data: {
              createdBy: derivedOwnerId,
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          if (!isUnknownPrismaCreatedByArgError(error)) {
            throw error;
          }
        }
      }
    }
    if (!session.isAdmin) {
      if (!resolvedCreatedBy || resolvedCreatedBy !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const parsedPayload = fieldPatchSchema.safeParse(payloadRecord);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedPayload.error.flatten() }, { status: 400 });
  }

  const safePayload = parsedPayload.data as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};
  for (const key of FIELD_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(safePayload, key)) {
      updateData[key] = safePayload[key];
    }
  }
  const updated = await prisma.fields.update({
    where: { id },
    data: { ...updateData, updatedAt: new Date() } as any,
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
        select: { id: true, ownerId: true, hostIds: true, officialIds: true },
      })
    : null;

  if (orgId && !organization) {
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (organization && !(await canManageOrganization(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.fields.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
