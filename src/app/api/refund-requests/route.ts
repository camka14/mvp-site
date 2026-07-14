import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { buildRefundApprovalPreview, type RefundRequestRow } from '@/server/refunds/refundExecution';

export const dynamic = 'force-dynamic';

const TEAM_REFUND_FANOUT_REASON = 'team_refund_fanout';

// This is also the mobile approval-preview contract. Keep the immutable
// snapshot fields explicit rather than relying on Prisma's default selection.
const refundRequestSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  eventId: true,
  userId: true,
  requestedByUserId: true,
  hostId: true,
  teamId: true,
  reason: true,
  organizationId: true,
  status: true,
  slotId: true,
  occurrenceDate: true,
  billIds: true,
  paymentIds: true,
  paymentScope: true,
  requestedAmountCents: true,
  currency: true,
  policyDecision: true,
  scopeVersion: true,
  scopeHash: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const organizationId = params.get('organizationId');
  const userId = params.get('userId');
  const hostId = params.get('hostId');
  const limit = Number(params.get('limit') || '100');

  if (userId && !session.isAdmin && session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (hostId && !session.isAdmin && session.userId !== hostId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (organizationId && !session.isAdmin) {
    const organization = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    });
    if (!(await canManageOrganization(session, organization))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // An unscoped list is a personal inbox, never a global financial report.
  // Hosts and organization managers must explicitly request the scope they
  // manage; administrators retain the operational global view.
  const where: any = {};
  if (organizationId) where.organizationId = organizationId;
  if (userId) where.userId = userId;
  if (hostId) where.hostId = hostId;
  if (!organizationId && !userId && !hostId && !session.isAdmin) {
    where.userId = session.userId;
  }
  where.reason = { not: TEAM_REFUND_FANOUT_REASON };

  const refunds = await prisma.refundRequests.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { createdAt: 'desc' },
    select: refundRequestSelect,
  });

  const refundsWithApprovalPreview = refunds.map((refund) => ({
    ...refund,
    approvalPreview: buildRefundApprovalPreview(refund as RefundRequestRow),
  }));

  return NextResponse.json({ refunds: refundsWithApprovalPreview }, { status: 200 });
}
