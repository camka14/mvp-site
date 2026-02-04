import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyList } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const DEFAULT_SPORTS = [
  { id: 'Volleyball', name: 'Volleyball' },
  { id: 'Basketball', name: 'Basketball' },
  { id: 'Soccer', name: 'Soccer' },
  { id: 'Tennis', name: 'Tennis' },
  { id: 'Pickleball', name: 'Pickleball' },
];

export async function GET(_req: NextRequest) {
  let sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });

  if (sports.length === 0) {
    await prisma.sports.createMany({
      data: DEFAULT_SPORTS,
      skipDuplicates: true,
    });
    sports = await prisma.sports.findMany({ orderBy: { name: 'asc' } });
  }

  return NextResponse.json({ sports: withLegacyList(sports) }, { status: 200 });
}
