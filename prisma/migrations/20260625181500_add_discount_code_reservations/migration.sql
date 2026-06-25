CREATE TYPE "DiscountCodeReservationStatusEnum" AS ENUM ('ACTIVE', 'REDEEMED', 'RELEASED', 'EXPIRED');

CREATE TABLE "DiscountCodeReservations" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
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
  "status" "DiscountCodeReservationStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),

  CONSTRAINT "DiscountCodeReservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscountCodeReservations_paymentIntentId_key" ON "DiscountCodeReservations"("paymentIntentId");
CREATE INDEX "DiscountCodeReservations_discountId_idx" ON "DiscountCodeReservations"("discountId");
CREATE INDEX "DiscountCodeReservations_discountCodeId_status_expiresAt_idx" ON "DiscountCodeReservations"("discountCodeId", "status", "expiresAt");
CREATE INDEX "DiscountCodeReservations_purchaseType_purchaseTargetId_idx" ON "DiscountCodeReservations"("purchaseType", "purchaseTargetId");
CREATE INDEX "DiscountCodeReservations_userId_idx" ON "DiscountCodeReservations"("userId");
CREATE INDEX "DiscountCodeReservations_registrationId_idx" ON "DiscountCodeReservations"("registrationId");
