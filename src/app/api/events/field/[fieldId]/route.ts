import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (legacy.playerIds === undefined && Array.isArray(legacy.userIds)) {
    (legacy as any).playerIds = legacy.userIds;
  }
  return legacy;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const search = req.nextUrl.searchParams;
  const start = parseDateInput(search.get('start'));
  const end = parseDateInput(search.get('end'));

  const events = await prisma.events.findMany({
    where: {
      fieldIds: { has: fieldId },
      NOT: { state: 'TEMPLATE' },
      ...(start ? { start: { gte: start } } : {}),
      ...(end ? { end: { lte: end } } : {}),
    },
    orderBy: { start: 'asc' },
  });

  const normalized = events.map((event) => withLegacyEvent(event));

  return NextResponse.json({ events: normalized }, { status: 200 });
}
