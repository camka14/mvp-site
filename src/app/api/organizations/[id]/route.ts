import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { isPrismaSchemaContractError, requirePrismaSchemaContract } from '@/lib/prismaSchemaContract';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization, hasOrgPermission } from '@/server/accessControl';
import { ensureDefaultOrganizationRoles } from '@/server/organizationRoles';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { canAccessOrganizationUsers } from '@/server/organizationUsersAccess';
import { ORGANIZATION_PERMISSION_OPTIONS, ORG_PERMISSIONS, type OrganizationPermission } from '@/lib/organizationPermissions';
import {
  normalizeEmbedAllowedDomains,
  normalizePublicColor,
  normalizePublicRedirectUrl,
  normalizePublicSlug,
  normalizePublicText,
} from '@/server/organizationPublicSettings';
import { DEFAULT_ORGANIZATION_STATUS, normalizeOrganizationStatus } from '@/lib/organizationStatus';
import {
  ORG_TAX_AGREEMENT_VERSION,
  normalizeOrganizationDefaultEventTaxHandling,
  normalizeOrganizationTaxClassification,
  normalizeRentalTaxHandling,
} from '@/lib/taxPolicy';
import {
  getOrganizationTagsForOrganizationIds,
  syncOrganizationTags,
} from '@/server/organizationTags';
import { normalizeOrganizationFeatures } from '@/lib/organizationFeatures';

export const dynamic = 'force-dynamic';

