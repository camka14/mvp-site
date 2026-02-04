import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  refreshUrl: z.string(),
  returnUrl: z.string(),
}).passthrough();

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const organizationId = parsed.data.organization?.$id ?? parsed.data.organization?.id ?? null;
  const accountRecord = await prisma.stripeAccounts.findFirst({
    where: organizationId ? { organizationId } : { userId: session.userId },
  });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !accountRecord?.accountId) {
    return NextResponse.json({ onboardingUrl: parsed.data.returnUrl }, { status: 200 });
  }

  const stripe = new Stripe(secretKey);
  try {
    const link = await stripe.accountLinks.create({
      account: accountRecord.accountId,
      refresh_url: parsed.data.refreshUrl,
      return_url: parsed.data.returnUrl,
      type: 'account_onboarding',
    });

    return NextResponse.json({ onboardingUrl: link.url, expiresAt: link.expires_at }, { status: 200 });
  } catch (error) {
    console.error('Stripe onboarding link failed', error);
    return NextResponse.json({ error: 'Stripe onboarding link failed' }, { status: 500 });
  }
}
