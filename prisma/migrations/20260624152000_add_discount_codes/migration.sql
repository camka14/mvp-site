CREATE TYPE "DiscountsOwnerTypeEnum" AS ENUM ('USER', 'ORGANIZATION');

CREATE TYPE "DiscountsTargetTypeEnum" AS ENUM ('EVENT', 'PRODUCT', 'TEAM_REGISTRATION');

CREATE TYPE "DiscountsStatusEnum" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TYPE "DiscountCodesStatusEnum" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Discounts" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerType" "DiscountsOwnerTypeEnum" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "DiscountsStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "targetType" "DiscountsTargetTypeEnum" NOT NULL,
  "targetId" TEXT NOT NULL,
  "originalPriceCentsSnapshot" INTEGER NOT NULL,
  "discountedPriceCents" INTEGER NOT NULL,
  CONSTRAINT "Discounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscountCodes" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discountId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "DiscountCodesStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "usageLimit" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "DiscountCodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscountCodeRedemptions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discountId" TEXT NOT NULL,
  "discountCodeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT,
  "guestEmail" TEXT,
  "purchaseType" "DiscountsTargetTypeEnum" NOT NULL,
  "purchaseTargetId" TEXT NOT NULL,
  "paymentIntentId" TEXT,
  "registrationId" TEXT,
  "productId" TEXT,
  "organizationId" TEXT,
  "originalAmountCents" INTEGER NOT NULL,
  "discountedAmountCents" INTEGER NOT NULL,
  CONSTRAINT "DiscountCodeRedemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Discounts_ownerType_ownerId_idx" ON "Discounts"("ownerType", "ownerId");
CREATE INDEX "Discounts_targetType_targetId_idx" ON "Discounts"("targetType", "targetId");
CREATE INDEX "Discounts_status_idx" ON "Discounts"("status");
CREATE INDEX "Discounts_createdBy_idx" ON "Discounts"("createdBy");

CREATE UNIQUE INDEX "DiscountCodes_code_key" ON "DiscountCodes"("code");
CREATE INDEX "DiscountCodes_discountId_idx" ON "DiscountCodes"("discountId");
CREATE INDEX "DiscountCodes_status_idx" ON "DiscountCodes"("status");

CREATE INDEX "DiscountCodeRedemptions_discountId_idx" ON "DiscountCodeRedemptions"("discountId");
CREATE INDEX "DiscountCodeRedemptions_discountCodeId_idx" ON "DiscountCodeRedemptions"("discountCodeId");
CREATE INDEX "DiscountCodeRedemptions_userId_idx" ON "DiscountCodeRedemptions"("userId");
CREATE INDEX "DiscountCodeRedemptions_purchaseType_purchaseTargetId_idx" ON "DiscountCodeRedemptions"("purchaseType", "purchaseTargetId");
CREATE UNIQUE INDEX "DiscountCodeRedemptions_discountCodeId_paymentIntentId_key" ON "DiscountCodeRedemptions"("discountCodeId", "paymentIntentId");
CREATE UNIQUE INDEX "DiscountCodeRedemptions_discountCodeId_registrationId_key" ON "DiscountCodeRedemptions"("discountCodeId", "registrationId");
