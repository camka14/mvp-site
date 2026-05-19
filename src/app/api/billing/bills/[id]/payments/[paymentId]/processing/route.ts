import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  canManageBillPayment,
  loadBillPaymentForAction,
  markBillPaymentProcessingForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  paymentIntent: z.string(),
}).passthrough();

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
  if (!(await canManageBillPayment(session, loaded.bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const bill = await markBillPaymentProcessingForAction({
      bill: loaded.bill,
      payment: loaded.payment,
      paymentIntent: parsed.data.paymentIntent,
      userId: session.userId,
      now: new Date(),
    });
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }
    return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark bill payment pending' },
      { status: 400 },
    );
  }
}
