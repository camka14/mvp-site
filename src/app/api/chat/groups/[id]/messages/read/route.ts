import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const group = await prisma.chatGroup.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && !group.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$executeRaw`
    update "Messages"
    set "readByIds" = array_append("readByIds", ${session.userId}),
        "updatedAt" = now()
    where "chatId" = ${id}
      and "userId" <> ${session.userId}
      and not (${session.userId} = any("readByIds"))
  `;

  return NextResponse.json({ ok: true }, { status: 200 });
}
