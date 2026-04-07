import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import type { BillingAddress } from '@/lib/billingAddress';

type EnsurePlatformStripeCustomerParams = {
  stripe: Stripe;
  userId?: string | null;
  organizationId?: string | null;
  email?: string | null;
  billingAddress?: BillingAddress | null;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const toStripeAddress = (address: BillingAddress): Stripe.AddressParam => ({
  line1: address.line1,
  line2: address.line2 ?? undefined,
  city: address.city,
  state: address.state,
  postal_code: address.postalCode,
  country: address.countryCode,
});

export const ensurePlatformStripeCustomer = async ({
  stripe,
  userId,
  organizationId,
  email,
  billingAddress,
}: EnsurePlatformStripeCustomerParams): Promise<string> => {
  const normalizedEmail = normalizeEmail(email);
  const existing = await prisma.stripeAccounts.findFirst({
    where: organizationId ? { organizationId } : { userId: userId ?? undefined },
    orderBy: { updatedAt: 'desc' },
  });

  const customerData: Stripe.CustomerCreateParams | Stripe.CustomerUpdateParams = {
    email: normalizedEmail ?? undefined,
    metadata: {
      user_id: userId ?? '',
      organization_id: organizationId ?? '',
    },
    address: billingAddress ? toStripeAddress(billingAddress) : undefined,
  };

  let customerId = existing?.customerId ?? null;

  if (customerId) {
    try {
      await stripe.customers.update(customerId, customerData as Stripe.CustomerUpdateParams);
    } catch (error) {
      console.warn(`Failed to update Stripe customer ${customerId}; creating a replacement record.`, error);
      customerId = null;
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create(customerData as Stripe.CustomerCreateParams);
    customerId = customer.id;
  }

  if (existing?.id) {
    await prisma.stripeAccounts.update({
      where: { id: existing.id },
      data: {
        customerId,
        email: normalizedEmail ?? existing.email,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.stripeAccounts.create({
      data: {
        id: crypto.randomUUID(),
        customerId,
        accountId: null,
        userId: organizationId ? null : (userId ?? null),
        organizationId: organizationId ?? null,
        email: normalizedEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return customerId;
};
