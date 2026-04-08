jest.mock('@/lib/stripeCustomer', () => ({
  ensurePlatformStripeCustomer: jest.fn(),
}));

import { resolveStripeTaxCode, resolveTaxCategoryForPurchase } from '@/lib/stripeTax';

describe('stripeTax', () => {
  it('uses hardcoded Stripe tax codes for supported product categories', () => {
    expect(resolveStripeTaxCode('ONE_TIME_PRODUCT')).toBe('txcd_99999999');
    expect(resolveStripeTaxCode('DAY_PASS')).toBe('txcd_20030000');
    expect(resolveStripeTaxCode('EQUIPMENT_RENTAL')).toBe('txcd_20030000');
    expect(resolveStripeTaxCode('SUBSCRIPTION')).toBe('txcd_20030000');
    expect(resolveStripeTaxCode('NON_TAXABLE')).toBe('txcd_00000000');
  });

  it('maps product purchases to the expected internal tax categories', () => {
    expect(resolveTaxCategoryForPurchase({
      purchaseType: 'product',
      productTaxCategory: 'DAY_PASS',
    })).toBe('DAY_PASS');
    expect(resolveTaxCategoryForPurchase({
      purchaseType: 'product',
      productTaxCategory: 'EQUIPMENT_RENTAL',
    })).toBe('EQUIPMENT_RENTAL');
    expect(resolveTaxCategoryForPurchase({
      purchaseType: 'product',
      productTaxCategory: 'SUBSCRIPTION',
    })).toBe('SUBSCRIPTION');
    expect(resolveTaxCategoryForPurchase({
      purchaseType: 'product',
      productTaxCategory: 'NON_TAXABLE',
    })).toBe('NON_TAXABLE');
    expect(resolveTaxCategoryForPurchase({
      purchaseType: 'product',
      productTaxCategory: 'ONE_TIME_PRODUCT',
    })).toBe('ONE_TIME_PRODUCT');
  });
});
