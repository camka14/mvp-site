import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';

type DiscountOwnerType = 'USER' | 'ORGANIZATION';
type DiscountTargetType = 'EVENT' | 'PRODUCT' | 'TEAM_REGISTRATION';

const DISCOUNT_OWNER_TYPES = new Set<DiscountOwnerType>(['USER', 'ORGANIZATION']);
const DISCOUNT_TARGET_TYPES = new Set<DiscountTargetType>(['EVENT', 'PRODUCT', 'TEAM_REGISTRATION']);

const createDiscountSchema = z.object({
  ownerType: z.enum(['USER', 'ORGANIZATION']),
  ownerId: z.string().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  targetType: z.enum(['EVENT', 'PRODUCT', 'TEAM_REGISTRATION']),
  targetId: z.string().min(1),
  discountedPriceCents: z.number().int().nonnegative(),
}).strict();

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
  organization: Awaited<ReturnType<typeof prisma.organizations.findUnique>>,
): Promise<boolean> => {
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

const loadOrganizationForManagement = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  organizationId: string,
) => {
  const organization = await prisma.organizations.findUnique({ where: { id: organizationId } });
  if (!organization) {
    return { ok: false as const, response: NextResponse.json({ error: 'Organization not found.' }, { status: 404 }) };
  }
  if (!(await canManageDiscountsForOrganization(session, organization))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, organization };
};

const resolveTargetContext = async ({
  targetType,
  targetId,
}: {
  targetType: DiscountTargetType;
  targetId: string;
}): Promise<{
  id: string;
  priceCents: number;
  organizationId: string | null;
  ownerUserId: string | null;
} | null> => {
  if (targetType === 'EVENT') {
    const event = await prisma.events.findUnique({
      where: { id: targetId },
      select: { id: true, price: true, organizationId: true, hostId: true },
    });
    return event
      ? {
          id: event.id,
          priceCents: normalizeCents(event.price),
          organizationId: normalizeString(event.organizationId),
          ownerUserId: normalizeString(event.hostId),
        }
      : null;
  }

  if (targetType === 'PRODUCT') {
    const product = await prisma.products.findUnique({
      where: { id: targetId },
      select: { id: true, priceCents: true, organizationId: true },
    });
    return product
      ? {
          id: product.id,
          priceCents: normalizeCents(product.priceCents),
          organizationId: product.organizationId,
          ownerUserId: null,
        }
      : null;
  }

  const team = await prisma.canonicalTeams.findUnique({
    where: { id: targetId },
    select: { id: true, registrationPriceCents: true, organizationId: true, createdBy: true },
  });
  return team
    ? {
        id: team.id,
        priceCents: normalizeCents(team.registrationPriceCents),
        organizationId: normalizeString(team.organizationId),
        ownerUserId: normalizeString(team.createdBy),
      }
    : null;
};

