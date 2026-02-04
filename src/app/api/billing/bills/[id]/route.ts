import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bill = await prisma.bills.findUnique({ where: { id } });
  if (!bill) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 200 });
}
