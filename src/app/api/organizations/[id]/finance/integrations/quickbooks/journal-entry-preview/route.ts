import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { loadOrganizationFinanceSummary } from '@/server/finance/financeRepository';
import { listOrganizationFinanceCategoryAccountingMappings } from '@/server/integrations/financeCategoryAccountingMappings';
import { buildQuickBooksFinanceJournalEntryPreview } from '@/server/integrations/quickBooksFinanceJournalPreview';
import { QUICKBOOKS_PROVIDER } from '@/server/integrations/quickBooksConnection';

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

  const connection = await prisma.organizationAccountingConnections.findUnique({
    where: {
      organizationId_provider: {
        organizationId: id,
        provider: QUICKBOOKS_PROVIDER,
      },
    },
    select: {
      id: true,
      status: true,
      financeClearingAccountExternalId: true,
      financeClearingAccountName: true,
    },
  });
  if (!connection || connection.status === 'DISCONNECTED') {
    return NextResponse.json({ error: 'Connect QuickBooks before previewing journal entries.' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const [finance, mappings] = await Promise.all([
    loadOrganizationFinanceSummary(id, prisma, { from, to }),
    listOrganizationFinanceCategoryAccountingMappings(id, prisma),
  ]);
  if (!finance) {
    return NextResponse.json({ error: 'Organization finance is unavailable.' }, { status: 404 });
  }

  const preview = buildQuickBooksFinanceJournalEntryPreview({
    finance,
    mappings,
    clearingMapping: connection,
    from,
    to,
  });

  return NextResponse.json({ preview }, { status: 200 });
}
