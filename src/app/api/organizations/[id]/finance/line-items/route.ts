import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { createFinancialLineItem, FinanceMutationError } from '@/server/finance/financeMutations';

export const dynamic = 'force-dynamic';

const lineItemSchema = z.object({
  scope: z.enum(['ORGANIZATION', 'EVENT', 'TEAM', 'EVENT_TEAM']),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(140),
  description: z.string().max(1000).optional().nullable(),
  amountCents: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().optional().nullable(),
  unitLabel: z.string().trim().max(40).optional().nullable(),
  status: z.enum(['ESTIMATED', 'APPROVED', 'ACTUAL', 'PAID', 'VOID']).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
  serviceStartAt: z.string().optional().nullable(),
  serviceEndAt: z.string().optional().nullable(),
  eventId: z.string().trim().min(1).optional().nullable(),
  teamId: z.string().trim().min(1).optional().nullable(),
  eventTeamId: z.string().trim().min(1).optional().nullable(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof FinanceMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = lineItemSchema.safeParse(body ?? {});
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
    const lineItem = await createFinancialLineItem({
      organizationId: id,
      ...parsed.data,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ lineItem }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
