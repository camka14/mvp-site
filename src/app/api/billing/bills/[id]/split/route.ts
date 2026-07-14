import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageBillPayment } from '@/server/billing/billPaymentActions';
import { acquireBillSplitLock } from '@/server/billing/billSplitLock';

export const dynamic = 'force-dynamic';

const schema = z.object({
  playerIds: z.array(z.string()),
  billId: z.string().optional(),
}).passthrough();

type Installment = {
  amountCents: number;
  dueDate: Date;
};

class DuplicateBillSplitError extends Error {}
class NoPendingBillInstallmentsError extends Error {}
class BillSplitPaymentInProgressError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
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
  if (bill.ownerType !== 'TEAM') {
    return NextResponse.json({ error: 'Only team bills can be split.' }, { status: 400 });
  }
  if (bill.allowSplit !== true) {
    return NextResponse.json({ error: 'This bill does not allow splitting.' }, { status: 409 });
  }
  if (!await canManageBillPayment(session, bill)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const playerIds = Array.from(new Set(parsed.data.playerIds.map((id) => id.trim()).filter(Boolean)));
  if (!playerIds.length) {
    return NextResponse.json({ error: 'playerIds required' }, { status: 400 });
  }
  const team = await prisma.teams.findUnique({
    where: { id: bill.ownerId },
    select: { playerIds: true },
  });
  if (!team || playerIds.some((playerId) => !team.playerIds.includes(playerId))) {
    return NextResponse.json({ error: 'Every split recipient must be an active team player.' }, { status: 400 });
  }

  const now = new Date();
  let children: Array<Record<string, unknown> | null>;
  try {
    children = await prisma.$transaction(async (tx) => {
      await acquireBillSplitLock(tx, bill.id);
      const existingChild = await tx.bills.findFirst({
        where: { parentBillId: bill.id },
        select: { id: true },
      });
      if (existingChild) {
        throw new DuplicateBillSplitError('Bill has already been split.');
      }
      const parentPayments = await tx.billPayments.findMany({
        where: { billId: bill.id },
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          amountCents: true,
          dueDate: true,
          status: true,
          paymentIntentId: true,
        },
      });
      const pendingPayments = parentPayments.filter((payment) => (
        (payment.status === 'PENDING' || payment.status === 'FAILED' || payment.status === null)
        && payment.amountCents > 0
      ));
      if (parentPayments.some((payment) => (
        payment.status === 'PROCESSING'
        || payment.status === 'PARTIAL'
        || payment.status === 'DISPUTED'
        || (
          (payment.status === 'PENDING' || payment.status === 'FAILED' || payment.status === null)
          && payment.paymentIntentId
        )
      ))) {
        throw new BillSplitPaymentInProgressError(
          'Bill cannot be split after a parent installment has been started or partially paid.',
        );
      }
      const remainingAmountCents = pendingPayments.reduce((total, payment) => total + payment.amountCents, 0);
      if (remainingAmountCents <= 0) {
        throw new NoPendingBillInstallmentsError('Bill has no pending installments to split');
      }

      const pendingInstallments: Installment[] = pendingPayments.map((payment) => ({
        amountCents: payment.amountCents,
        dueDate: payment.dueDate,
      }));
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

      // The parent cannot remain payable once its outstanding balance has
      // been allocated to children. Conditional update prevents a concurrent
      // webhook from turning a just-paid parent installment into duplicate debt.
      const voidedParentPayments = await tx.billPayments.updateMany({
        where: {
          id: { in: pendingPayments.map((payment) => payment.id) },
          paymentIntentId: null,
          OR: [{ status: 'PENDING' }, { status: 'FAILED' }, { status: null }],
        } as any,
        data: {
          status: 'VOID',
          paymentIntentId: null,
          payerUserId: null,
          paidAmountCents: 0,
          paidAt: null,
          updatedAt: now,
        },
      });
      if (voidedParentPayments.count !== pendingPayments.length) {
        throw new BillSplitPaymentInProgressError(
          'Bill changed while it was being split. Refresh and try again.',
        );
      }
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
  } catch (error) {
    if (error instanceof DuplicateBillSplitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NoPendingBillInstallmentsError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof BillSplitPaymentInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const createdChildren = children.filter((child): child is NonNullable<typeof child> => Boolean(child));
  return NextResponse.json({ children: createdChildren }, { status: 200 });
}
