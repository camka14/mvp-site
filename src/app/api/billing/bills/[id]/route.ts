import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';
import { canManageBillPayment } from '@/server/billing/billPaymentActions';
import { handleApiRouteError } from '@/server/http/routeErrors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;
    const bill = await prisma.bills.findUnique({ where: { id } });
    if (!bill) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!await canManageBillPayment(session, bill)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const payments = await prisma.billPayments.findMany({
      where: { billId: bill.id },
      select: { paymentIntentId: true },
    });
    const discountAmountsByBillId = await loadBillDiscountSummaries(prisma, [{ ...bill, payments }]);
    return NextResponse.json({
      bill: withLegacyFields(withBillDiscountAmounts(bill, discountAmountsByBillId)),
    }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to load bill');
  }
}
