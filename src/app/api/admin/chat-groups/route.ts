import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

const parsePagination = (request: NextRequest): { limit: number; offset: number } => {
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(request.nextUrl.searchParams.get('offset') ?? 0);

  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.trunc(offsetRaw), 0)
    : 0;
  return { limit, offset };
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const { limit, offset } = parsePagination(req);
    const query = (req.nextUrl.searchParams.get('query') ?? '').trim();

    const where: any = {};
    if (query.length > 0) {
      where.OR = [
        { id: { contains: query, mode: 'insensitive' as const } },
        { name: { contains: query, mode: 'insensitive' as const } },
        { archivedReason: { contains: query, mode: 'insensitive' as const } },
      ];
    }

    const [total, groups] = await Promise.all([
      prisma.chatGroup.count({ where }),
      prisma.chatGroup.findMany({
        where,
        orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const groupIds = groups.map((group) => group.id);
    const memberIds = Array.from(new Set(groups.flatMap((group) => group.userIds)));
    const [messages, members] = await Promise.all([
      groupIds.length > 0
        ? prisma.messages.findMany({
            where: { chatId: { in: groupIds } },
            distinct: ['chatId'],
            orderBy: [
              { chatId: 'asc' },
              { sentTime: 'desc' },
            ],
          })
        : Promise.resolve([]),
      memberIds.length > 0
        ? prisma.userData.findMany({
            where: { id: { in: memberIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userName: true,
              profileImageId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const lastMessageByChatId = new Map(messages.map((message) => [message.chatId, withLegacyFields(message)]));
    const membersById = new Map(
      members.map((member) => [member.id, withLegacyFields(applyNameCaseToUserFields(member))]),
    );

    return NextResponse.json(
      {
        groups: withLegacyList(groups).map((group) => ({
          ...group,
          memberUsers: group.userIds
            .map((userId: string) => membersById.get(userId))
            .filter(Boolean),
          lastMessage: lastMessageByChatId.get(group.id) ?? null,
        })),
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin chat groups', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
