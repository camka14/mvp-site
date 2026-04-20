import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const suspendSchema = z.object({
  disabled: z.boolean().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRazumlyAdmin(req);
    const body = await req.json().catch(() => null);
    const parsed = suspendSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    const authUser = await prisma.authUser.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!authUser) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const disableUser = parsed.data.disabled !== false;
    const now = new Date();
    const updated = await prisma.authUser.update({
      where: { id },
      data: disableUser
        ? {
            disabledAt: now,
            disabledByUserId: session.userId,
            disabledReason: parsed.data.reason?.trim() || 'Suspended by moderation.',
            updatedAt: now,
          }
        : {
            disabledAt: null,
            disabledByUserId: null,
            disabledReason: null,
            updatedAt: now,
          },
      select: {
        id: true,
        disabledAt: true,
        disabledByUserId: true,
        disabledReason: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to update suspension state', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
