import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import type { BillingAddress } from '@/lib/billingAddress';

const REUSABLE_PAYMENT_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseMetadataInt = (value: unknown): number | null => {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const transferDestinationFromPaymentIntent = (
  intent: Pick<Stripe.PaymentIntent, 'transfer_data'>,
): string | null => {
  const destination = intent.transfer_data?.destination;
  if (typeof destination === 'string') {
    return normalizeString(destination);
  }
  if (destination && typeof destination === 'object') {
    return normalizeString((destination as { id?: string | null }).id);
  }
  return null;
};

const transferDestinationFromSubscription = (
  subscription: Pick<Stripe.Subscription, 'transfer_data'>,
): string | null => {
  const destination = subscription.transfer_data?.destination;
  if (typeof destination === 'string') {
    return normalizeString(destination);
  }
  if (destination && typeof destination === 'object') {
    return normalizeString((destination as { id?: string | null }).id);
  }
  return null;
};

const metadataMatches = (
  metadata: Stripe.Metadata,
  key: string,
  expected: string | null | undefined,
): boolean => normalizeString(metadata[key]) === normalizeString(expected);

const paymentIntentTransferMatches = (
  intent: Pick<Stripe.PaymentIntent, 'transfer_data'>,
  transferData: Stripe.PaymentIntentCreateParams.TransferData | null,
): boolean => {
  const existingDestination = transferDestinationFromPaymentIntent(intent);
  const expectedDestination = normalizeString(transferData?.destination);
  if (existingDestination !== expectedDestination) {
    return false;
  }

  const expectedAmount = transferData?.amount ?? null;
  const existingAmount = intent.transfer_data?.amount ?? null;
  return existingAmount === expectedAmount;
};

const subscriptionTransferMatches = (
  subscription: Pick<Stripe.Subscription, 'transfer_data'>,
  connectedAccountId: string | null,
): boolean => transferDestinationFromSubscription(subscription) === normalizeString(connectedAccountId);

const latestInvoiceHasConfirmationSecret = (
  subscription: Stripe.Subscription,
): boolean => {
  if (!subscription.latest_invoice || typeof subscription.latest_invoice === 'string') {
    return false;
  }
  const clientSecret = subscription.latest_invoice.confirmation_secret?.client_secret;
  return typeof clientSecret === 'string' && clientSecret.includes('_secret_');
};

const matchesProductBasePrice = (
  subscription: Stripe.Subscription,
  stripePriceId: string,
): boolean => {
  const baseItem = subscription.items.data.find((item) => item.metadata?.line_type === 'product_base')
    ?? subscription.items.data[0]
    ?? null;
  return normalizeString(baseItem?.price?.id) === normalizeString(stripePriceId);
};

export const buildBillingAddressFingerprint = (
  address: BillingAddress | null | undefined,
): string | null => {
  if (!address) {
    return null;
  }

  const serialized = [
    normalizeString(address.line1)?.toLowerCase() ?? '',
    normalizeString(address.line2)?.toLowerCase() ?? '',
    normalizeString(address.city)?.toLowerCase() ?? '',
    normalizeString(address.state)?.toLowerCase() ?? '',
    normalizeString(address.postalCode)?.toLowerCase() ?? '',
    normalizeString(address.countryCode)?.toLowerCase() ?? '',
  ].join('|');

  if (!serialized.replace(/\|/g, '')) {
    return null;
  }

  return createHash('sha256').update(serialized).digest('hex').slice(0, 32);
};

export const getCheckoutTaxCalculationIdFromMetadata = (metadata: Stripe.Metadata): string | null =>
  normalizeString(metadata.tax_calculation_id ?? metadata.taxCalculationId);

export const getCheckoutTaxCategoryFromMetadata = (metadata: Stripe.Metadata): string | null =>
  normalizeString(metadata.tax_category ?? metadata.taxCategory);

export const findReusableIncompleteProductPaymentIntent = async ({
  stripe,
  customerId,
  productId,
  userId,
  organizationId,
  totalChargeCents,
  billingAddressFingerprint,
  transferData,
}: {
  stripe: Stripe;
  customerId: string;
  productId: string;
  userId: string;
  organizationId?: string | null;
  totalChargeCents: number;
  billingAddressFingerprint: string | null;
  transferData: Stripe.PaymentIntentCreateParams.TransferData | null;
}): Promise<Stripe.PaymentIntent | null> => {
  const intents = await stripe.paymentIntents.list({
    customer: customerId,
    limit: 20,
  });

  return intents.data.find((intent) => {
    if (!REUSABLE_PAYMENT_INTENT_STATUSES.has(intent.status)) {
      return false;
    }
    if (!intent.client_secret || intent.currency !== 'usd') {
      return false;
    }
    if (intent.amount !== totalChargeCents) {
      return false;
    }
    if (!metadataMatches(intent.metadata, 'purchase_type', 'product')) {
      return false;
    }
    if (!metadataMatches(intent.metadata, 'product_id', productId)) {
      return false;
    }
    if (!metadataMatches(intent.metadata, 'user_id', userId)) {
      return false;
    }
    if (!metadataMatches(intent.metadata, 'organization_id', organizationId)) {
      return false;
    }
    if (!metadataMatches(intent.metadata, 'billing_address_fingerprint', billingAddressFingerprint)) {
      return false;
    }
    if (parseMetadataInt(intent.metadata.total_charge_cents) !== totalChargeCents) {
      return false;
    }
    return paymentIntentTransferMatches(intent, transferData);
  }) ?? null;
};

export const findReusableIncompleteProductSubscriptionCheckout = async ({
  stripe,
  customerId,
  productId,
  userId,
  organizationId,
  totalChargeCents,
  stripePriceId,
  billingAddressFingerprint,
  connectedAccountId,
}: {
  stripe: Stripe;
  customerId: string;
  productId: string;
  userId: string;
  organizationId?: string | null;
  totalChargeCents: number;
  stripePriceId: string;
  billingAddressFingerprint: string | null;
  connectedAccountId: string | null;
}): Promise<Stripe.Subscription | null> => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
    expand: ['data.latest_invoice.confirmation_secret', 'data.items.data.price'],
  });

  return subscriptions.data.find((subscription) => {
    if (subscription.status !== 'incomplete') {
      return false;
    }
    if (!latestInvoiceHasConfirmationSecret(subscription)) {
      return false;
    }
    if (!metadataMatches(subscription.metadata, 'purchase_type', 'product_subscription')) {
      return false;
    }
    if (!metadataMatches(subscription.metadata, 'product_id', productId)) {
      return false;
    }
    if (!metadataMatches(subscription.metadata, 'user_id', userId)) {
      return false;
    }
    if (!metadataMatches(subscription.metadata, 'organization_id', organizationId)) {
      return false;
    }
    if (!metadataMatches(subscription.metadata, 'billing_address_fingerprint', billingAddressFingerprint)) {
      return false;
    }
    if (parseMetadataInt(subscription.metadata.total_charge_cents) !== totalChargeCents) {
      return false;
    }
    if (!matchesProductBasePrice(subscription, stripePriceId)) {
      return false;
    }
    return subscriptionTransferMatches(subscription, connectedAccountId);
  }) ?? null;
};
