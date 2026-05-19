import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  canAdministerBillPayment,
  cancelBillPaymentPlanForAction,
  loadBillForAction,
} from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const bill = await loadBillForAction(id);
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  }
  if (!(await canAdministerBillPayment(session, bill))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const updatedBill = await cancelBillPaymentPlanForAction({
      bill,
      now: new Date(),
    });
    return NextResponse.json({ bill: withLegacyFields(updatedBill) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel payment plan';
    const status = message.includes('already completed') || message.includes('cannot be cancelled') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
