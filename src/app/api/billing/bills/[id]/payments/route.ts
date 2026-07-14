import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
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
      where: { billId: id },
      orderBy: { sequence: 'asc' },
    });
    return NextResponse.json({ payments: payments }, { status: 200 });
  } catch (error) {
    return handleApiRouteError(error, 'Failed to load bill payments');
  }
}
