import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  canManageBillPayment,
  cancelProcessingBillPaymentForAction,
  loadBillPaymentForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await requireSession(req);
  const { id, paymentId } = await params;
  const loaded = await loadBillPaymentForAction(id, paymentId);
  if (!loaded) {
    return NextResponse.json({ error: 'Bill payment not found' }, { status: 404 });
  }
  if (!(await canManageBillPayment(session, loaded.bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const bill = await cancelProcessingBillPaymentForAction({
      bill: loaded.bill,
      payment: loaded.payment,
      now: new Date(),
    });
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }
    return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel pending bill payment';
    const status = message.includes('already completed') || message.includes('cannot be cancelled') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
