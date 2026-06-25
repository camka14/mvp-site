import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';

type RouteContext = {
  params: Promise<{
    discountId: string;
    codeId: string;
  }>;
};

const updateCodeSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
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

const loadManagedDiscountCode = async (
  req: NextRequest,
  context: RouteContext,
) => {
  const sessionResult = await requireDiscountSession(req);
  if (!sessionResult.ok) {
    return sessionResult;
  }
  const { session } = sessionResult;
  const params = await context.params;
  const code = await prisma.discountCodes.findUnique({ where: { id: params.codeId } });
  if (!code || code.discountId !== params.discountId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Discount code not found.' }, { status: 404 }) };
  }
  const discount = await prisma.discounts.findUnique({ where: { id: params.discountId } });
  if (!discount) {
    return { ok: false as const, response: NextResponse.json({ error: 'Discount not found.' }, { status: 404 }) };
  }
  if (!(await canManageDiscount(session, discount))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, code };
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const result = await loadManagedDiscountCode(req, context);
  if (!result.ok) {
    return result.response;
  }
  const body = await req.json().catch(() => null);
  const parsed = updateCodeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const code = await prisma.discountCodes.update({
    where: { id: result.code.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ code });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const result = await loadManagedDiscountCode(req, context);
  if (!result.ok) {
    return result.response;
  }
  if (result.code.status === 'ACTIVE') {
    return NextResponse.json({ error: 'Deactivate this code before deleting it.' }, { status: 400 });
  }

  await prisma.discountCodes.delete({ where: { id: result.code.id } });
  return NextResponse.json({ ok: true });
}
