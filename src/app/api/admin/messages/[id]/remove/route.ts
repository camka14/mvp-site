import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const removeSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = removeSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const message = await prisma.messages.findUnique({
      where: { id },
      select: { id: true, removedAt: true },
    });
    if (!message) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.messages.update({
      where: { id },
      data: {
        removedAt: message.removedAt ?? new Date(),
        removedByUserId: session.userId,
        removalReason: parsed.data.reason?.trim() || 'Removed by moderation.',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(withLegacyFields(updated), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to remove admin message', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
