import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await prisma.leagueScoringConfigs.findUnique({ where: { id } });
  if (!config) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyFields(config), { status: 200 });
}
