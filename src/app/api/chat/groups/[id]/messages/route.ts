import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const group = await prisma.chatGroup.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && !group.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const search = req.nextUrl.searchParams;
  const rawLimit = Number(search.get('limit') || '100');
  const normalizedLimit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;
  const limit = Math.min(Math.max(normalizedLimit, 1), 100);
  const rawIndex = Number(search.get('index') || '0');
  const normalizedIndex = Number.isFinite(rawIndex) ? Math.trunc(rawIndex) : 0;
  const index = Math.max(0, normalizedIndex);
  const order = search.get('order') === 'desc' ? 'desc' : 'asc';

  const where = { chatId: id };
  const [totalCount, messages] = await Promise.all([
    prisma.messages.count({ where }),
    prisma.messages.findMany({
      where,
      orderBy: { sentTime: order },
      skip: index,
      take: limit,
    }),
  ]);

  const nextIndex = index + messages.length;
  const remainingCount = Math.max(totalCount - nextIndex, 0);

  return NextResponse.json({
    messages: withLegacyList(messages),
    pagination: {
      index,
      limit,
      totalCount,
      nextIndex,
      remainingCount,
      hasMore: remainingCount > 0,
      order,
    },
  }, { status: 200 });
}
