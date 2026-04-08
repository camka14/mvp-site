import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { loadUserBillingProfile } from '@/lib/billingAddress';
import { ensurePlatformStripeCustomer } from '@/lib/stripeCustomer';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().optional(),
  userId: z.string().optional(),
  organizationId: z.string().optional(),
}).passthrough();

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const userId = parsed.data.userId ?? session.userId;
  const organizationId = parsed.data.organizationId ?? null;

  if (organizationId) {
    const org = await prisma.organizations.findUnique({ where: { id: organizationId } });
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    if (!(await canManageOrganization(session, org))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const existing = await prisma.stripeAccounts.findFirst({
    where: organizationId ? { organizationId } : { userId },
    orderBy: { updatedAt: 'desc' },
  });
  let email = normalizeEmail(parsed.data.email);
  let billingAddress = null;
  if (!organizationId) {
    const billingProfile = await loadUserBillingProfile(userId);
    email = email ?? billingProfile.email ?? null;
    billingAddress = billingProfile.billingAddress;
  }

  let customerId = existing?.customerId ?? null;
  if (secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      customerId = await ensurePlatformStripeCustomer({
        stripe,
        userId,
        organizationId,
        email,
        billingAddress,
      });
    } catch (error) {
      console.error('Failed to create or update Stripe customer', error);
    }
  }

  const record = await prisma.stripeAccounts.findFirst({
    where: organizationId ? { organizationId } : { userId },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({
    customerId: record?.customerId ?? customerId ?? null,
    userId: record?.userId ?? undefined,
    organizationId: record?.organizationId ?? undefined,
  }, { status: 200 });
}
