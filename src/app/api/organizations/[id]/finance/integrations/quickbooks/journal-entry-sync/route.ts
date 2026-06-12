import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  QuickBooksFinanceJournalSyncError,
  syncOrganizationFinanceJournalEntryToQuickBooks,
} from '@/server/integrations/quickBooksFinanceJournalSync';

export const dynamic = 'force-dynamic';

export async function POST(
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
  try {
    const result = await syncOrganizationFinanceJournalEntryToQuickBooks({
      organizationId: id,
      actingUserId: session.userId,
      from,
      to,
      client: prisma,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (syncError) {
    if (syncError instanceof QuickBooksFinanceJournalSyncError) {
      return NextResponse.json(
        { error: syncError.message, code: syncError.code ?? null },
        { status: syncError.status },
      );
    }
    throw syncError;
  }
}
