import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { isPrismaSchemaContractError, requirePrismaSchemaContract } from '@/lib/prismaSchemaContract';
import {
  ORG_TAX_AGREEMENT_VERSION,
  normalizeOrganizationDefaultEventTaxHandling,
  normalizeOrganizationTaxClassification,
  normalizeRentalTaxHandling,
} from '@/lib/taxPolicy';
import {
  DEFAULT_ORGANIZATION_STATUS,
  normalizeOrganizationStatus,
} from '@/lib/organizationStatus';
import { buildEmailVerificationRequiredResponse, isUserEmailVerified } from '@/server/emailVerificationGate';
import { ensureDefaultOrganizationRoles } from '@/server/organizationRoles';
import { sendAdminOrganizationCreatedNotification } from '@/server/adminNotifications';
import {
  getOrganizationTagsForOrganizationIds,
  resolveSystemOrganizationTagIdsBySlugs,
  syncOrganizationTags,
} from '@/server/organizationTags';
import { withDerivedOrganizationProductIds } from '@/server/organizationProductIds';
import { normalizeOrganizationFeatures } from '@/lib/organizationFeatures';
import { buildDivisionDiscoveryWhere, summarizeOrganizationDivisions } from '@/server/divisionDiscovery';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  logoId: z.string().optional(),
  ownerId: z.string(),
  website: z.string().optional(),
  sports: z.array(z.string()).optional(),
  enabledFeatures: z.array(z.enum(['CLUB_TEAMS', 'FACILITIES_RENTALS', 'EVENT_MANAGEMENT'])).min(1).optional(),
  status: z.string().optional(),
  coordinates: z.any().optional(),
  productIds: z.array(z.string()).optional(),
  taxOrganizationType: z.string().optional(),
  operatesAthleticFacility: z.boolean().optional(),
  defaultEventTaxHandling: z.string().optional(),
  defaultRentalTaxHandling: z.string().optional(),
  taxResponsibilityAgreementAccepted: z.boolean().optional(),
  tags: z.array(z.any()).optional(),
}).passthrough();

const createOrganizationWithSchemaContract = async (organizationData: Record<string, unknown>) =>
  requirePrismaSchemaContract('Organizations', () => prisma.organizations.create({
    data: organizationData as any,
  }));

const normalizeSearchQuery = (value: string | null): string => (value ?? '').trim();

const nameRank = (name: string | null | undefined, normalizedQuery: string): number => {
  const normalizedName = (name ?? '').trim().toLowerCase();
  if (!normalizedName) return 5;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.split(/\s+/).some((segment) => segment.startsWith(normalizedQuery))) return 2;
  if (normalizedName.includes(normalizedQuery)) return 3;
  return 4;
};

const secondaryRank = (value: string | null | undefined, normalizedQuery: string): number => {
  const normalizedValue = (value ?? '').trim().toLowerCase();
  if (!normalizedValue) return 2;
  if (normalizedValue.includes(normalizedQuery)) return 0;
  return 1;
};

const buildOrganizationAvatarUrl = (
  organization: { name?: string | null; logoId?: string | null },
  baseUrl: string,
  size = 96,
): string => {
  const logoId = organization.logoId?.trim();
  if (logoId) {
    return new URL(`/api/files/${encodeURIComponent(logoId)}/preview?w=${size}&h=${size}&fit=cover`, baseUrl).toString();
  }
  const label = organization.name?.trim() || 'Org';
  return new URL(`/api/avatars/initials?name=${encodeURIComponent(label)}&size=${size}&format=png`, baseUrl).toString();
};

const withOrganizationDisplayFields = <T extends { name?: string | null; logoId?: string | null }>(
  organization: T,
  baseUrl: string,
): T & { logoUrl: string; imageUrl: string } => {
  const avatarUrl = buildOrganizationAvatarUrl(organization, baseUrl);
  return {
    ...organization,
    logoUrl: avatarUrl,
    imageUrl: avatarUrl,
  };
};

const relevanceScore = (
  organization: { name?: string | null; location?: string | null; address?: string | null; description?: string | null },
  normalizedQuery: string,
): [number, number, number, number] => {
  const primary = nameRank(organization.name, normalizedQuery);
  const location = secondaryRank(organization.location, normalizedQuery);
  const address = secondaryRank(organization.address, normalizedQuery);
  const description = secondaryRank(organization.description, normalizedQuery);
  return [primary, location, address, description];
};

