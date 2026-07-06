import { formatBillAmount } from '@/types';

export type BillAmountDisplayFields = {
  totalAmountCents?: number | null;
  paidAmountCents?: number | null;
  originalAmountCents?: number | null;
  discountAmountCents?: number | null;
  discountedAmountCents?: number | null;
  discounts?: Array<{
    code?: string | null;
    name?: string | null;
  }> | null;
};

const normalizeAmountCents = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

export const getBillOriginalAmountCents = (bill: BillAmountDisplayFields): number => {
  const original = normalizeAmountCents(bill.originalAmountCents);
  return original > 0 ? original : normalizeAmountCents(bill.totalAmountCents);
};

export const getBillDiscountedAmountCents = (bill: BillAmountDisplayFields): number => {
  const discounted = normalizeAmountCents(bill.discountedAmountCents);
  return discounted > 0 ? discounted : normalizeAmountCents(bill.totalAmountCents);
};

export const getBillDiscountAmountCents = (bill: BillAmountDisplayFields): number => {
  const explicitDiscount = normalizeAmountCents(bill.discountAmountCents);
  if (explicitDiscount > 0) return explicitDiscount;
  return Math.max(0, getBillOriginalAmountCents(bill) - getBillDiscountedAmountCents(bill));
};

export const getBillPaidAmountCents = (bill: BillAmountDisplayFields): number => (
  normalizeAmountCents(bill.paidAmountCents)
);

export const getBillRemainingAmountCents = (bill: BillAmountDisplayFields): number => (
  Math.max(0, getBillDiscountedAmountCents(bill) - getBillPaidAmountCents(bill))
);

export const getBillDiscountLabel = (bill: BillAmountDisplayFields): string => {
  const discounts = Array.isArray(bill.discounts) ? bill.discounts : [];
  const primary = discounts.find((discount) => (
    typeof discount?.code === 'string' && discount.code.trim().length > 0
  )) ?? discounts.find((discount) => (
    typeof discount?.name === 'string' && discount.name.trim().length > 0
  ));
  const code = typeof primary?.code === 'string' ? primary.code.trim() : '';
  const name = typeof primary?.name === 'string' ? primary.name.trim() : '';
  if (code) return `Discount ${code}`;
  if (name) return `Discount ${name}`;
  return discounts.length > 1 ? 'Discounts' : 'Discount';
};

export const hasBillDiscount = (bill: BillAmountDisplayFields): boolean => (
  getBillDiscountAmountCents(bill) > 0
);

export const formatBillPaidProgress = (bill: BillAmountDisplayFields): string | null => {
  const discountedAmountCents = getBillDiscountedAmountCents(bill);
  if (discountedAmountCents <= 0) return null;
  const paidAmountCents = getBillPaidAmountCents(bill);
  const discountAmountCents = getBillDiscountAmountCents(bill);
  if (discountAmountCents > 0) {
    return [
      `Original ${formatBillAmount(getBillOriginalAmountCents(bill))}`,
      `${getBillDiscountLabel(bill)} -${formatBillAmount(discountAmountCents)}`,
      `Paid ${formatBillAmount(paidAmountCents)}`,
    ].join(' • ');
  }
  return `${formatBillAmount(paidAmountCents)} paid of ${formatBillAmount(discountedAmountCents)}`;
};

export const formatBillTotalBreakdown = (bill: BillAmountDisplayFields): string => {
  const discountAmountCents = getBillDiscountAmountCents(bill);
  if (discountAmountCents > 0) {
    return [
      `Original ${formatBillAmount(getBillOriginalAmountCents(bill))}`,
      `${getBillDiscountLabel(bill)} -${formatBillAmount(discountAmountCents)}`,
      `Due ${formatBillAmount(getBillDiscountedAmountCents(bill))}`,
    ].join(' • ');
  }
  return `Total ${formatBillAmount(getBillDiscountedAmountCents(bill))}`;
};

export const formatBillPaidInFull = (bill: BillAmountDisplayFields): string => {
  if (hasBillDiscount(bill)) {
    return `Paid in full (${formatBillPaidProgress(bill)})`;
  }
  return `Paid in full (${formatBillAmount(getBillDiscountedAmountCents(bill))})`;
};
