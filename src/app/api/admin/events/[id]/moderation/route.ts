import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const moderationSchema = z.object({
  action: z.enum(['UNPUBLISH', 'REMOVE_CONTENT']),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = moderationSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const event = await prisma.events.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.events.update({
      where: { id },
      data: parsed.data.action === 'REMOVE_CONTENT'
        ? {
            state: 'UNPUBLISHED',
            description: 'Removed by moderation.',
            updatedAt: new Date(),
          }
        : {
            state: 'UNPUBLISHED',
            updatedAt: new Date(),
          },
    });

    return NextResponse.json(withLegacyFields(updated), { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to moderate event', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
