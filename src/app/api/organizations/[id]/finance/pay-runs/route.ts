import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { createDraftStaffPayRun, listStaffPayRuns, StaffPayRunError } from '@/server/finance/staffPayRuns';

export const dynamic = 'force-dynamic';

const createPayRunSchema = z.object({
  title: z.string().trim().max(140).optional().nullable(),
  periodStart: z.string().trim().min(1),
  periodEnd: z.string().trim().min(1),
  scheduledPayDate: z.string().trim().min(1).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof StaffPayRunError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

const loadOrganizationForAccess = async (id: string) => prisma.organizations.findUnique({
  where: { id },
  select: { id: true, ownerId: true },
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const organization = await loadOrganizationForAccess(id);
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payRuns = await listStaffPayRuns(id, prisma);
  return NextResponse.json({ payRuns }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createPayRunSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const organization = await loadOrganizationForAccess(id);
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payRun = await createDraftStaffPayRun({
      organizationId: id,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      scheduledPayDate: parsed.data.scheduledPayDate,
      title: parsed.data.title,
      notes: parsed.data.notes,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ payRun }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
