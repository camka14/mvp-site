import { NextRequest, NextResponse } from 'next/server';

import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';

type DiscountOwnerType = 'USER' | 'ORGANIZATION';
type DiscountTargetType = 'EVENT' | 'PRODUCT' | 'TEAM_REGISTRATION';
type DiscountItemType = DiscountTargetType | 'MEMBERSHIP';

const OWNER_TYPES = new Set<DiscountOwnerType>(['USER', 'ORGANIZATION']);
const ITEM_TYPES = new Set<DiscountItemType>(['EVENT', 'PRODUCT', 'MEMBERSHIP', 'TEAM_REGISTRATION']);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
};

const requireDiscountSession = async (req: NextRequest) => {
  try {
    return { ok: true as const, session: await requireSession(req) };
  } catch (error) {
    if (error instanceof Response) {
      const status = error.status || 401;
      const message = status === 403 ? 'Forbidden' : 'Unauthorized';
      return { ok: false as const, response: NextResponse.json({ error: message }, { status }) };
    }
    throw error;
  }
};

const canManageDiscountsForOrganization = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  organizationId: string,
): Promise<boolean> => {
  const organization = await prisma.organizations.findUnique({ where: { id: organizationId } });
  if (!organization) {
    return false;
  }
  if (session.isAdmin) {
    return true;
  }
  const permissions = [
    ORG_PERMISSIONS.EVENTS_MANAGE,
    ORG_PERMISSIONS.PRODUCTS_MANAGE,
    ORG_PERMISSIONS.TEAMS_MANAGE,
    ORG_PERMISSIONS.BILLING_MANAGE,
    ORG_PERMISSIONS.PAYMENTS_MANAGE,
  ];
  for (const permission of permissions) {
    if (await hasOrgPermission(session, organization, permission)) {
      return true;
    }
  }
  return false;
};

const targetTypeForItemType = (itemType: DiscountItemType): DiscountTargetType => (
  itemType === 'MEMBERSHIP' ? 'PRODUCT' : itemType
);

const matchesQuery = (query: string) => (
  query
    ? {
        contains: query,
        mode: 'insensitive' as const,
      }
    : undefined
);

export async function GET(req: NextRequest) {
  const sessionResult = await requireDiscountSession(req);
  if (!sessionResult.ok) {
    return sessionResult.response;
  }
  const { session } = sessionResult;
  const ownerType = (req.nextUrl.searchParams.get('ownerType') ?? 'USER').trim().toUpperCase() as DiscountOwnerType;
  const ownerId = normalizeString(req.nextUrl.searchParams.get('ownerId')) ?? session.userId;
  const itemType = (req.nextUrl.searchParams.get('itemType') ?? 'EVENT').trim().toUpperCase() as DiscountItemType;
  const query = normalizeString(req.nextUrl.searchParams.get('query')) ?? '';

  if (!OWNER_TYPES.has(ownerType)) {
    return NextResponse.json({ error: 'Invalid discount owner type.' }, { status: 400 });
  }
  if (!ITEM_TYPES.has(itemType)) {
    return NextResponse.json({ error: 'Invalid discount item type.' }, { status: 400 });
  }
  if (ownerType === 'ORGANIZATION') {
    if (!ownerId) {
      return NextResponse.json({ error: 'ownerId is required for organization targets.' }, { status: 400 });
    }
    if (!(await canManageDiscountsForOrganization(session, ownerId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (ownerId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const queryFilter = matchesQuery(query);
  const targetType = targetTypeForItemType(itemType);

  if (itemType === 'EVENT') {
    const events = await prisma.events.findMany({
      where: {
        ...(ownerType === 'ORGANIZATION'
          ? { organizationId: ownerId }
          : { hostId: ownerId, organizationId: null }),
        price: { gt: 0 },
        ...(queryFilter ? { name: queryFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        start: true,
        price: true,
        eventType: true,
        state: true,
      },
      orderBy: { start: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      targets: events.map((event) => ({
        id: event.id,
        label: event.name,
        description: [event.eventType, event.state, event.start?.toISOString?.()]
          .filter(Boolean)
          .join(' • '),
        priceCents: normalizeCents(event.price),
        itemType,
        targetType,
      })),
    });
  }

  if (itemType === 'PRODUCT' || itemType === 'MEMBERSHIP') {
    if (ownerType !== 'ORGANIZATION') {
      return NextResponse.json({ targets: [] });
    }
    const products = await prisma.products.findMany({
      where: {
        organizationId: ownerId,
        priceCents: { gt: 0 },
        isActive: { not: false },
        period: itemType === 'MEMBERSHIP' ? { not: 'SINGLE' } : 'SINGLE',
        ...(queryFilter ? { name: queryFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        period: true,
        priceCents: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      targets: products.map((product) => ({
        id: product.id,
        label: product.name,
        description: [product.period, product.description].filter(Boolean).join(' • '),
        priceCents: normalizeCents(product.priceCents),
        itemType,
        targetType,
      })),
    });
  }

  const teams = await prisma.canonicalTeams.findMany({
    where: {
      ...(ownerType === 'ORGANIZATION'
        ? { organizationId: ownerId }
        : { createdBy: ownerId, organizationId: null }),
      archivedAt: null,
      registrationPriceCents: { gt: 0 },
      ...(queryFilter ? { name: queryFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      division: true,
      sport: true,
      registrationPriceCents: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    targets: teams.map((team) => ({
      id: team.id,
      label: team.name,
      description: [team.sport, team.division].filter(Boolean).join(' • '),
      priceCents: normalizeCents(team.registrationPriceCents),
      itemType,
      targetType,
    })),
  });
}
