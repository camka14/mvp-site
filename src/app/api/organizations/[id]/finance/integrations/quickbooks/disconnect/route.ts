import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import { disconnectQuickBooksConnection } from '@/server/integrations/quickBooksConnection';

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

  try {
    const connection = await disconnectQuickBooksConnection({
      organizationId: id,
      actingUserId: session.userId,
      client: prisma,
    });
    return NextResponse.json({ connection }, { status: 200 });
  } catch (error) {
    console.error('QuickBooks disconnect failed', {
      message: error instanceof Error ? error.message : 'Unknown QuickBooks disconnect error.',
    });
    return NextResponse.json({
      error: 'QuickBooks disconnect failed. QuickBooks tokens were not cleared because revocation could not be confirmed.',
    }, { status: 502 });
  }
}
