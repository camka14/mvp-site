import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageEvent } from '@/server/accessControl';
import {
  applyRefundAttempts,
  createStripeRefundAttempts,
  resolveRefundablePaymentsForRequest,
  summarizeRefundAttempts,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['WAITING', 'APPROVED', 'REJECTED']),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.refundRequests.findUnique({
    where: { id },
    select: {
      id: true,
      eventId: true,
      userId: true,
      hostId: true,
      teamId: true,
      organizationId: true,
      reason: true,
      status: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const eventAccess = await prisma.events.findUnique({
    where: { id: existing.eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (!eventAccess) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && !(await canManageEvent(session, eventAccess))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  let stripeRefundAttempts: StripeRefundAttempt[] = [];
  if (parsed.data.status === 'APPROVED') {
    const refundablePayments = await resolveRefundablePaymentsForRequest(prisma, existing as RefundRequestRow);
    try {
      stripeRefundAttempts = await createStripeRefundAttempts({
        request: existing as RefundRequestRow,
        payments: refundablePayments,
        approvedByUserId: session.userId,
      });
    } catch (error) {
      console.error('Stripe refund failed during refund request approval', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create refund.' },
        { status: 502 },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequests.update({
      where: { id },
      data: { status: parsed.data.status, updatedAt: now },
    });

    const updatedPayments = await applyRefundAttempts(tx, stripeRefundAttempts, now);

    return {
      updated,
      updatedPayments,
    };
  });

  const refundSummary = summarizeRefundAttempts(stripeRefundAttempts);

  return NextResponse.json(
    {
      ...withLegacyFields(result.updated),
      refundedAmountCents: refundSummary.refundedAmountCents,
      stripeRefundIds: refundSummary.stripeRefundIds,
      refundedPaymentIds: result.updatedPayments.map((payment: { id: string }) => payment.id),
    },
    { status: 200 },
  );
}
