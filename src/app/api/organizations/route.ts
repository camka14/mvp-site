import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';
const UNKNOWN_PRISMA_ARGUMENT_PATTERN = /Unknown argument `([^`]+)`/i;
const warnedMissingOrganizationArguments = new Set<string>();

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  logoId: z.string().optional(),
  ownerId: z.string(),
  hostIds: z.array(z.string()).optional(),
  website: z.string().optional(),
  sports: z.array(z.string()).optional(),
  officialIds: z.array(z.string()).optional(),
  hasStripeAccount: z.boolean().optional(),
  coordinates: z.any().optional(),
  fieldIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
}).passthrough();

const extractUnknownPrismaArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_PRISMA_ARGUMENT_PATTERN);
  return match?.[1] ?? null;
};

const createOrganizationWithUnknownArgFallback = async (organizationData: Record<string, unknown>) => {
  const removedArguments = new Set<string>();

  while (true) {
    const createData: Record<string, unknown> = { ...organizationData };
    for (const argumentName of removedArguments) {
      delete createData[argumentName];
    }
    try {
      return await prisma.organizations.create({
        data: createData as any,
      });
    } catch (error) {
      const unknownArgument = extractUnknownPrismaArgument(error);
      const hasArgument = unknownArgument
        ? Object.prototype.hasOwnProperty.call(createData, unknownArgument)
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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const ownerId = params.get('ownerId');
  const userId = params.get('userId');
  const limit = Number(params.get('limit') || '100');
  const query = normalizeSearchQuery(params.get('query'));
  const normalizedQuery = query.toLowerCase();

  if (userId) {
    const session = await requireSession(req);
    if (!session.isAdmin && session.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 100;

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

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (ownerId) where.ownerId = ownerId;
  if (userId) {
    where.OR = [
      { ownerId: userId },
      ...(accessibleOrganizationIds.length > 0 ? [{ id: { in: accessibleOrganizationIds } }] : []),
    ];
  }
  if (query.length > 0) {
    const queryWhere = [
      { name: { contains: query, mode: 'insensitive' } },
      { location: { contains: query, mode: 'insensitive' } },
      { address: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ];
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: queryWhere },
      ];
      delete where.OR;
    } else {
      where.OR = queryWhere;
    }
  }

  const candidateTake = query.length > 0
    ? Math.min(Math.max(normalizedLimit * 5, 40), 500)
    : normalizedLimit;

  let organizations = await prisma.organizations.findMany({
    where,
    take: candidateTake,
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
      .slice(0, normalizedLimit);
  }

  return NextResponse.json({ organizations: withLegacyList(organizations) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!session.isAdmin && parsed.data.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = parsed.data;
  const organization = await createOrganizationWithUnknownArgFallback({
    id: data.id,
    name: data.name,
    location: data.location ?? null,
    address: data.address ?? null,
    description: data.description ?? null,
    logoId: data.logoId ?? null,
    ownerId: data.ownerId,
    hostIds: Array.isArray(data.hostIds) ? data.hostIds : [],
    website: data.website ?? null,
    sports: Array.isArray(data.sports) ? data.sports : [],
    officialIds: Array.isArray(data.officialIds) ? data.officialIds : [],
    hasStripeAccount: data.hasStripeAccount ?? false,
    coordinates: data.coordinates ?? null,
    fieldIds: Array.isArray(data.fieldIds) ? data.fieldIds : [],
    productIds: Array.isArray(data.productIds) ? data.productIds : [],
    teamIds: Array.isArray(data.teamIds) ? data.teamIds : [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json(withLegacyFields(organization), { status: 201 });
}
