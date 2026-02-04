import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  userIds: z.array(z.string()),
  hostId: z.string(),
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const userId = params.get('userId') ?? session.userId;
  if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const groups = await prisma.chatGroup.findMany({
    where: { userIds: { has: userId } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ groups: withLegacyList(groups) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.userIds.includes(session.userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const group = await prisma.chatGroup.create({
    data: {
      id: parsed.data.id,
      name: parsed.data.name ?? null,
      userIds: parsed.data.userIds,
      hostId: parsed.data.hostId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(group), { status: 201 });
}
