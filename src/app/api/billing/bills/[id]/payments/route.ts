import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payments = await prisma.billPayments.findMany({
    where: { billId: id },
    orderBy: { sequence: 'asc' },
  });
  return NextResponse.json({ payments: withLegacyList(payments) }, { status: 200 });
}
