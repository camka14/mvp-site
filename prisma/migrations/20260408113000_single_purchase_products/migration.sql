-- Add single-purchase store products and richer product tax categories.

ALTER TYPE "ProductsPeriodEnum" ADD VALUE IF NOT EXISTS 'SINGLE';
ALTER TYPE "ProductsTaxCategoryEnum" ADD VALUE IF NOT EXISTS 'DAY_PASS';
ALTER TYPE "ProductsTaxCategoryEnum" ADD VALUE IF NOT EXISTS 'EQUIPMENT_RENTAL';