const authorizeTargetManagement = async ({
  session,
  ownerType,
  ownerId,
  target,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
  ownerType: DiscountOwnerType;
  ownerId: string;
  target: { organizationId: string | null; ownerUserId: string | null };
}): Promise<NextResponse | null> => {
  if (ownerType === 'ORGANIZATION') {
    if (!target.organizationId || target.organizationId !== ownerId) {
      return NextResponse.json({ error: 'Discount target does not belong to this organization.' }, { status: 400 });
    }
    const organizationResult = await loadOrganizationForManagement(session, ownerId);
    return organizationResult.ok ? null : organizationResult.response;
  }

  if (ownerId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (target.organizationId) {
    return NextResponse.json({ error: 'Use an organization discount for organization-owned items.' }, { status: 400 });
  }
  if (target.ownerUserId !== ownerId && !session.isAdmin) {
    return NextResponse.json({ error: 'Discount target does not belong to this user.' }, { status: 400 });
  }
  return null;
};

export async function GET(req: NextRequest) {
  const sessionResult = await requireDiscountSession(req);
  if (!sessionResult.ok) {
    return sessionResult.response;
  }
  const { session } = sessionResult;
  const ownerType = (req.nextUrl.searchParams.get('ownerType') ?? 'USER').trim().toUpperCase() as DiscountOwnerType;
  const ownerId = normalizeString(req.nextUrl.searchParams.get('ownerId')) ?? session.userId;
  if (!DISCOUNT_OWNER_TYPES.has(ownerType)) {
    return NextResponse.json({ error: 'Invalid discount owner type.' }, { status: 400 });
  }

  if (ownerType === 'ORGANIZATION') {
    const organizationResult = await loadOrganizationForManagement(session, ownerId);
    if (!organizationResult.ok) {
      return organizationResult.response;
    }
  } else if (ownerId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const discounts = await prisma.discounts.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: 'desc' },
  });
  const discountIds = discounts.map((discount) => discount.id);
  const codes = discountIds.length
    ? await prisma.discountCodes.findMany({
        where: { discountId: { in: discountIds } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const codesByDiscountId = new Map<string, typeof codes>();
  for (const code of codes) {
    const rows = codesByDiscountId.get(code.discountId) ?? [];
    rows.push(code);
    codesByDiscountId.set(code.discountId, rows);
  }
  const eventTargetIds = Array.from(new Set(
    discounts
      .filter((discount) => discount.targetType === 'EVENT')
      .map((discount) => discount.targetId),
  ));
  const events = eventTargetIds.length
    ? await prisma.events.findMany({
        where: { id: { in: eventTargetIds } },
        select: { id: true, name: true },
      })
    : [];
  const eventNamesById = new Map(events.map((event) => [event.id, normalizeString(event.name)]));

  return NextResponse.json({
    discounts: discounts.map((discount) => ({
      ...discount,
      targetName: discount.targetType === 'EVENT'
        ? eventNamesById.get(discount.targetId) ?? null
        : null,
      codes: codesByDiscountId.get(discount.id) ?? [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const sessionResult = await requireDiscountSession(req);
  if (!sessionResult.ok) {
    return sessionResult.response;
  }
  const { session } = sessionResult;
  const body = await req.json().catch(() => null);
  const parsed = createDiscountSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const ownerType = parsed.data.ownerType;
  const ownerId = ownerType === 'USER'
    ? session.userId
    : normalizeString(parsed.data.ownerId) ?? '';
  if (!DISCOUNT_TARGET_TYPES.has(parsed.data.targetType)) {
    return NextResponse.json({ error: 'Invalid discount target type.' }, { status: 400 });
  }
  if (!ownerId) {
    return NextResponse.json({ error: 'ownerId is required for organization discounts.' }, { status: 400 });
  }

  const target = await resolveTargetContext({
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
  });
  if (!target) {
    return NextResponse.json({ error: 'Discount target not found.' }, { status: 404 });
  }
  const authorizationError = await authorizeTargetManagement({
    session,
    ownerType,
    ownerId,
    target,
  });
  if (authorizationError) {
    return authorizationError;
  }
  if (target.priceCents <= 0) {
    return NextResponse.json({ error: 'Discount target must have a paid price.' }, { status: 400 });
  }
  if (parsed.data.discountedPriceCents > target.priceCents) {
    return NextResponse.json({ error: 'Discounted price cannot exceed the current item price.' }, { status: 400 });
  }

  const discount = await prisma.discounts.create({
    data: {
      id: `discount_${crypto.randomUUID()}`,
      ownerType,
      ownerId,
      createdBy: session.userId,
      name: parsed.data.name.trim(),
      description: normalizeString(parsed.data.description),
      targetType: parsed.data.targetType,
      targetId: target.id,
      originalPriceCentsSnapshot: target.priceCents,
      discountedPriceCents: parsed.data.discountedPriceCents,
    },
  });

  return NextResponse.json({ discount }, { status: 201 });
}
