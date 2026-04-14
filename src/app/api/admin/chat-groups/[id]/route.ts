import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { archiveChatGroup } from '@/server/moderation';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const updateSchema = z.object({
  archived: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const group = await prisma.chatGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (parsed.data.archived) {
      const archived = await archiveChatGroup(prisma, id, {
        actorUserId: session.userId,
        reason: parsed.data.reason || 'ADMIN_ARCHIVE',
        userIds: group.userIds,
        hostId: group.hostId,
      });
      return NextResponse.json(withLegacyFields(archived), { status: 200 });
    }

    const restored = await prisma.chatGroup.update({
      where: { id },
      data: {
        archivedAt: null,
        archivedReason: null,
        archivedByUserId: null,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(withLegacyFields(restored), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update admin chat group state', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
