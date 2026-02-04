import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  organizationEmail: z.string().optional(),
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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  const organizationId = parsed.data.organization?.$id ?? parsed.data.organization?.id ?? null;
  const targetEmail = parsed.data.organizationEmail ?? parsed.data.user?.email ?? undefined;

  if (!secretKey) {
    if (organizationId) {
      await prisma.organizations.update({
        where: { id: organizationId },
        data: { hasStripeAccount: true, updatedAt: new Date() },
      });
      await prisma.stripeAccounts.upsert({
        where: { id: `org_${organizationId}` },
        create: {
          id: `org_${organizationId}`,
          organizationId,
          accountId: `acct_mock_${organizationId}`,
          email: targetEmail ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          accountId: `acct_mock_${organizationId}`,
          email: targetEmail ?? null,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.userData.update({
        where: { id: session.userId },
        data: { hasStripeAccount: true, updatedAt: new Date() },
      });
      await prisma.stripeAccounts.upsert({
        where: { id: `user_${session.userId}` },
        create: {
          id: `user_${session.userId}`,
          userId: session.userId,
          accountId: `acct_mock_${session.userId}`,
          email: targetEmail ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          accountId: `acct_mock_${session.userId}`,
          email: targetEmail ?? null,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ onboardingUrl: parsed.data.returnUrl, publishableKey }, { status: 200 });
  }

  const stripe = new Stripe(secretKey);
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      email: targetEmail,
    });

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: parsed.data.refreshUrl,
      return_url: parsed.data.returnUrl,
      type: 'account_onboarding',
    });

    if (organizationId) {
      await prisma.organizations.update({
        where: { id: organizationId },
        data: { hasStripeAccount: true, updatedAt: new Date() },
      });
      await prisma.stripeAccounts.upsert({
        where: { id: `org_${organizationId}` },
        create: {
          id: `org_${organizationId}`,
          organizationId,
          accountId: account.id,
          email: targetEmail ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          accountId: account.id,
          email: targetEmail ?? null,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.userData.update({
        where: { id: session.userId },
        data: { hasStripeAccount: true, updatedAt: new Date() },
      });
      await prisma.stripeAccounts.upsert({
        where: { id: `user_${session.userId}` },
        create: {
          id: `user_${session.userId}`,
          userId: session.userId,
          accountId: account.id,
          email: targetEmail ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          accountId: account.id,
          email: targetEmail ?? null,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ onboardingUrl: link.url, expiresAt: link.expires_at }, { status: 200 });
  } catch (error) {
    console.error('Stripe onboarding failed', error);
    return NextResponse.json({ error: 'Stripe onboarding failed' }, { status: 500 });
  }
}
