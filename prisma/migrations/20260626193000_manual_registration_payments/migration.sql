ALTER TYPE "BillPaymentsStatusEnum" ADD VALUE IF NOT EXISTS 'PARTIAL';

CREATE TYPE "ManualPaymentProofStatusEnum" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

CREATE TYPE "RegistrationPaymentModeEnum" AS ENUM ('ONLINE', 'MANUAL');

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "registrationPaymentMode" "RegistrationPaymentModeEnum" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "manualPaymentLinks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "manualPaymentInstructions" TEXT;

ALTER TABLE "BillPayments"
  ADD COLUMN IF NOT EXISTS "paidAmountCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "BillPayments"
SET "paidAmountCents" = "amountCents"
WHERE "status" = 'PAID'
  AND COALESCE("paidAmountCents", 0) = 0;

CREATE TABLE IF NOT EXISTS "BillPaymentProofs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "billId" TEXT NOT NULL,
  "billPaymentId" TEXT NOT NULL,
  "eventId" TEXT,
  "organizationId" TEXT,
  "fileId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "status" "ManualPaymentProofStatusEnum" NOT NULL DEFAULT 'SUBMITTED',
  "amountAcceptedCents" INTEGER,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,

  CONSTRAINT "BillPaymentProofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillPaymentProofs_billId_idx" ON "BillPaymentProofs"("billId");
CREATE INDEX IF NOT EXISTS "BillPaymentProofs_billPaymentId_idx" ON "BillPaymentProofs"("billPaymentId");
CREATE INDEX IF NOT EXISTS "BillPaymentProofs_eventId_idx" ON "BillPaymentProofs"("eventId");
CREATE INDEX IF NOT EXISTS "BillPaymentProofs_uploadedByUserId_idx" ON "BillPaymentProofs"("uploadedByUserId");
CREATE INDEX IF NOT EXISTS "BillPaymentProofs_status_idx" ON "BillPaymentProofs"("status");
