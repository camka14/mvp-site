jest.mock('@/lib/stripeTax', () => ({
  resolveStripeTaxCode: jest.fn(() => 'txcd_99999999'),
}));

import {
  defaultProductTaxCategoryForPeriod,
  isRecurringProductPeriod,
  normalizeProductPeriod,
} from '@/lib/stripeProducts';

describe('stripeProducts', () => {
  it('accepts lowercase and alias billing periods from the client', () => {
    expect(normalizeProductPeriod('single')).toBe('SINGLE');
    expect(normalizeProductPeriod('month')).toBe('MONTH');
    expect(normalizeProductPeriod('weekly')).toBe('WEEK');
    expect(normalizeProductPeriod('one-time')).toBe('SINGLE');
  });

  it('detects recurring periods after normalization and resolves default tax categories', () => {
    expect(isRecurringProductPeriod('month')).toBe(true);
    expect(isRecurringProductPeriod('year')).toBe(true);
    expect(isRecurringProductPeriod('single')).toBe(false);
    expect(defaultProductTaxCategoryForPeriod('month')).toBe('SUBSCRIPTION');
    expect(defaultProductTaxCategoryForPeriod('single')).toBe('ONE_TIME_PRODUCT');
  });
});
