import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { canAccessOrganizationUsers } from '@/server/organizationUsersAccess';

export const dynamic = 'force-dynamic';
const UNKNOWN_PRISMA_ARGUMENT_PATTERN = /Unknown argument `([^`]+)`/i;
const warnedMissingOrganizationArguments = new Set<string>();

const ORGANIZATION_MUTABLE_FIELDS = new Set<string>([
  'name',
  'location',
  'address',
  'description',
  'logoId',
  'hostIds',
  'website',
  'sports',
  'officialIds',
  'hasStripeAccount',
  'coordinates',
  'productIds',
  'teamIds',
  'ownerId',
]);
const ORGANIZATION_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const ORGANIZATION_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'ownerId',
]);

const sanitizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const extractUnknownPrismaArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_PRISMA_ARGUMENT_PATTERN);
  return match?.[1] ?? null;
};

const updateOrganizationWithUnknownArgFallback = async (
  id: string,
  updateData: Record<string, unknown>,
) => {
  const removedArguments = new Set<string>();

  while (true) {
    const payload: Record<string, unknown> = { ...updateData };
    for (const argumentName of removedArguments) {
      delete payload[argumentName];
    }
    try {
      return await prisma.organizations.update({
        where: { id },
        data: payload as any,
      });
    } catch (error) {
      const unknownArgument = extractUnknownPrismaArgument(error);
      const hasArgument = unknownArgument
        ? Object.prototype.hasOwnProperty.call(payload, unknownArgument)
        : false;
      if (!unknownArgument || !hasArgument || removedArguments.has(unknownArgument)) {
        throw error;
      }
      removedArguments.add(unknownArgument);
      if (!warnedMissingOrganizationArguments.has(unknownArgument)) {
        warnedMissingOrganizationArguments.add(unknownArgument);
        console.warn(
          `[organizations] Prisma client is missing Organizations.${unknownArgument}; retrying without it. Regenerate Prisma client to restore this field.`,
        );
      }
    }
  }
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [org, staffMembers] = await Promise.all([
    prisma.organizations.findUnique({ where: { id } }),
    prisma.staffMembers.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await requireSession(_req).catch(() => null);
  const viewerCanManageOrganization = session
    ? await canManageOrganization(session, { id: org.id, ownerId: org.ownerId, hostIds: org.hostIds, officialIds: org.officialIds })
    : false;
  const viewerCanAccessUsers = session
    ? await canAccessOrganizationUsers({
      session,
      organization: {
        id: org.id,
        ownerId: org.ownerId,
        hostIds: org.hostIds,
        officialIds: org.officialIds,
      },
      canManage: viewerCanManageOrganization,
    })
    : false;
  const [staffInvites, staffEmails] = viewerCanManageOrganization
    ? await Promise.all([
      prisma.invites.findMany({
        where: { organizationId: id, type: 'STAFF' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sensitiveUserData.findMany({
        where: {
          userId: {
            in: Array.from(new Set([
              org.ownerId,
              ...staffMembers.map((staffMember) => staffMember.userId),
            ].filter((value): value is string => typeof value === 'string' && value.length > 0))),
          },
        },
        select: {
          userId: true,
          email: true,
        },
      }),
    ])
    : [[], []];

  const staffEmailsByUserId = Object.fromEntries(
    staffEmails
      .filter((row) => typeof row.userId === 'string' && typeof row.email === 'string' && row.email.length > 0)
      .map((row) => [row.userId, row.email] as const),
  );

  return NextResponse.json(
    withLegacyFields({
      ...org,
      staffMembers,
      staffInvites,
      staffEmailsByUserId,
      viewerCanManageOrganization,
      viewerCanAccessUsers,
    }),
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'organization',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.organizations.findUnique({ where: { id }, select: { id: true, ownerId: true } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageOrganization(session, existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = parsed.payload;
  const unknownPayloadKeys = findUnknownKeys(payload, [
    ...ORGANIZATION_MUTABLE_FIELDS,
    ...ORGANIZATION_HARD_IMMUTABLE_FIELDS,
    ...ORGANIZATION_ADMIN_OVERRIDABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown organization patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }

  const hardImmutableKeys = findPresentKeys(payload, ORGANIZATION_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable organization fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }

  const overridableImmutableKeys = findPresentKeys(payload, ORGANIZATION_ADMIN_OVERRIDABLE_FIELDS);
  if (overridableImmutableKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable organization fields cannot be updated.', fields: overridableImmutableKeys },
      { status: 403 },
    );
  }

  const updateData: Record<string, unknown> = {};
  for (const key of ORGANIZATION_MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updateData[key] = payload[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'sports')) {
    updateData.sports = sanitizeStringArray(updateData.sports);
  }
  updateData.updatedAt = new Date();

  const updated = await updateOrganizationWithUnknownArgFallback(id, updateData);

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}
