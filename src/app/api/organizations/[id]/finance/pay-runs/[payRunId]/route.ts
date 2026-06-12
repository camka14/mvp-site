import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { StaffPayRunError, updateStaffPayRunStatus } from '@/server/finance/staffPayRuns';

export const dynamic = 'force-dynamic';

const updatePayRunSchema = z.object({
  action: z.enum(['APPROVE', 'MARK_PAID', 'VOID', 'UPDATE_ITEM_TRANSFERS', 'RECORD_EXPORT']),
  payoutProvider: z.string().trim().max(80).nullable().optional(),
  payoutProviderBatchId: z.string().trim().max(160).nullable().optional(),
  exportFormat: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  voidReason: z.string().trim().max(1000).nullable().optional(),
  itemTransfers: z.array(z.object({
    itemId: z.string().trim().min(1).max(120),
    payoutProviderTransferId: z.string().trim().max(160).nullable().optional(),
  }).strict()).max(200).optional(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof StaffPayRunError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payRunId: string }> },
) {
  const session = await requireSession(req);
  const { id, payRunId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updatePayRunSchema.safeParse(body ?? {});
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
    const payRun = await updateStaffPayRunStatus({
      organizationId: id,
      payRunId,
      action: parsed.data.action,
      actingUserId: session.userId,
      payoutProvider: parsed.data.payoutProvider,
      payoutProviderBatchId: parsed.data.payoutProviderBatchId,
      exportFormat: parsed.data.exportFormat,
      notes: parsed.data.notes,
      voidReason: parsed.data.voidReason,
      itemTransfers: parsed.data.itemTransfers,
    }, prisma);
    return NextResponse.json({ payRun }, { status: 200 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
