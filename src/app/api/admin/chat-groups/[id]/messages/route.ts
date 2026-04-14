import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id } = await params;
    const group = await prisma.chatGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const search = req.nextUrl.searchParams;
    const rawLimit = Number(search.get('limit') || '100');
    const normalizedLimit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;
    const limit = Math.min(Math.max(normalizedLimit, 1), 250);
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

    const senderIds = Array.from(new Set(messages.map((message) => message.userId)));
    const senders = senderIds.length > 0
      ? await prisma.userData.findMany({
          where: { id: { in: senderIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
            profileImageId: true,
          },
        })
      : [];
    const sendersById = new Map(
      senders.map((sender) => [sender.id, withLegacyFields(applyNameCaseToUserFields(sender))]),
    );

    const nextIndex = index + messages.length;
    const remainingCount = Math.max(totalCount - nextIndex, 0);

    return NextResponse.json(
      {
        group: withLegacyFields(group),
        messages: withLegacyList(messages).map((message) => ({
          ...message,
          sender: sendersById.get(message.userId) ?? null,
        })),
        pagination: {
          index,
          limit,
          totalCount,
          nextIndex,
          remainingCount,
          hasMore: remainingCount > 0,
          order,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin chat messages', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
