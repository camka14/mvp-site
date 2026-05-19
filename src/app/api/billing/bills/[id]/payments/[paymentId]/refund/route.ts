import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  canAdministerBillPayment,
  loadBillPaymentForAction,
  refundBillPaymentForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amountCents: z.number(),
}).passthrough();

const resolveErrorStatus = (error: unknown, message: string): number => {
  if (message.includes('Stripe is not configured')) return 500;
  const errorType = typeof (error as { type?: unknown })?.type === 'string'
    ? (error as { type: string }).type
    : '';
  if (errorType.toLowerCase().startsWith('stripe')) return 502;
  return 400;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await requireSession(req);
  const { id, paymentId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const loaded = await loadBillPaymentForAction(id, paymentId);
  if (!loaded) {
    return NextResponse.json({ error: 'Bill payment not found' }, { status: 404 });
  }
  if (!(await canAdministerBillPayment(session, loaded.bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await refundBillPaymentForAction({
      bill: loaded.bill,
      payment: loaded.payment,
      amountCents: parsed.data.amountCents,
      actorUserId: session.userId,
      now: new Date(),
    });
    return NextResponse.json(
      {
        payment: withLegacyFields(result.payment),
        refundedAmountCents: result.refundedAmountCents,
        remainingRefundableAmountCents: result.remainingRefundableAmountCents,
        refundId: result.refundId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refund bill payment';
    return NextResponse.json({ error: message }, { status: resolveErrorStatus(error, message) });
  }
}
