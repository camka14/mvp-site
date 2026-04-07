import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

const normalizeInterval = (value: string | null | undefined): 'WEEK' | 'MONTH' | 'YEAR' => {
  if (value === 'week') return 'WEEK';
  if (value === 'year') return 'YEAR';
  return 'MONTH';
};

const normalizeLocalStatus = (subscription: Stripe.Subscription): 'ACTIVE' | 'CANCELLED' => {
  if (
    subscription.cancel_at_period_end
    || subscription.status === 'canceled'
    || subscription.status === 'unpaid'
    || subscription.status === 'incomplete_expired'
  ) {
    return 'CANCELLED';
  }
  return 'ACTIVE';
};

const firstRecurringPrice = (subscription: Stripe.Subscription): Stripe.Price | null => {
  const [firstItem] = subscription.items.data;
  if (!firstItem?.price) {
    return null;
  }
  return firstItem.price;
};

const extractSubscriptionMetadata = (
  subscription: Stripe.Subscription,
  fallback?: {
    productId?: string | null;
    userId?: string | null;
    organizationId?: string | null;
  },
) => {
  const metadata = subscription.metadata ?? {};
  return {
    productId: metadata.product_id?.trim() || fallback?.productId?.trim() || '',
    userId: metadata.user_id?.trim() || fallback?.userId?.trim() || '',
    organizationId: metadata.organization_id?.trim() || fallback?.organizationId?.trim() || null,
  };
};

export const upsertStripeSubscriptionMirror = async ({
  subscription,
  fallback,
}: {
  subscription: Stripe.Subscription;
  fallback?: {
    productId?: string | null;
    userId?: string | null;
    organizationId?: string | null;
  };
}) => {
  const metadata = extractSubscriptionMetadata(subscription, fallback);
  if (!metadata.productId || !metadata.userId) {
    console.warn('Skipping subscription mirror sync because metadata is incomplete.', {
      stripeSubscriptionId: subscription.id,
      metadata,
    });
    return null;
  }

  const price = firstRecurringPrice(subscription);
  const priceCents = Math.max(0, Math.round(price?.unit_amount ?? 0));
  const period = normalizeInterval(price?.recurring?.interval ?? null);
  const startDate = new Date((subscription.start_date ?? subscription.created) * 1000);
  const status = normalizeLocalStatus(subscription);
  const now = new Date();

  const existing = await prisma.subscriptions.findFirst({
    where: {
      OR: [
        { stripeSubscriptionId: subscription.id },
        {
          productId: metadata.productId,
          userId: metadata.userId,
        },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });

  const data = {
    productId: metadata.productId,
    userId: metadata.userId,
    organizationId: metadata.organizationId,
    startDate,
    priceCents,
    period,
    status,
    stripeSubscriptionId: subscription.id,
    updatedAt: now,
  } as const;

  if (existing?.id) {
    return prisma.subscriptions.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.subscriptions.create({
    data: {
      id: crypto.randomUUID(),
      createdAt: now,
      ...data,
    },
  });
};

export const syncStripeSubscriptionMirrorById = async ({
  stripe,
  stripeSubscriptionId,
}: {
  stripe: Stripe;
  stripeSubscriptionId: string;
}) => {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price'],
  });
  return upsertStripeSubscriptionMirror({ subscription });
};
