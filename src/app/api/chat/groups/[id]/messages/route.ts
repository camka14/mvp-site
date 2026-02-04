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
  const limit = Number(search.get('limit') || '100');
  const order = search.get('order') === 'desc' ? 'desc' : 'asc';

  const messages = await prisma.messages.findMany({
    where: { chatId: id },
    orderBy: { sentTime: order },
    take: Number.isFinite(limit) ? limit : 100,
  });

  return NextResponse.json({ messages: withLegacyList(messages) }, { status: 200 });
}
