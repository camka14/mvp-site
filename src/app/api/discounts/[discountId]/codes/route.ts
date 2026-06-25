import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { normalizeDiscountCode } from '@/server/discounts/discountCodeResolver';

type RouteContext = {
  params: Promise<{
    discountId: string;
  }>;
};

const createCodeSchema = z.object({
  code: z.string().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
}).strict();

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

const canManageDiscount = async (
  session: Awaited<ReturnType<typeof requireSession>>,
  discount: { ownerType: string; ownerId: string },
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }
  if (discount.ownerType === 'USER') {
    return discount.ownerId === session.userId;
  }
  if (discount.ownerType === 'ORGANIZATION') {
    return canManageDiscountsForOrganization(session, discount.ownerId);
  }
  return false;
};

const generateCodeCandidate = (): string => (
  `BIQ${crypto.randomBytes(4).toString('hex').toUpperCase()}`
);

const createUniqueGeneratedCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateCodeCandidate();
    const existing = await prisma.discountCodes.findUnique({ where: { code: candidate } });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Unable to generate a unique discount code.');
};

export async function POST(req: NextRequest, context: RouteContext) {
  const sessionResult = await requireDiscountSession(req);
  if (!sessionResult.ok) {
    return sessionResult.response;
  }
  const { session } = sessionResult;
  const params = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = createCodeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const discount = await prisma.discounts.findUnique({
    where: { id: params.discountId },
  });
  if (!discount) {
    return NextResponse.json({ error: 'Discount not found.' }, { status: 404 });
  }
  if (!(await canManageDiscount(session, discount))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requestedCode = normalizeDiscountCode(parsed.data.code);
  const code = requestedCode ?? await createUniqueGeneratedCode();
  const existingCode = await prisma.discountCodes.findUnique({ where: { code } });
  if (existingCode) {
    return NextResponse.json({ error: 'Discount code already exists.' }, { status: 409 });
  }

  const discountCode = await prisma.discountCodes.create({
    data: {
      id: `discount_code_${crypto.randomUUID()}`,
      discountId: discount.id,
      code,
      usageLimit: parsed.data.usageLimit ?? null,
      createdBy: session.userId,
    },
  });

  return NextResponse.json({ code: discountCode }, { status: 201 });
}
