import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';

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
    if (!canManageOrganization(session, org)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.stripeAccounts.findFirst({
    where: {
      ...(organizationId ? { organizationId } : { userId }),
    },
  });

  if (existing?.customerId) {
    return NextResponse.json({
      customerId: existing.customerId,
      userId: existing.userId ?? undefined,
      organizationId: existing.organizationId ?? undefined,
    }, { status: 200 });
  }

  let email = normalizeEmail(parsed.data.email);
  if (!email && !organizationId) {
    const sensitive = await prisma.sensitiveUserData.findFirst({ where: { userId } });
    email = normalizeEmail(sensitive?.email) ?? null;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  let customerId: string | null = existing?.customerId ?? null;

  if (secretKey && !customerId) {
    try {
      const stripe = new Stripe(secretKey);
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: {
          user_id: userId,
          organization_id: organizationId ?? '',
        },
      });
      customerId = customer.id;
    } catch (error) {
      console.error('Failed to create Stripe customer', error);
    }
  }

  const record = existing
    ? await prisma.stripeAccounts.update({
      where: { id: existing.id },
      data: {
        customerId,
        email: email ?? existing.email,
        updatedAt: new Date(),
      },
    })
    : await prisma.stripeAccounts.create({
      data: {
        id: crypto.randomUUID(),
        customerId,
        accountId: null,
        userId: organizationId ? null : userId,
        organizationId,
        email,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({
    customerId: record.customerId ?? null,
    userId: record.userId ?? undefined,
    organizationId: record.organizationId ?? undefined,
  }, { status: 200 });
}
