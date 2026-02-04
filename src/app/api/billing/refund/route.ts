import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  payloadEvent: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
  reason: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const eventId = parsed.data.payloadEvent?.$id ?? parsed.data.payloadEvent?.id ?? parsed.data.payloadEvent?.eventId;
  if (!eventId) {
    return NextResponse.json({ error: 'Event is required' }, { status: 400 });
  }

  await prisma.refundRequests.create({
    data: {
      id: crypto.randomUUID(),
      eventId,
      userId: session.userId,
      hostId: parsed.data.payloadEvent?.hostId ?? null,
      organizationId: parsed.data.payloadEvent?.organizationId ?? null,
      reason: parsed.data.reason ?? 'requested_by_customer',
      status: 'WAITING',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
}
