import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganizationFinance } from '@/server/finance/financeAccess';
import {
  listQuickBooksAccounts,
  QuickBooksIntegrationError,
} from '@/server/integrations/quickBooksConnection';

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

  try {
    const accounts = await listQuickBooksAccounts({
      organizationId: id,
      actingUserId: session.userId,
      client: prisma,
    });
    return NextResponse.json({ accounts }, { status: 200 });
  } catch (error) {
    if (error instanceof QuickBooksIntegrationError) {
      return NextResponse.json({
        error: error.message,
        code: error.code ?? null,
        intuitTid: error.intuitTid ?? null,
      }, { status: error.status });
    }
    console.error('QuickBooks account lookup failed', {
      message: error instanceof Error ? error.message : 'Unknown QuickBooks account lookup error.',
    });
    return NextResponse.json({ error: 'QuickBooks account lookup failed.' }, { status: 502 });
  }
}
