import crypto from 'crypto';

import { prisma } from '@/lib/prisma';

export type DiscountPurchaseType = 'event' | 'product' | 'team_registration';

export type DiscountTargetType = 'EVENT' | 'PRODUCT' | 'TEAM_REGISTRATION';

export type ResolvedDiscountApplication = {
  code: string;
  discountId: string;
  discountCodeId: string;
  originalAmountCents: number;
  discountedAmountCents: number;
};

export type ResolveDiscountApplicationResult = {
  amountCents: number;
  discount: ResolvedDiscountApplication | null;
};

type PrismaLike = typeof prisma | any;

const PURCHASE_TYPE_TO_TARGET_TYPE: Record<DiscountPurchaseType, DiscountTargetType> = {
  event: 'EVENT',
  product: 'PRODUCT',
  team_registration: 'TEAM_REGISTRATION',
};

export class DiscountCodeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DiscountCodeError';
    this.status = status;
  }
}

export const normalizeDiscountCode = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
};

export const normalizeDiscountedPriceCents = ({
  originalAmountCents,
  discountedPriceCents,
}: {
  originalAmountCents: unknown;
  discountedPriceCents: unknown;
}): number => {
  const original = normalizeCents(originalAmountCents);
  const discounted = normalizeCents(discountedPriceCents);
  return Math.min(original, discounted);
};

export const resolveDiscountApplication = async ({
  code,
  purchaseType,
  targetId,
  originalAmountCents,
  client = prisma,
}: {
  code?: string | null;
  purchaseType: DiscountPurchaseType;
  targetId: string;
  originalAmountCents: number;
  buyerUserId?: string | null;
  client?: PrismaLike;
}): Promise<ResolveDiscountApplicationResult> => {
  const normalizedOriginalAmountCents = normalizeCents(originalAmountCents);
  const normalizedCode = normalizeDiscountCode(code);
  if (!normalizedCode) {
    return {
      amountCents: normalizedOriginalAmountCents,
      discount: null,
    };
  }

  const normalizedTargetId = normalizeId(targetId);
  if (!normalizedTargetId) {
    throw new DiscountCodeError('Discount code cannot be applied without a purchase target.');
  }

  const targetType = PURCHASE_TYPE_TO_TARGET_TYPE[purchaseType];
  if (!targetType) {
    throw new DiscountCodeError('Discount code cannot be applied to this purchase type.');
  }

  const discountCode = await client.discountCodes.findUnique({
    where: { code: normalizedCode },
  });
  if (!discountCode) {
    throw new DiscountCodeError('Discount code was not found.', 404);
  }
  if (discountCode.status !== 'ACTIVE') {
    throw new DiscountCodeError('Discount code is no longer active.', 409);
  }

  const usageLimit = typeof discountCode.usageLimit === 'number'
    ? Math.max(0, Math.floor(discountCode.usageLimit))
    : null;
  const usedCount = normalizeCents(discountCode.usedCount);
  if (usageLimit !== null && usedCount >= usageLimit) {
    throw new DiscountCodeError('Discount code has reached its usage limit.', 409);
  }

  const discount = await client.discounts.findUnique({
    where: { id: discountCode.discountId },
  });
  if (!discount) {
    throw new DiscountCodeError('Discount was not found.', 404);
  }
  if (discount.status !== 'ACTIVE') {
    throw new DiscountCodeError('Discount is no longer active.', 409);
  }
  if (discount.targetType !== targetType || discount.targetId !== normalizedTargetId) {
    throw new DiscountCodeError('Discount code does not apply to this item.', 409);
  }

  const discountedAmountCents = normalizeDiscountedPriceCents({
    originalAmountCents: normalizedOriginalAmountCents,
    discountedPriceCents: discount.discountedPriceCents,
  });

  return {
    amountCents: discountedAmountCents,
    discount: {
      code: normalizedCode,
      discountId: discount.id,
      discountCodeId: discountCode.id,
      originalAmountCents: normalizedOriginalAmountCents,
      discountedAmountCents,
    },
  };
};

export const recordDiscountCodeRedemption = async ({
  discount,
  purchaseType,
  targetId,
  userId,
  guestEmail,
  paymentIntentId,
  registrationId,
  productId,
  organizationId,
  client = prisma,
}: {
  discount: ResolvedDiscountApplication | null | undefined;
  purchaseType: DiscountPurchaseType;
  targetId: string;
  userId?: string | null;
  guestEmail?: string | null;
  paymentIntentId?: string | null;
  registrationId?: string | null;
  productId?: string | null;
  organizationId?: string | null;
  client?: PrismaLike;
}): Promise<{ recorded: boolean }> => {
  if (!discount) {
    return { recorded: false };
  }
  const purchaseTargetId = normalizeId(targetId);
  if (!purchaseTargetId) {
    throw new DiscountCodeError('Discount redemption cannot be recorded without a purchase target.');
  }

  const targetType = PURCHASE_TYPE_TO_TARGET_TYPE[purchaseType];
  const normalizedPaymentIntentId = normalizeId(paymentIntentId);
  const normalizedRegistrationId = normalizeId(registrationId);

  return client.$transaction(async (tx: PrismaLike) => {
    const existing = normalizedPaymentIntentId
      ? await tx.discountCodeRedemptions.findFirst({
        where: {
          discountCodeId: discount.discountCodeId,
          paymentIntentId: normalizedPaymentIntentId,
        },
      })
      : normalizedRegistrationId
        ? await tx.discountCodeRedemptions.findFirst({
          where: {
            discountCodeId: discount.discountCodeId,
            registrationId: normalizedRegistrationId,
          },
        })
        : null;

    if (existing) {
      return { recorded: false };
    }

    await tx.discountCodeRedemptions.create({
      data: {
        id: `discount_redemption_${crypto.randomUUID()}`,
        discountId: discount.discountId,
        discountCodeId: discount.discountCodeId,
        code: discount.code,
        userId: normalizeId(userId),
        guestEmail: normalizeId(guestEmail),
        purchaseType: targetType,
        purchaseTargetId,
        paymentIntentId: normalizedPaymentIntentId,
        registrationId: normalizedRegistrationId,
        productId: normalizeId(productId),
        organizationId: normalizeId(organizationId),
        originalAmountCents: discount.originalAmountCents,
        discountedAmountCents: discount.discountedAmountCents,
      },
    });

    await tx.discountCodes.update({
      where: { id: discount.discountCodeId },
      data: { usedCount: { increment: 1 } },
    });

    return { recorded: true };
  });
};