const ORGANIZATION_MUTABLE_FIELDS = new Set<string>([
  'name',
  'location',
  'address',
  'description',
  'logoId',
  'website',
  'sports',
  'enabledFeatures',
  'status',
  'coordinates',
  'productIds',
  'ownerId',
  'publicSlug',
  'publicPageEnabled',
  'publicWidgetsEnabled',
  'brandPrimaryColor',
  'brandAccentColor',
  'publicHeadline',
  'publicIntroText',
  'embedAllowedDomains',
  'publicCompletionRedirectUrl',
  'taxOrganizationType',
  'operatesAthleticFacility',
  'defaultEventTaxHandling',
  'defaultRentalTaxHandling',
]);
const ORGANIZATION_TRANSIENT_FIELDS = new Set<string>([
  'taxResponsibilityAgreementAccepted',
  'tags',
]);
const ORGANIZATION_TAX_PROFILE_FIELDS = new Set<string>([
  'taxOrganizationType',
  'operatesAthleticFacility',
  'defaultEventTaxHandling',
  'defaultRentalTaxHandling',
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

const toPublicOrganizationSummary = (organization: Record<string, any>) => ({
  id: organization.id,
  createdAt: organization.createdAt ?? null,
  updatedAt: organization.updatedAt ?? null,
  name: organization.name ?? null,
  location: organization.location ?? null,
  address: organization.address ?? null,
  description: organization.description ?? null,
  logoId: organization.logoId ?? null,
  website: organization.website ?? null,
  sports: Array.isArray(organization.sports) ? organization.sports : [],
  enabledFeatures: normalizeOrganizationFeatures(organization.enabledFeatures),
  status: organization.status ?? DEFAULT_ORGANIZATION_STATUS,
  coordinates: organization.coordinates ?? null,
  publicSlug: organization.publicPageEnabled === true ? organization.publicSlug ?? null : null,
  publicPageEnabled: organization.publicPageEnabled === true,
});

const sanitizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const updateOrganizationWithSchemaContract = async (
  id: string,
  updateData: Record<string, unknown>,
) => requirePrismaSchemaContract('Organizations', () => prisma.organizations.update({
  where: { id },
  data: updateData as any,
}));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    session = await requireSession(_req);
  } catch (error) {
    if (!(error instanceof Response)) throw error;
  }

  const org = await prisma.organizations.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session) {
    if (org.status !== DEFAULT_ORGANIZATION_STATUS || org.publicPageEnabled !== true) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(withLegacyFields(toPublicOrganizationSummary(org)), { status: 200 });
  }

  const viewerPermissions = (
    await Promise.all(ORGANIZATION_PERMISSION_OPTIONS.map(async (option) => (
      await hasOrgPermission(session, { id: org.id, ownerId: org.ownerId }, option.value)
        ? option.value
        : null
    )))
  ).filter((permission): permission is OrganizationPermission => Boolean(permission));
  if (viewerPermissions.length === 0) {
    return NextResponse.json(withLegacyFields(toPublicOrganizationSummary(org)), { status: 200 });
  }

  const viewerCanManageOrganization = viewerPermissions.includes(ORG_PERMISSIONS.ORGANIZATION_MANAGE);
  const viewerCanAccessUsers = await canAccessOrganizationUsers({
    session,
    organization: {
      id: org.id,
      ownerId: org.ownerId,
    },
    canManage: viewerCanManageOrganization,
  });
  const viewerCanManageStaffRoster = viewerCanManageOrganization
    || viewerPermissions.includes(ORG_PERMISSIONS.STAFF_MANAGE)
    || viewerPermissions.includes(ORG_PERMISSIONS.ROLES_MANAGE);
  const staffMembers = await prisma.staffMembers.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: 'asc' },
  });
  const [staffInvites, staffEmails, staffRoles] = viewerCanManageStaffRoster
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
      ensureDefaultOrganizationRoles(prisma, id),
    ])
    : [[], [], []];

  const staffEmailsByUserId = Object.fromEntries(
    staffEmails
      .filter((row) => typeof row.userId === 'string' && typeof row.email === 'string' && row.email.length > 0)
      .map((row) => [row.userId, row.email] as const),
  );
  const tagsByOrganizationId = await getOrganizationTagsForOrganizationIds([org.id]);

  return NextResponse.json(
    withLegacyFields({
      ...org,
      tags: tagsByOrganizationId.get(org.id) ?? [],
      staffMembers: viewerCanManageStaffRoster
        ? staffMembers.map((staffMember) => ({
          ...staffMember,
          role: staffRoles.find((role) => role.id === staffMember.roleId) ?? null,
        }))
        : staffMembers,
      staffInvites,
      staffRoles,
      staffEmailsByUserId,
      viewerCanManageOrganization,
      viewerCanAccessUsers,
      viewerPermissions,
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
    select: {
      id: true,
      ownerId: true,
      publicSlug: true,
      taxResponsibilityAcceptedAt: true,
    },
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
    ...ORGANIZATION_TRANSIENT_FIELDS,
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
  if (Object.prototype.hasOwnProperty.call(updateData, 'enabledFeatures')) {
    const enabledFeatures = normalizeOrganizationFeatures(updateData.enabledFeatures, []);
    if (enabledFeatures.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one organization tool.' },
        { status: 400 },
      );
    }
    updateData.enabledFeatures = enabledFeatures;
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'status')) {
    try {
      updateData.status = normalizeOrganizationStatus(updateData.status);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid organization status.' },
        { status: 400 },
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'taxOrganizationType')) {
    updateData.taxOrganizationType = normalizeOrganizationTaxClassification(updateData.taxOrganizationType);
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'operatesAthleticFacility')) {
    updateData.operatesAthleticFacility = updateData.operatesAthleticFacility === true;
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'defaultEventTaxHandling')) {
    updateData.defaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(updateData.defaultEventTaxHandling);
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'defaultRentalTaxHandling')) {
    updateData.defaultRentalTaxHandling = normalizeRentalTaxHandling(updateData.defaultRentalTaxHandling);
  }
  const updatesTaxProfile = findPresentKeys(payload, ORGANIZATION_TAX_PROFILE_FIELDS).length > 0;
  const acceptedAgreementNow = payload.taxResponsibilityAgreementAccepted === true;
  const hasAcceptedAgreementBefore = existing.taxResponsibilityAcceptedAt instanceof Date
    || (typeof existing.taxResponsibilityAcceptedAt === 'string' && existing.taxResponsibilityAcceptedAt.trim().length > 0);
  if (updatesTaxProfile && !acceptedAgreementNow && !hasAcceptedAgreementBefore) {
    return NextResponse.json(
      { error: 'Organization tax responsibility agreement must be accepted before tax settings can be saved.' },
      { status: 400 },
    );
  }
  if (acceptedAgreementNow) {
    updateData.taxResponsibilityAcceptedAt = new Date();
    updateData.taxResponsibilityAcceptedByUserId = session.userId;
    updateData.taxResponsibilityAgreementVersion = ORG_TAX_AGREEMENT_VERSION;
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
    if (Object.prototype.hasOwnProperty.call(updateData, 'publicCompletionRedirectUrl')) {
      updateData.publicCompletionRedirectUrl = normalizePublicRedirectUrl(updateData.publicCompletionRedirectUrl);
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

  let updated;
  try {
    updated = await updateOrganizationWithSchemaContract(id, updateData);
  } catch (error) {
    if (isPrismaSchemaContractError(error)) {
      return NextResponse.json(
        { error: error.message, code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH', field: error.field },
        { status: 503 },
      );
    }
    throw error;
  }
  const tags = Object.prototype.hasOwnProperty.call(payload, 'tags')
    ? await syncOrganizationTags(id, payload.tags)
    : (await getOrganizationTagsForOrganizationIds([id])).get(id) ?? [];

  return NextResponse.json(withLegacyFields({ ...updated, tags }), { status: 200 });
}
