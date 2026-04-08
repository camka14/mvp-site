import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const searchParams = req.nextUrl.searchParams;
  const requestedUserId = searchParams.get('userId')?.trim() || session.userId;
  const limitParam = Number.parseInt(searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 250) : 100;

  if (!session.isAdmin && requestedUserId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subscriptions = await prisma.subscriptions.findMany({
    where: { userId: requestedUserId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    subscriptions: withLegacyList(subscriptions),
  }, { status: 200 });
}
