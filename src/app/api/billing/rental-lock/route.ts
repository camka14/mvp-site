import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import {
  extractRentalCheckoutWindow,
  releaseRentalCheckoutLocks,
  reserveRentalCheckoutLocks,
} from '@/server/repositories/rentalCheckoutLocks';

export const dynamic = 'force-dynamic';

const schema = z.object({
  event: z.record(z.string(), z.any()).optional(),
  timeSlot: z.record(z.string(), z.any()).optional(),
}).passthrough();

const parsePayload = async (req: NextRequest): Promise<Record<string, unknown> | null> => {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return null;
  }
  return parsed.data as Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const payload = await parsePayload(req);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const checkoutWindow = extractRentalCheckoutWindow({
    event: payload.event,
    timeSlot: payload.timeSlot,
  });
  if (!checkoutWindow.ok) {
    return NextResponse.json({ error: checkoutWindow.error }, { status: checkoutWindow.status });
  }

  const result = await reserveRentalCheckoutLocks({
    client: prisma,
    window: checkoutWindow.window,
    userId: session.userId,
    now: new Date(),
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        conflicts: result.conflicts,
        conflictFieldIds: result.conflictFieldIds,
      },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
    },
    { status: 200 },
  );
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  const payload = await parsePayload(req);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const checkoutWindow = extractRentalCheckoutWindow({
    event: payload.event,
    timeSlot: payload.timeSlot,
  });
  if (!checkoutWindow.ok) {
    return NextResponse.json({ error: checkoutWindow.error }, { status: checkoutWindow.status });
  }

  await releaseRentalCheckoutLocks({
    client: prisma,
    window: checkoutWindow.window,
    userId: session.userId,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
