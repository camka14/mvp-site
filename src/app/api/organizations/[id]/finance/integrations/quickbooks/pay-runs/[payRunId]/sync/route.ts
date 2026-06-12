import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  QuickBooksPayRunSyncError,
  syncStaffPayRunToQuickBooks,
} from '@/server/integrations/quickBooksPayRunSync';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payRunId: string }> },
) {
  const session = await requireSession(req);
  const { id, payRunId } = await params;
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
    const result = await syncStaffPayRunToQuickBooks({
      organizationId: id,
      payRunId,
      actingUserId: session.userId,
      client: prisma,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof QuickBooksPayRunSyncError) {
      return NextResponse.json({
        error: error.message,
        code: error.code ?? null,
      }, { status: error.status });
    }
    console.error('QuickBooks pay-run sync failed', {
      message: error instanceof Error ? error.message : 'Unknown QuickBooks pay-run sync error.',
    });
    return NextResponse.json({ error: 'QuickBooks pay-run sync failed.' }, { status: 502 });
  }
}
