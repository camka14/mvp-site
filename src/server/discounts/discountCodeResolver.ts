import crypto from 'crypto';

import { prisma } from '@/lib/prisma';

export type DiscountPurchaseType = 'event' | 'product' | 'team_registration';

export type DiscountTargetType = 'EVENT' | 'PRODUCT' | 'TEAM_REGISTRATION';

export type ResolvedDiscountApplication = {
  code: string;
  discountId: string;
  discountCodeId: string;
  reservationId?: string | null;
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

const DISCOUNT_CODE_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;

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

const normalizeUsageLimit = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
};

const expireStaleReservations = async ({
  client,
  discountCodeId,
  now,
}: {
  client: PrismaLike;
  discountCodeId: string;
  now: Date;
}) => {
  if (!client.discountCodeReservations?.updateMany) {
    return;
  }

  await client.discountCodeReservations.updateMany({
    where: {
      discountCodeId,
      status: 'ACTIVE',
      expiresAt: { lte: now },
    },
    data: {
      status: 'EXPIRED',
      releasedAt: now,
    },
  });
};

const countActiveReservations = async ({
  client,
  discountCodeId,
  now,
}: {
  client: PrismaLike;
  discountCodeId: string;
  now: Date;
}): Promise<number> => {
  if (!client.discountCodeReservations?.count) {
    return 0;
  }

  return client.discountCodeReservations.count({
    where: {
      discountCodeId,
      status: 'ACTIVE',
      expiresAt: { gt: now },
    },
  });
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
    ? normalizeUsageLimit(discountCode.usageLimit)
    : null;
  const usedCount = normalizeCents(discountCode.usedCount);
  if (usageLimit !== null) {
    const now = new Date();
    await expireStaleReservations({ client, discountCodeId: discountCode.id, now });
    const activeReservations = await countActiveReservations({ client, discountCodeId: discountCode.id, now });
    if (usedCount + activeReservations >= usageLimit) {
      throw new DiscountCodeError('Discount code has reached its usage limit.', 409);
    }
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

export const reserveDiscountApplication = async ({
  code,
  purchaseType,
  targetId,
  originalAmountCents,
  buyerUserId,
  guestEmail,
  registrationId,
  productId,
  organizationId,
  expiresAt,
  client = prisma,
}: {
  code?: string | null;
  purchaseType: DiscountPurchaseType;
  targetId: string;
  originalAmountCents: number;
  buyerUserId?: string | null;
  guestEmail?: string | null;
  registrationId?: string | null;
  productId?: string | null;
  organizationId?: string | null;
  expiresAt?: Date | null;
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

  return client.$transaction(async (tx: PrismaLike) => {
    const initialDiscountCode = await tx.discountCodes.findUnique({
      where: { code: normalizedCode },
    });
    if (!initialDiscountCode) {
      throw new DiscountCodeError('Discount code was not found.', 404);
    }

    if (typeof tx.$queryRawUnsafe === 'function') {
      await tx.$queryRawUnsafe(
        'SELECT id FROM "DiscountCodes" WHERE id = $1 FOR UPDATE',
        initialDiscountCode.id,
      );
    }

    const discountCode = await tx.discountCodes.findUnique({
      where: { code: normalizedCode },
    });
    if (!discountCode) {
      throw new DiscountCodeError('Discount code was not found.', 404);
    }
    if (discountCode.status !== 'ACTIVE') {
      throw new DiscountCodeError('Discount code is no longer active.', 409);
    }

    const now = new Date();
    await expireStaleReservations({ client: tx, discountCodeId: discountCode.id, now });

    const usageLimit = normalizeUsageLimit(discountCode.usageLimit);
    if (usageLimit !== null) {
      const usedCount = normalizeCents(discountCode.usedCount);
      const activeReservations = await countActiveReservations({
        client: tx,
        discountCodeId: discountCode.id,
        now,
      });
      if (usedCount + activeReservations >= usageLimit) {
        throw new DiscountCodeError('Discount code has reached its usage limit.', 409);
      }
    }

    const discount = await tx.discounts.findUnique({
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
    const reservation = await tx.discountCodeReservations.create({
      data: {
        id: `discount_reservation_${crypto.randomUUID()}`,
        discountId: discount.id,
        discountCodeId: discountCode.id,
        code: normalizedCode,
        userId: normalizeId(buyerUserId),
        guestEmail: normalizeId(guestEmail),
        purchaseType: targetType,
        purchaseTargetId: normalizedTargetId,
        registrationId: normalizeId(registrationId),
        productId: normalizeId(productId),
        organizationId: normalizeId(organizationId),
        originalAmountCents: normalizedOriginalAmountCents,
        discountedAmountCents,
        expiresAt: expiresAt ?? new Date(now.getTime() + DISCOUNT_CODE_RESERVATION_TTL_MS),
      },
    });

    return {
      amountCents: discountedAmountCents,
      discount: {
        code: normalizedCode,
        discountId: discount.id,
        discountCodeId: discountCode.id,
        reservationId: reservation.id,
        originalAmountCents: normalizedOriginalAmountCents,
        discountedAmountCents,
      },
    };
  });
};

export const attachDiscountCodeReservationPaymentIntent = async ({
  reservationId,
  paymentIntentId,
  client = prisma,
}: {
  reservationId?: string | null;
  paymentIntentId?: string | null;
  client?: PrismaLike;
}): Promise<{ attached: boolean }> => {
  const normalizedReservationId = normalizeId(reservationId);
  const normalizedPaymentIntentId = normalizeId(paymentIntentId);
  if (!normalizedReservationId || !normalizedPaymentIntentId) {
    return { attached: false };
  }

  const result = await client.discountCodeReservations.updateMany({
    where: {
      id: normalizedReservationId,
      status: 'ACTIVE',
    },
    data: {
      paymentIntentId: normalizedPaymentIntentId,
    },
  });

  return { attached: result.count > 0 };
};

export const releaseDiscountCodeReservation = async ({
  reservationId,
  paymentIntentId,
  client = prisma,
}: {
  reservationId?: string | null;
  paymentIntentId?: string | null;
  client?: PrismaLike;
}): Promise<{ released: boolean }> => {
  const normalizedReservationId = normalizeId(reservationId);
  const normalizedPaymentIntentId = normalizeId(paymentIntentId);
  if (!normalizedReservationId && !normalizedPaymentIntentId) {
    return { released: false };
  }

  const result = await client.discountCodeReservations.updateMany({
    where: normalizedReservationId
      ? {
          id: normalizedReservationId,
          status: 'ACTIVE',
        }
      : {
          paymentIntentId: normalizedPaymentIntentId,
          status: 'ACTIVE',
        },
    data: {
      status: 'RELEASED',
      releasedAt: new Date(),
    },
  });

  return { released: result.count > 0 };
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
      if (discount.reservationId) {
        await tx.discountCodeReservations.updateMany({
          where: {
            id: discount.reservationId,
            status: { in: ['ACTIVE', 'EXPIRED'] },
          },
          data: {
            status: 'REDEEMED',
            paymentIntentId: normalizedPaymentIntentId,
            registrationId: normalizedRegistrationId,
            redeemedAt: new Date(),
          },
        });
      }
      return { recorded: false };
    }

    if (discount.reservationId) {
      const reservation = await tx.discountCodeReservations.findUnique({
        where: { id: discount.reservationId },
      });
      if (
        reservation
        && reservation.discountCodeId !== discount.discountCodeId
      ) {
        throw new DiscountCodeError('Discount reservation does not match this discount code.', 409);
      }
      if (reservation?.status === 'RELEASED') {
        throw new DiscountCodeError('Discount reservation has already been released.', 409);
      }
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

    if (discount.reservationId) {
      await tx.discountCodeReservations.updateMany({
        where: {
          id: discount.reservationId,
          status: { in: ['ACTIVE', 'EXPIRED', 'REDEEMED'] },
        },
        data: {
          status: 'REDEEMED',
          paymentIntentId: normalizedPaymentIntentId,
          registrationId: normalizedRegistrationId,
          redeemedAt: new Date(),
        },
      });
    }

    await tx.discountCodes.update({
      where: { id: discount.discountCodeId },
      data: { usedCount: { increment: 1 } },
    });

    return { recorded: true };
  });
};
