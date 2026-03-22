import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().optional(),
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
  organization: { name?: string | null; location?: string | null; description?: string | null },
  normalizedQuery: string,
): [number, number, number] => {
  const primary = nameRank(organization.name, normalizedQuery);
  const location = secondaryRank(organization.location, normalizedQuery);
  const description = secondaryRank(organization.description, normalizedQuery);
  return [primary, location, description];
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
  const organization = await prisma.organizations.create({
    data: {
      id: data.id,
      name: data.name,
      location: data.location ?? null,
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
    },
  });

  return NextResponse.json(withLegacyFields(organization), { status: 201 });
}
