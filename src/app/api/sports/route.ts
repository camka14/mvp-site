import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json({ sports: withLegacyList(sports) }, { status: 200 });
}
