CREATE TYPE "ProductsTaxCategoryEnum" AS ENUM ('ONE_TIME_PRODUCT', 'SUBSCRIPTION', 'NON_TAXABLE');

ALTER TABLE "SensitiveUserData"
  ADD COLUMN "billingAddressLine1" TEXT,
  ADD COLUMN "billingAddressLine2" TEXT,
  ADD COLUMN "billingCity" TEXT,
  ADD COLUMN "billingState" TEXT,
  ADD COLUMN "billingPostalCode" TEXT,
  ADD COLUMN "billingCountryCode" TEXT;

ALTER TABLE "BillPayments"
  ADD COLUMN "taxCalculationId" TEXT,
  ADD COLUMN "taxTransactionId" TEXT,
  ADD COLUMN "taxAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeProcessingFeeCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeTaxServiceFeeCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Products"
  ADD COLUMN "taxCategory" "ProductsTaxCategoryEnum" NOT NULL DEFAULT 'ONE_TIME_PRODUCT';
