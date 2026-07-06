import {
  formatBillPaidInFull,
  formatBillPaidInFullSummary,
  formatBillPaidProgress,
} from '@/lib/billDisplay';

const discountedPaidBill = {
  totalAmountCents: 9232,
  paidAmountCents: 5232,
  discountedAmountCents: 5232,
  discountAmountCents: 4000,
  discounts: [
    {
      id: 'discount_1',
      code: 'LOCAL40SHOT',
      name: 'Local promotion',
      amountCents: 4000,
    },
  ],
};

describe('billDisplay', () => {
  it('keeps paid status separate from the paid amount breakdown', () => {
    expect(formatBillPaidInFull(discountedPaidBill)).toBe('Paid in full');
    expect(formatBillPaidProgress(discountedPaidBill)).toBe(
      'Original $92.32 • Discount LOCAL40SHOT -$40.00 • Paid $52.32',
    );
    expect(formatBillPaidInFullSummary(discountedPaidBill)).toBe(
      'Paid in full • Original $92.32 • Discount LOCAL40SHOT -$40.00 • Paid $52.32',
    );
  });
});
