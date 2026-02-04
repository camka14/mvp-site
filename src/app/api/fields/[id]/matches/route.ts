import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = req.nextUrl.searchParams;
  const start = parseDateInput(search.get('start'));
  const end = parseDateInput(search.get('end'));

  const matches = await prisma.matches.findMany({
    where: {
      fieldId: id,
      ...(start ? { start: { gte: start } } : {}),
      ...(end ? { end: { lte: end } } : {}),
    },
    orderBy: { start: 'asc' },
  });

  return NextResponse.json({ matches: withLegacyList(matches) }, { status: 200 });
}