const shouldApplyListedOnlyFilter = (params: {
  ids?: string[];
  ownerId: string | null;
  userId: string | null;
}): boolean => (
  !params.ids?.length && !params.ownerId && !params.userId
);

type OrganizationListRow = {
  id: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  name?: string | null;
  location?: string | null;
  address?: string | null;
  description?: string | null;
  logoId?: string | null;
  website?: string | null;
  sports?: string[] | null;
  enabledFeatures?: unknown;
  status?: string | null;
  coordinates?: unknown;
  publicSlug?: string | null;
  publicPageEnabled?: boolean | null;
};

const toPublicOrganizationListRow = (organization: OrganizationListRow): OrganizationListRow => ({
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

const buildWhereFromConditions = (conditions: Array<Record<string, unknown>>): Record<string, unknown> => {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
};

const parseTagSlugsParam = (params: URLSearchParams): string[] => {
  const values = [
    ...params.getAll('tags'),
    ...params.getAll('tag'),
  ];
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
};

const parseListParam = (params: URLSearchParams, key: string): string[] => Array.from(new Set(
  params.getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean),
));

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const baseUrl = req.nextUrl.origin;
  const idsParam = params.get('ids');
  const ownerId = params.get('ownerId');
  const userId = params.get('userId');
  const limit = Number(params.get('limit') || '100');
  const offset = Number(params.get('offset') || '0');
  const query = normalizeSearchQuery(params.get('query'));
  const normalizedQuery = query.toLowerCase();
  const includeAffiliateRentals = params.get('includeAffiliateRentals') === 'true';
  const tagSlugs = parseTagSlugsParam(params);
  const sports = parseListParam(params, 'sports');
  const divisionGenders = parseListParam(params, 'divisionGenders').filter((value) => ['M', 'F', 'C'].includes(value));
  const skillDivisionTypeIds = parseListParam(params, 'skillDivisionTypeIds').map((value) => value.toLowerCase());
  const ageDivisionTypeIds = parseListParam(params, 'ageDivisionTypeIds').map((value) => value.toLowerCase());
  const divisionPriceMinRaw = params.get('divisionPriceMin');
  const divisionPriceMaxRaw = params.get('divisionPriceMax');
  const divisionPriceMin = divisionPriceMinRaw === null ? null : Number(divisionPriceMinRaw);
  const divisionPriceMax = divisionPriceMaxRaw === null ? null : Number(divisionPriceMaxRaw);
  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  const hasPrivateSelector = Boolean(ownerId || userId);
  const shouldResolveSession = Boolean(ids?.length || hasPrivateSelector);
  let session: Awaited<ReturnType<typeof requireSession>> | null = null;

  if (shouldResolveSession) {
    try {
      session = await requireSession(req);
    } catch (error) {
      if (error instanceof Response && hasPrivateSelector) return error;
      if (error instanceof Response) {
        session = null;
      } else {
        throw error;
      }
    }
  }

  if (userId && session) {
    if (!session.isAdmin && session.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (ownerId && session && !session.isAdmin && session.userId !== ownerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 100;
  const normalizedOffset = Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0;

  const accessibleOrganizationIds = userId
    ? Array.from(
      new Set(
        (await prisma.staffMembers.findMany({
          where: { userId },
          select: { organizationId: true },
        })).map((row) => row.organizationId),
      ),
    )
    : [];
  let tagFilteredOrganizationIds: string[] | null = null;
  if (tagSlugs.length) {
    const tagIds = await resolveSystemOrganizationTagIdsBySlugs(tagSlugs);
    if (tagIds.length) {
      const assignments = await (prisma as any).organizationTagAssignments.findMany({
        where: { tagId: { in: tagIds } },
        select: { organizationId: true },
      });
      tagFilteredOrganizationIds = Array.from(
        new Set(
          assignments
            .map((assignment: any) => String(assignment.organizationId ?? '').trim())
            .filter(Boolean),
        ),
      );
    } else {
      tagFilteredOrganizationIds = [];
    }
  }

  const applyListedOnlyFilter = shouldApplyListedOnlyFilter({ ids, ownerId, userId })
    || Boolean(ids?.length && !session);
  const affiliateRentalOrganizationIds = includeAffiliateRentals && applyListedOnlyFilter
    ? Array.from(
      new Set(
        (await prisma.facilities.findMany({
          where: {
            affiliateUrl: { not: null },
            status: 'ACTIVE',
          },
          select: { organizationId: true },
        }))
          .map((row) => row.organizationId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    )
    : [];

  const whereConditions: Array<Record<string, unknown>> = [];
  if (ids?.length) {
    whereConditions.push({ id: { in: ids } });
  }
  if (ownerId) {
    whereConditions.push({ ownerId });
  }
  if (applyListedOnlyFilter) {
    if (affiliateRentalOrganizationIds.length) {
      whereConditions.push({
        OR: [
          { status: DEFAULT_ORGANIZATION_STATUS },
          { id: { in: affiliateRentalOrganizationIds } },
        ],
      });
    } else {
      whereConditions.push({ status: DEFAULT_ORGANIZATION_STATUS });
    }
  }
  if (userId) {
    whereConditions.push({ OR: [
      { ownerId: userId },
      ...(accessibleOrganizationIds.length > 0 ? [{ id: { in: accessibleOrganizationIds } }] : []),
    ] });
  }
  if (tagFilteredOrganizationIds) {
    whereConditions.push({ id: { in: tagFilteredOrganizationIds } });
  }
  const organizationDivisionWhere = buildDivisionDiscoveryWhere({
    scope: 'ORGANIZATION',
    sports,
    genders: divisionGenders,
    skillDivisionTypeIds,
    ageDivisionTypeIds,
    priceMin: divisionPriceMin,
    priceMax: divisionPriceMax,
  });
  if (organizationDivisionWhere) {
    const matchingDivisions = await prisma.divisions.findMany({
      where: organizationDivisionWhere as any,
      select: { organizationId: true },
    });
    const matchingOrganizationIds = Array.from(new Set(
      matchingDivisions
        .map((division) => division.organizationId)
        .filter((organizationId): organizationId is string => Boolean(organizationId)),
    ));
    whereConditions.push({ id: { in: matchingOrganizationIds } });
  }
  if (query.length > 0) {
    whereConditions.push({ OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { location: { contains: query, mode: 'insensitive' } },
      { address: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ] });
  }
  const where = buildWhereFromConditions(whereConditions);

  const requestedTake = normalizedLimit + 1;
  const candidateTake = query.length > 0
    ? Math.max((normalizedOffset + requestedTake) * 5, 40)
    : requestedTake;

  let organizations = await prisma.organizations.findMany({
    where,
    take: candidateTake,
    ...(query.length > 0 ? {} : { skip: normalizedOffset }),
    orderBy: { name: 'asc' },
  });

  if (query.length > 0) {
    organizations = organizations
      .sort((left, right) => {
        const leftScore = relevanceScore(left, normalizedQuery);
        const rightScore = relevanceScore(right, normalizedQuery);
        if (leftScore[0] !== rightScore[0]) return leftScore[0] - rightScore[0];
        if (leftScore[1] !== rightScore[1]) return leftScore[1] - rightScore[1];
        if (leftScore[2] !== rightScore[2]) return leftScore[2] - rightScore[2];
        if (leftScore[3] !== rightScore[3]) return leftScore[3] - rightScore[3];
        return (left.name ?? '').localeCompare(right.name ?? '');
      })
      .slice(normalizedOffset, normalizedOffset + requestedTake);
  }

  const pageRows = organizations.slice(0, normalizedLimit);
  const hasMore = organizations.length > normalizedLimit;
  const affiliateFacilitiesByOrganizationId = new Map<string, any[]>();
  const tagsByOrganizationId = await getOrganizationTagsForOrganizationIds(
    pageRows.map((organization) => organization.id),
  );
  const publicDivisionsByOrganizationId = new Map<string, any[]>();
  if (pageRows.length > 0) {
    const publicDivisions = await prisma.divisions.findMany({
      where: {
        organizationId: { in: pageRows.map((organization) => organization.id) },
        scope: 'ORGANIZATION',
        status: 'ACTIVE',
      },
      orderBy: [{ sportId: 'asc' }, { name: 'asc' }],
    });
    publicDivisions.forEach((division) => {
      if (!division.organizationId) return;
      const rows = publicDivisionsByOrganizationId.get(division.organizationId) ?? [];
      rows.push(division);
      publicDivisionsByOrganizationId.set(division.organizationId, rows);
    });
  }

  if (includeAffiliateRentals && pageRows.length > 0) {
    const affiliateFacilities = await (prisma as any).facilities.findMany({
      where: {
        organizationId: { in: pageRows.map((organization) => organization.id) },
        affiliateUrl: { not: null },
        status: 'ACTIVE',
      },
      orderBy: { name: 'asc' },
    });
    affiliateFacilities.forEach((facility: any) => {
      const organizationId = typeof facility.organizationId === 'string' ? facility.organizationId : '';
      if (!organizationId) return;
      const facilities = affiliateFacilitiesByOrganizationId.get(organizationId) ?? [];
      facilities.push(facility);
      affiliateFacilitiesByOrganizationId.set(organizationId, facilities);
    });
  }
  const exposeInternalFields = Boolean(
    session
    && (
      session.isAdmin
      || (ownerId && session.userId === ownerId)
      || (userId && session.userId === userId)
    )
  );
  const visiblePageRows = exposeInternalFields
    ? await withDerivedOrganizationProductIds(pageRows, prisma)
    : pageRows.map((organization) => toPublicOrganizationListRow(organization));
  const responseRows = includeAffiliateRentals
    ? visiblePageRows.map((organization) => ({
        ...withOrganizationDisplayFields(organization, baseUrl),
        tags: tagsByOrganizationId.get(organization.id) ?? [],
        divisions: publicDivisionsByOrganizationId.get(organization.id) ?? [],
        divisionSummary: summarizeOrganizationDivisions(publicDivisionsByOrganizationId.get(organization.id) ?? []),
        facilities: affiliateFacilitiesByOrganizationId.get(organization.id) ?? [],
      }))
    : visiblePageRows.map((organization) => ({
        ...withOrganizationDisplayFields(organization, baseUrl),
        tags: tagsByOrganizationId.get(organization.id) ?? [],
        divisions: publicDivisionsByOrganizationId.get(organization.id) ?? [],
        divisionSummary: summarizeOrganizationDivisions(publicDivisionsByOrganizationId.get(organization.id) ?? []),
      }));

  return NextResponse.json({
    organizations: responseRows,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      nextOffset: normalizedOffset + pageRows.length,
      hasMore,
    },
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!await isUserEmailVerified(session.userId)) {
    return buildEmailVerificationRequiredResponse('create_organization');
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!session.isAdmin && parsed.data.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = parsed.data;
  if (data.taxResponsibilityAgreementAccepted !== true) {
    return NextResponse.json(
      { error: 'Organization tax responsibility agreement must be accepted.' },
      { status: 400 },
    );
  }

  const taxAcceptedAt = new Date();
  let status = DEFAULT_ORGANIZATION_STATUS;
  try {
    if (data.status !== undefined) {
      status = normalizeOrganizationStatus(data.status);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid organization status.' },
      { status: 400 },
    );
  }

  let organization;
  try {
    organization = await createOrganizationWithSchemaContract({
      id: data.id,
      name: data.name,
      location: data.location ?? null,
      address: data.address ?? null,
      description: data.description ?? null,
      logoId: data.logoId ?? null,
      ownerId: data.ownerId,
      website: data.website ?? null,
      sports: Array.isArray(data.sports) ? data.sports : [],
      enabledFeatures: normalizeOrganizationFeatures(data.enabledFeatures),
      status,
      hasStripeAccount: false,
      coordinates: data.coordinates ?? null,
      taxOrganizationType: normalizeOrganizationTaxClassification(data.taxOrganizationType),
      operatesAthleticFacility: data.operatesAthleticFacility === true,
      defaultEventTaxHandling: normalizeOrganizationDefaultEventTaxHandling(data.defaultEventTaxHandling),
      defaultRentalTaxHandling: normalizeRentalTaxHandling(data.defaultRentalTaxHandling),
      taxResponsibilityAcceptedAt: taxAcceptedAt,
      taxResponsibilityAcceptedByUserId: session.userId,
      taxResponsibilityAgreementVersion: ORG_TAX_AGREEMENT_VERSION,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    if (isPrismaSchemaContractError(error)) {
      return NextResponse.json(
        { error: error.message, code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH', field: error.field },
        { status: 503 },
      );
    }
    throw error;
  }
  const tags = await syncOrganizationTags(organization.id, data.tags);
  await ensureDefaultOrganizationRoles(prisma, organization.id);
  await sendAdminOrganizationCreatedNotification({
    organization,
    baseUrl: getRequestOrigin(req),
  }).catch((error) => {
    console.warn('Failed to send admin organization creation notification', {
      organizationId: organization.id,
      error,
    });
  });

  return NextResponse.json({ ...organization, productIds: [], tags }, { status: 201 });
}
