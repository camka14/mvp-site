import type { Product, ProductPeriod, ProductType } from '@/types';

const RECURRING_PRODUCT_TYPES: ProductType[] = ['MEMBERSHIP', 'NON_TAXABLE_ITEM'];
const SINGLE_PURCHASE_PRODUCT_TYPES: ProductType[] = [
  'MERCHANDISE',
  'DAY_PASS',
  'EQUIPMENT_RENTAL',
  'NON_TAXABLE_ITEM',
];

export const isRecurringProductPeriod = (period: ProductPeriod | string | null | undefined): boolean => {
  const normalized = String(period ?? '').trim().toLowerCase();
  return normalized === 'week' || normalized === 'month' || normalized === 'year';
};

export const defaultProductTypeForPeriod = (
  period: ProductPeriod | string | null | undefined,
): ProductType => (
  isRecurringProductPeriod(period) ? 'MEMBERSHIP' : 'MERCHANDISE'
);

export const isProductTypeAllowedForPeriod = (
  productType: ProductType,
  period: ProductPeriod | string | null | undefined,
): boolean => {
  const allowed = isRecurringProductPeriod(period)
    ? RECURRING_PRODUCT_TYPES
    : SINGLE_PURCHASE_PRODUCT_TYPES;
  return allowed.includes(productType);
};

export const isStoredTaxCategoryAllowedForPeriod = (
  taxCategory: Product['taxCategory'] | null | undefined,
  period: ProductPeriod | string | null | undefined,
): boolean => {
  if (!taxCategory) return false;
  if (isRecurringProductPeriod(period)) {
    return taxCategory === 'SUBSCRIPTION' || taxCategory === 'NON_TAXABLE';
  }
  return (
    taxCategory === 'ONE_TIME_PRODUCT'
    || taxCategory === 'DAY_PASS'
    || taxCategory === 'EQUIPMENT_RENTAL'
    || taxCategory === 'NON_TAXABLE'
  );
};

export const getAllowedProductTypesForPeriod = (
  period: ProductPeriod | string | null | undefined,
): ProductType[] => (
  isRecurringProductPeriod(period) ? RECURRING_PRODUCT_TYPES : SINGLE_PURCHASE_PRODUCT_TYPES
);

export const getProductTypeOptionsForPeriod = (
  period: ProductPeriod | string | null | undefined,
): Array<{ label: string; value: ProductType }> => {
  const labels: Record<ProductType, string> = {
    MEMBERSHIP: 'Membership',
    MERCHANDISE: 'Merchandise',
    DAY_PASS: 'Day pass',
    EQUIPMENT_RENTAL: 'Equipment rental',
    NON_TAXABLE_ITEM: 'Non-taxable item',
  };
  return getAllowedProductTypesForPeriod(period).map((value) => ({
    label: labels[value],
    value,
  }));
};

export const deriveTaxCategoryFromProductType = (productType: ProductType): NonNullable<Product['taxCategory']> => {
  if (productType === 'MEMBERSHIP') return 'SUBSCRIPTION';
  if (productType === 'DAY_PASS') return 'DAY_PASS';
  if (productType === 'EQUIPMENT_RENTAL') return 'EQUIPMENT_RENTAL';
  if (productType === 'NON_TAXABLE_ITEM') return 'NON_TAXABLE';
  return 'ONE_TIME_PRODUCT';
};

export const deriveProductTypeFromTaxCategory = (
  taxCategory: Product['taxCategory'] | null | undefined,
  period: ProductPeriod | string | null | undefined,
): ProductType => {
  if (taxCategory === 'DAY_PASS') return 'DAY_PASS';
  if (taxCategory === 'EQUIPMENT_RENTAL') return 'EQUIPMENT_RENTAL';
  if (taxCategory === 'NON_TAXABLE') return 'NON_TAXABLE_ITEM';
  if (taxCategory === 'SUBSCRIPTION') return 'MEMBERSHIP';
  if (taxCategory === 'ONE_TIME_PRODUCT') {
    return isRecurringProductPeriod(period) ? 'MEMBERSHIP' : 'MERCHANDISE';
  }
  return defaultProductTypeForPeriod(String(period ?? '').trim().toLowerCase() || 'month');
};
