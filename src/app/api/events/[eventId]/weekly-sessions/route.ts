import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, _context: { params: Promise<{ eventId: string }> }) {
  return NextResponse.json(
    {
      error: 'Weekly child sessions are no longer created. Use slotId and occurrenceDate on the parent weekly event instead.',
    },
    { status: 410 },
  );
}
