import { prisma } from '@/lib/prisma';
import type { InternalTaxCategory, ProductTaxCategory } from '@/lib/stripeTax';
import { resolveTaxCategoryForPurchase } from '@/lib/stripeTax';
import { resolveTeamBillingContext } from '@/server/teams/teamOpenRegistration';

type ProductContext = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  period: string;
  organizationId: string;
  taxCategory: ProductTaxCategory;
  stripeProductId: string | null;
  stripePriceId: string | null;
};

type TeamRegistrationContext = {
  id: string;
  name: string;
  registrationPriceCents: number;
  organizationId: string | null;
  hostUserId: string | null;
};

export type ResolvedPurchaseContext = {
  amountCents: number;
  purchaseType: 'event' | 'rental' | 'product' | 'team_registration';
  eventType?: unknown;
  taxCategory: InternalTaxCategory;
  product: ProductContext | null;
  team: TeamRegistrationContext | null;
  organizationId: string | null;
  hostUserId?: string | null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const extractEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return normalizeString(value);
  }
  const row = value as Record<string, unknown>;
  return normalizeString(row.$id ?? row.id ?? row.teamId);
};

export const resolvePurchaseContext = async ({
  productId,
  event,
  timeSlot,
  teamRegistration,
  requestedTaxCategory,
}: {
  productId?: string | null;
  event?: Record<string, unknown> | null;
  timeSlot?: Record<string, unknown> | null;
  teamRegistration?: Record<string, unknown> | string | null;
  requestedTaxCategory?: InternalTaxCategory | null;
}): Promise<ResolvedPurchaseContext> => {
  if (productId) {
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        period: true,
        organizationId: true,
        taxCategory: true,
        stripeProductId: true,
        stripePriceId: true,
      },
    });
    if (!product) {
      throw new Error('Product not found.');
    }

    return {
      amountCents: product.priceCents,
      purchaseType: 'product',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'product',
        requestedTaxCategory,
        productTaxCategory: product.taxCategory as ProductTaxCategory,
      }),
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        period: product.period,
        organizationId: product.organizationId,
        taxCategory: product.taxCategory as ProductTaxCategory,
        stripeProductId: product.stripeProductId,
        stripePriceId: product.stripePriceId,
      },
      organizationId: product.organizationId,
      team: null,
    };
  }

  const teamRegistrationId = extractEntityId(teamRegistration);
  if (teamRegistrationId) {
    const team = await prisma.canonicalTeams.findUnique({
      where: { id: teamRegistrationId },
      select: {
        id: true,
        name: true,
        openRegistration: true,
        registrationPriceCents: true,
        organizationId: true,
        createdBy: true,
      },
    });
    if (!team) {
      throw new Error('Team not found.');
    }
    if (!team.openRegistration) {
      throw new Error('This team is not open for registration.');
    }
    const registrationPriceCents = Math.max(0, Math.round(team.registrationPriceCents ?? 0));
    if (registrationPriceCents <= 0) {
      throw new Error('This team does not require payment.');
    }
    const billingContext = await resolveTeamBillingContext(team.id);
    if (!billingContext.connectedAccountId) {
      throw new Error('This team cannot accept paid registration until Stripe is connected.');
    }

    return {
      amountCents: registrationPriceCents,
      purchaseType: 'team_registration',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'team_registration',
        requestedTaxCategory,
      }),
      eventType: undefined,
      product: null,
      team: {
        id: team.id,
        name: team.name,
        registrationPriceCents,
        organizationId: billingContext.organizationId ?? team.organizationId ?? null,
        hostUserId: billingContext.hostUserId ?? team.createdBy ?? null,
      },
      organizationId: billingContext.organizationId ?? team.organizationId ?? null,
      hostUserId: billingContext.hostUserId ?? team.createdBy ?? null,
    };
  }

  if (timeSlot && typeof timeSlot.price === 'number') {
    return {
      amountCents: timeSlot.price,
      purchaseType: 'rental',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'rental',
        requestedTaxCategory,
      }),
      eventType: event?.eventType,
      product: null,
      team: null,
      organizationId: typeof event?.organizationId === 'string' ? event.organizationId : null,
    };
  }

  if (event && typeof event.price === 'number') {
    return {
      amountCents: event.price,
      purchaseType: 'event',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'event',
        requestedTaxCategory,
      }),
      eventType: event.eventType,
      product: null,
      team: null,
      organizationId: typeof event.organizationId === 'string' ? event.organizationId : null,
    };
  }

  throw new Error('Unable to resolve a purchase amount from the request.');
};
