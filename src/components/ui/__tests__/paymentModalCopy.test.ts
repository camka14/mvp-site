import { getPaymentModalCopy } from '@/components/ui/paymentModalCopy';

describe('getPaymentModalCopy', () => {
  it('returns product-specific copy for product purchases', () => {
    expect(getPaymentModalCopy('product')).toEqual(expect.objectContaining({
      summaryTypeLabel: 'Product',
      reloadingMessage: 'Reloading product details…',
      refreshedMessage: 'Product details are up to date.',
    }));
  });

  it('returns rental-specific copy for rental purchases', () => {
    expect(getPaymentModalCopy('rental')).toEqual(expect.objectContaining({
      summaryTypeLabel: 'Rental',
      reloadingMessage: 'Reloading rental details…',
      refreshedMessage: 'Rental details are up to date.',
    }));
  });

  it('returns bill-specific copy for bill payments', () => {
    expect(getPaymentModalCopy('bill')).toEqual(expect.objectContaining({
      summaryTypeLabel: 'Bill Payment',
      reloadingMessage: 'Reloading billing details…',
      refreshedMessage: 'Billing details are up to date.',
    }));
  });

  it('preserves event copy for event purchases', () => {
    expect(getPaymentModalCopy('event')).toEqual(expect.objectContaining({
      summaryTypeLabel: 'Event',
      reloadingMessage: 'Reloading event…',
      refreshedMessage: 'Event details are up to date.',
    }));
  });
});
