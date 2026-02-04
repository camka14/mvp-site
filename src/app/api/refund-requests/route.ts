import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

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

  const where: any = {};
  if (organizationId) where.organizationId = organizationId;
  if (userId) where.userId = userId;
  if (hostId) where.hostId = hostId;

  const refunds = await prisma.refundRequests.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ refunds: withLegacyList(refunds) }, { status: 200 });
}
