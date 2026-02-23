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

type Installment = {
  amountCents: number;
  dueDate: Date;
};

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

  const parentPayments = await prisma.billPayments.findMany({
    where: { billId: bill.id },
    orderBy: { sequence: 'asc' },
    select: { amountCents: true, dueDate: true, status: true },
  });

  const pendingInstallments: Installment[] = parentPayments
    .filter((payment) => payment.status === 'PENDING' || payment.status === null)
    .filter((payment) => payment.amountCents > 0)
    .map((payment) => ({
      amountCents: payment.amountCents,
      dueDate: payment.dueDate,
    }));

  const remainingAmountCents = pendingInstallments.reduce((total, installment) => total + installment.amountCents, 0);
  if (remainingAmountCents <= 0) {
    return NextResponse.json({ error: 'Bill has no pending installments to split' }, { status: 400 });
  }

  // Split each pending installment across players so due dates are preserved.
  const installmentSharesByPlayer = playerIds.map(() => [] as Array<{ amountCents: number; dueDate: Date }>);
  pendingInstallments.forEach((installment) => {
    const perAmount = Math.floor(installment.amountCents / playerIds.length);
    const remainder = installment.amountCents % playerIds.length;
    playerIds.forEach((_, playerIndex) => {
      const amountCents = perAmount + (playerIndex < remainder ? 1 : 0);
      if (amountCents > 0) {
        installmentSharesByPlayer[playerIndex].push({
          amountCents,
          dueDate: installment.dueDate,
        });
      }
    });
  });

  const now = new Date();
  const children = await prisma.$transaction(async (tx) => {
    const rows: Array<Record<string, unknown> | null> = [];

    for (let index = 0; index < playerIds.length; index += 1) {
      const playerId = playerIds[index];
      const installments = installmentSharesByPlayer[index] ?? [];
      const childAmount = installments.reduce((total, entry) => total + entry.amountCents, 0);
      if (childAmount <= 0) {
        rows.push(null);
        continue;
      }

      const nextInstallment = installments[0];
      const child = await tx.bills.create({
        data: {
          id: crypto.randomUUID(),
          ownerType: 'USER',
          ownerId: playerId,
          organizationId: bill.organizationId,
          eventId: bill.eventId,
          totalAmountCents: childAmount,
          paidAmountCents: 0,
          nextPaymentDue: nextInstallment?.dueDate ?? null,
          nextPaymentAmountCents: nextInstallment?.amountCents ?? null,
          parentBillId: bill.id,
          allowSplit: false,
          status: 'OPEN',
          paymentPlanEnabled: installments.length > 1,
          createdAt: now,
          updatedAt: now,
        },
      });

      for (let installmentIndex = 0; installmentIndex < installments.length; installmentIndex += 1) {
        const installment = installments[installmentIndex];
        await tx.billPayments.create({
          data: {
            id: crypto.randomUUID(),
            billId: child.id,
            sequence: installmentIndex + 1,
            dueDate: installment.dueDate,
            amountCents: installment.amountCents,
            status: 'PENDING',
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      rows.push(child);
    }

    return rows;
  });

  const createdChildren = children.filter((child): child is NonNullable<typeof child> => Boolean(child));
  return NextResponse.json({ children: withLegacyList(createdChildren) }, { status: 200 });
}
