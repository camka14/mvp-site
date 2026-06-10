import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  listOrganizationFinancialLineItemCategories,
  loadOrganizationFinanceSummary,
} from '@/server/finance/financeRepository';
import { listStaffPayRuns } from '@/server/finance/staffPayRuns';
import { listOrganizationAccountingConnections } from '@/server/integrations/quickBooksConnection';

export const dynamic = 'force-dynamic';

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
  if (!(await canManageOrganizationFinance(session, organization, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const [finance, payRuns, lineItemCategories, accountingConnections] = await Promise.all([
    loadOrganizationFinanceSummary(id, prisma, { from, to }),
    listStaffPayRuns(id, prisma),
    listOrganizationFinancialLineItemCategories(id, prisma),
    listOrganizationAccountingConnections(id, prisma),
  ]);
  if (!finance) {
    return NextResponse.json({ error: 'Organization finance is unavailable.' }, { status: 404 });
  }

  return NextResponse.json({
    finance,
    payRuns,
    lineItemCategories,
    accountingConnections,
  }, { status: 200 });
}
