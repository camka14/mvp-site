import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  QUICKBOOKS_PROVIDER,
  updateQuickBooksAccountMapping,
} from '@/server/integrations/quickBooksConnection';

export const dynamic = 'force-dynamic';

const schema = z.object({
  payrollExpenseAccountExternalId: z.string().trim().max(80).optional().nullable(),
  payrollExpenseAccountName: z.string().trim().max(160).optional().nullable(),
  payrollLiabilityAccountExternalId: z.string().trim().max(80).optional().nullable(),
  payrollLiabilityAccountName: z.string().trim().max(160).optional().nullable(),
  financeClearingAccountExternalId: z.string().trim().max(80).optional().nullable(),
  financeClearingAccountName: z.string().trim().max(160).optional().nullable(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
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

  const connection = await prisma.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId: id,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    select: { id: true },
  });
  if (!connection) {
    return NextResponse.json({ error: 'Connect QuickBooks before saving account mappings.' }, { status: 400 });
  }

  const updated = await updateQuickBooksAccountMapping({
    organizationId: id,
    actingUserId: session.userId,
    ...parsed.data,
    client: prisma,
  });

  return NextResponse.json({ connection: updated }, { status: 200 });
}
