import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const schema = z.object({
  playerIds: z.array(z.string()),
  billId: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const bill = await prisma.bills.findUnique({ where: { id } });
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  }

  const playerIds = parsed.data.playerIds;
  if (!playerIds.length) {
    return NextResponse.json({ error: 'playerIds required' }, { status: 400 });
  }

  const perAmount = Math.round(bill.totalAmountCents / playerIds.length);
  const now = new Date();

  const children = await Promise.all(playerIds.map(async (playerId) => {
    const child = await prisma.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType: 'USER',
        ownerId: playerId,
        organizationId: bill.organizationId,
        eventId: bill.eventId,
        totalAmountCents: perAmount,
        paidAmountCents: 0,
        parentBillId: bill.id,
        allowSplit: false,
        status: 'OPEN',
        paymentPlanEnabled: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: child.id,
        sequence: 1,
        dueDate: now,
        amountCents: perAmount,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      },
    });

    return child;
  }));

  return NextResponse.json({ children: withLegacyList(children) }, { status: 200 });
}
