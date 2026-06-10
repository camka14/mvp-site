import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { FinanceMutationError, updateFinancialLineItem } from '@/server/finance/financeMutations';

export const dynamic = 'force-dynamic';

const lineItemUpdateSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().max(1000).optional().nullable(),
  amountCents: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().positive().optional().nullable(),
  unitLabel: z.string().trim().max(40).optional().nullable(),
  status: z.enum(['ESTIMATED', 'APPROVED', 'ACTUAL', 'PAID', 'VOID']).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
  serviceStartAt: z.string().optional().nullable(),
  serviceEndAt: z.string().optional().nullable(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof FinanceMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> },
) {
  const session = await requireSession(req);
  const { id, lineItemId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = lineItemUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const organization = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const lineItem = await updateFinancialLineItem({
      organizationId: id,
      lineItemId,
      ...parsed.data,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ lineItem });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
