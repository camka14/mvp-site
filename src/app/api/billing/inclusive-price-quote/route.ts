import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  calculateIncludedFeesFromTotalPrice,
  calculateInclusivePriceFromHostAmount,
} from '@/lib/billingFees';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const INCLUSIVE_PRICE_QUOTE_VERSION = 1 as const;
const MAX_INCLUSIVE_PRICE_CENTS = 100_000_000;

const quoteSchema = z.object({
  direction: z.enum(['HOST_AMOUNT', 'TOTAL_PRICE']),
  amountCents: z.number().int().min(0).max(MAX_INCLUSIVE_PRICE_CENTS),
  eventType: z.string().trim().min(1).max(100).optional(),
}).strict();

export async function POST(request: NextRequest) {
  await requireSession(request);

  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid inclusive price quote payload.' },
      { status: 400 },
    );
  }

  const { direction, amountCents, eventType } = parsed.data;
  const breakdown = direction === 'HOST_AMOUNT'
    ? calculateInclusivePriceFromHostAmount({ hostAmountCents: amountCents, eventType })
    : calculateIncludedFeesFromTotalPrice({ totalPriceCents: amountCents, eventType });

  return NextResponse.json({
    version: INCLUSIVE_PRICE_QUOTE_VERSION,
    direction,
    breakdown,
  });
}
