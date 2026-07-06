import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bill = await prisma.bills.findUnique({ where: { id } });
  if (!bill) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payments = await prisma.billPayments.findMany({
    where: { billId: bill.id },
    select: { paymentIntentId: true },
  });
  const discountAmountsByBillId = await loadBillDiscountSummaries(prisma, [{ ...bill, payments }]);
  return NextResponse.json({
    bill: withLegacyFields(withBillDiscountAmounts(bill, discountAmountsByBillId)),
  }, { status: 200 });
}
