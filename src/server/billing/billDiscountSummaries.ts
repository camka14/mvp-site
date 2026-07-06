import type { BillDiscountSummary } from '@/types';

type DiscountSummaryClient = {
  discountCodeRedemptions?: {
    findMany: (args: any) => Promise<Array<{
      id: string;
      discountId: string;
      discountCodeId: string;
      code: string;
      paymentIntentId: string | null;
      registrationId: string | null;
      originalAmountCents: number;
      discountedAmountCents: number;
      createdAt?: Date | string | null;
    }>>;
  };
  discounts?: {
    findMany: (args: any) => Promise<Array<{
      id: string;
      name: string | null;
    }>>;
  };
};

export type BillDiscountLookupBill = {
  id: string;
  totalAmountCents?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  payments?: Array<{
    paymentIntentId?: string | null;
  }>;
};

export type BillDiscountAmounts = {
  discounts: BillDiscountSummary[];
  originalAmountCents: number;
  discountAmountCents: number;
  discountedAmountCents: number;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeAmountCents = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

const uniqueIds = (values: Array<string | null | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);

const toTimestamp = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getBillRegistrationId = (bill: BillDiscountLookupBill): string | null => {
  const sourceType = normalizeId(bill.sourceType)?.toUpperCase();
  if (sourceType !== 'EVENT_REGISTRATION' && sourceType !== 'TEAM_REGISTRATION') {
    return null;
  }
  return normalizeId(bill.sourceId);
};

export const getDefaultBillDiscountAmounts = (
  bill: Pick<BillDiscountLookupBill, 'totalAmountCents'>,
): BillDiscountAmounts => {
  const totalAmountCents = normalizeAmountCents(bill.totalAmountCents);
  return {
    discounts: [],
    originalAmountCents: totalAmountCents,
    discountAmountCents: 0,
    discountedAmountCents: totalAmountCents,
  };
};

export const loadBillDiscountSummaries = async (
  client: DiscountSummaryClient,
  bills: BillDiscountLookupBill[],
): Promise<Map<string, BillDiscountAmounts>> => {
  const defaultsByBillId = new Map<string, BillDiscountAmounts>();
  const billRows = bills.filter((bill) => {
    const id = normalizeId(bill.id);
    if (!id) return false;
    defaultsByBillId.set(id, getDefaultBillDiscountAmounts(bill));
    return true;
  });

  if (!billRows.length) {
    return defaultsByBillId;
  }

  const paymentIntentIds = uniqueIds(
    billRows.flatMap((bill) => (bill.payments ?? []).map((payment) => normalizeId(payment.paymentIntentId))),
  );
  const registrationIds = uniqueIds(billRows.map(getBillRegistrationId));
  const whereOr = [
    paymentIntentIds.length ? { paymentIntentId: { in: paymentIntentIds } } : null,
    registrationIds.length ? { registrationId: { in: registrationIds } } : null,
  ].filter(Boolean);

  if (!whereOr.length) {
    return defaultsByBillId;
  }
  if (typeof client.discountCodeRedemptions?.findMany !== 'function') {
    return defaultsByBillId;
  }

  const redemptions = await client.discountCodeRedemptions.findMany({
    where: { OR: whereOr },
    select: {
      id: true,
      discountId: true,
      discountCodeId: true,
      code: true,
      paymentIntentId: true,
      registrationId: true,
      originalAmountCents: true,
      discountedAmountCents: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!redemptions.length) {
    return defaultsByBillId;
  }

  const discountsById = new Map(
    (typeof client.discounts?.findMany === 'function' ? await client.discounts.findMany({
      where: { id: { in: uniqueIds(redemptions.map((redemption) => redemption.discountId)) } },
      select: { id: true, name: true },
    }) : []).map((discount) => [discount.id, discount]),
  );

  const paymentIntentRedemptions = new Map<string, typeof redemptions>();
  const registrationRedemptions = new Map<string, typeof redemptions>();
  redemptions.forEach((redemption) => {
    const paymentIntentId = normalizeId(redemption.paymentIntentId);
    if (paymentIntentId) {
      const existing = paymentIntentRedemptions.get(paymentIntentId) ?? [];
      existing.push(redemption);
      paymentIntentRedemptions.set(paymentIntentId, existing);
    }
    const registrationId = normalizeId(redemption.registrationId);
    if (registrationId) {
      const existing = registrationRedemptions.get(registrationId) ?? [];
      existing.push(redemption);
      registrationRedemptions.set(registrationId, existing);
    }
  });

  const amountsByBillId = new Map(defaultsByBillId);
  billRows.forEach((bill) => {
    const matchedById = new Map<string, (typeof redemptions)[number]>();
    (bill.payments ?? []).forEach((payment) => {
      const paymentIntentId = normalizeId(payment.paymentIntentId);
      if (!paymentIntentId) return;
      (paymentIntentRedemptions.get(paymentIntentId) ?? []).forEach((redemption) => {
        matchedById.set(redemption.id, redemption);
      });
    });

    const registrationId = getBillRegistrationId(bill);
    if (registrationId) {
      (registrationRedemptions.get(registrationId) ?? []).forEach((redemption) => {
        matchedById.set(redemption.id, redemption);
      });
    }

    const matchedRedemptions = Array.from(matchedById.values())
      .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
    if (!matchedRedemptions.length) {
      return;
    }

    const summaries = matchedRedemptions.map((redemption): BillDiscountSummary => {
      const originalAmountCents = normalizeAmountCents(redemption.originalAmountCents);
      const discountedAmountCents = normalizeAmountCents(redemption.discountedAmountCents);
      return {
        id: redemption.id,
        discountId: redemption.discountId,
        discountCodeId: redemption.discountCodeId,
        code: redemption.code,
        name: discountsById.get(redemption.discountId)?.name ?? null,
        originalAmountCents,
        discountedAmountCents,
        discountAmountCents: Math.max(0, originalAmountCents - discountedAmountCents),
        paymentIntentId: normalizeId(redemption.paymentIntentId),
        registrationId: normalizeId(redemption.registrationId),
      };
    });
    const primary = summaries.reduce((selected, candidate) => (
      candidate.originalAmountCents > selected.originalAmountCents ? candidate : selected
    ), summaries[0]);

    amountsByBillId.set(bill.id, {
      discounts: summaries,
      originalAmountCents: primary.originalAmountCents,
      discountAmountCents: primary.discountAmountCents,
      discountedAmountCents: primary.discountedAmountCents,
    });
  });

  return amountsByBillId;
};

export const withBillDiscountAmounts = <T extends BillDiscountLookupBill>(
  bill: T,
  amountsByBillId: Map<string, BillDiscountAmounts>,
): T & BillDiscountAmounts => ({
  ...bill,
  ...(amountsByBillId.get(bill.id) ?? getDefaultBillDiscountAmounts(bill)),
});
