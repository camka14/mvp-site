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
  'coordinates',
  'productIds',
  'teamIds',
  'ownerId',
  'publicSlug',
  'publicPageEnabled',
  'publicWidgetsEnabled',
  'brandPrimaryColor',
  'brandAccentColor',
  'publicHeadline',
  'publicIntroText',
  'embedAllowedDomains',
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

const PUBLIC_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RESERVED_PUBLIC_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'blog',
  'billing',
  'discover',
  'embed',
  'embed-js',
  'events',
  'login',
  'new',
  'organizations',
  'privacy-policy',
  'profile',
  'teams',
  'terms',
  'www',
]);

const normalizePublicSlug = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Public slug must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!PUBLIC_SLUG_PATTERN.test(normalized) || RESERVED_PUBLIC_SLUGS.has(normalized)) {
    throw new Error('Public slug must be lowercase letters, numbers, and hyphens, and cannot use a reserved word.');
  }
  return normalized;
};

const normalizePublicColor = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a hex color.`);
  }
  const normalized = value.trim();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 6-digit hex color like #0f766e.`);
  }
  return normalized.toLowerCase();
};

const normalizePublicText = (value: unknown, label: string, maxLength: number): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
};

const normalizeEmbedAllowedDomains = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('Embed allowed domains must be a list of domains.');
  }
  return Array.from(new Set(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        try {
          const parsed = entry.includes('://') ? new URL(entry) : new URL(`https://${entry}`);
          return parsed.hostname;
        } catch {
          throw new Error('Embed allowed domains must contain valid hostnames.');
        }
      }),
  ));
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
  const existing = await (prisma as any).organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true, publicSlug: true },
  });
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
  try {
    if (Object.prototype.hasOwnProperty.call(updateData, 'publicSlug')) {
      updateData.publicSlug = normalizePublicSlug(updateData.publicSlug);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'brandPrimaryColor')) {
      updateData.brandPrimaryColor = normalizePublicColor(updateData.brandPrimaryColor, 'Primary brand color');
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'brandAccentColor')) {
      updateData.brandAccentColor = normalizePublicColor(updateData.brandAccentColor, 'Accent brand color');
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'publicHeadline')) {
      updateData.publicHeadline = normalizePublicText(updateData.publicHeadline, 'Public headline', 120);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'publicIntroText')) {
      updateData.publicIntroText = normalizePublicText(updateData.publicIntroText, 'Public intro text', 600);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'embedAllowedDomains')) {
      updateData.embedAllowedDomains = normalizeEmbedAllowedDomains(updateData.embedAllowedDomains);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid public organization settings.' },
      { status: 400 },
    );
  }

  const nextPublicSlug = Object.prototype.hasOwnProperty.call(updateData, 'publicSlug')
    ? updateData.publicSlug
    : existing.publicSlug;
  const enablesPublicSurface = updateData.publicPageEnabled === true || updateData.publicWidgetsEnabled === true;
  if (enablesPublicSurface && !(typeof nextPublicSlug === 'string' && nextPublicSlug.trim().length > 0)) {
    return NextResponse.json(
      { error: 'Set a public slug before enabling the public page or widgets.' },
      { status: 400 },
    );
  }
  if (typeof updateData.publicSlug === 'string') {
    const slugOwner = await (prisma as any).organizations.findFirst({
      where: {
        publicSlug: updateData.publicSlug,
        id: { not: id },
      },
      select: { id: true },
    });
    if (slugOwner) {
      return NextResponse.json({ error: 'Public slug is already in use.' }, { status: 409 });
    }
  }
  updateData.updatedAt = new Date();

  const updated = await updateOrganizationWithUnknownArgFallback(id, updateData);

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}
