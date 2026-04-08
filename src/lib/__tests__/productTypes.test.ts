import {
  defaultProductTypeForPeriod,
  deriveProductTypeFromTaxCategory,
  deriveTaxCategoryFromProductType,
  getProductTypeOptionsForPeriod,
  isProductTypeAllowedForPeriod,
} from '@/lib/productTypes';

describe('productTypes', () => {
  it('defaults product types based on billing period', () => {
    expect(defaultProductTypeForPeriod('month')).toBe('MEMBERSHIP');
    expect(defaultProductTypeForPeriod('single')).toBe('MERCHANDISE');
  });

  it('derives stored tax categories from user-facing product types', () => {
    expect(deriveTaxCategoryFromProductType('MEMBERSHIP')).toBe('SUBSCRIPTION');
    expect(deriveTaxCategoryFromProductType('MERCHANDISE')).toBe('ONE_TIME_PRODUCT');
    expect(deriveTaxCategoryFromProductType('DAY_PASS')).toBe('DAY_PASS');
    expect(deriveTaxCategoryFromProductType('EQUIPMENT_RENTAL')).toBe('EQUIPMENT_RENTAL');
    expect(deriveTaxCategoryFromProductType('NON_TAXABLE_ITEM')).toBe('NON_TAXABLE');
  });

  it('derives editor product types from stored tax categories', () => {
    expect(deriveProductTypeFromTaxCategory('SUBSCRIPTION', 'month')).toBe('MEMBERSHIP');
    expect(deriveProductTypeFromTaxCategory('ONE_TIME_PRODUCT', 'single')).toBe('MERCHANDISE');
    expect(deriveProductTypeFromTaxCategory('DAY_PASS', 'single')).toBe('DAY_PASS');
    expect(deriveProductTypeFromTaxCategory('EQUIPMENT_RENTAL', 'single')).toBe('EQUIPMENT_RENTAL');
    expect(deriveProductTypeFromTaxCategory('NON_TAXABLE', 'single')).toBe('NON_TAXABLE_ITEM');
  });

  it('restricts product types by billing period', () => {
    expect(isProductTypeAllowedForPeriod('MEMBERSHIP', 'month')).toBe(true);
    expect(isProductTypeAllowedForPeriod('MERCHANDISE', 'month')).toBe(false);
    expect(isProductTypeAllowedForPeriod('DAY_PASS', 'single')).toBe(true);
    expect(isProductTypeAllowedForPeriod('MEMBERSHIP', 'single')).toBe(false);
  });

  it('returns period-specific options for the admin form', () => {
    expect(getProductTypeOptionsForPeriod('month').map((option) => option.value)).toEqual([
      'MEMBERSHIP',
      'NON_TAXABLE_ITEM',
    ]);
    expect(getProductTypeOptionsForPeriod('single').map((option) => option.value)).toEqual([
      'MERCHANDISE',
      'DAY_PASS',
      'EQUIPMENT_RENTAL',
      'NON_TAXABLE_ITEM',
    ]);
  });
});
