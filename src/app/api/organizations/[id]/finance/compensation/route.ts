import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageStaffCompensation } from '@/server/finance/financeAccess';
import { createCompensationRate, FinanceMutationError } from '@/server/finance/financeMutations';

export const dynamic = 'force-dynamic';

const compensationSchema = z.object({
  targetType: z.enum(['ROLE', 'STAFF']),
  targetId: z.string().trim().min(1),
  wageType: z.enum(['HOURLY', 'SALARY', 'FLAT_PER_EVENT']),
  amountCents: z.coerce.number().int().positive(),
  effectiveFrom: z.string().optional().nullable(),
  effectiveTo: z.string().optional().nullable(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof FinanceMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

const selectRoleCompensationRate = {
  id: true,
  organizationId: true,
  organizationRoleId: true,
  wageType: true,
  amountCents: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
};

const selectStaffCompensationRate = {
  id: true,
  organizationId: true,
  staffMemberId: true,
  wageType: true,
  amountCents: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const organization = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageStaffCompensation(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [roleRates, staffRates] = await Promise.all([
    prisma.organizationRoleCompensationRates.findMany({
      where: { organizationId: id },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: selectRoleCompensationRate,
    }),
    prisma.staffCompensationRates.findMany({
      where: { organizationId: id },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: selectStaffCompensationRate,
    }),
  ]);

  return NextResponse.json({ roleRates, staffRates }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = compensationSchema.safeParse(body ?? {});
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
  if (!(await canManageStaffCompensation(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rate = await createCompensationRate({
      organizationId: id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      wageType: parsed.data.wageType,
      amountCents: parsed.data.amountCents,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ rate, targetType: parsed.data.targetType }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
