-- Add bill line-item storage and track refunded amount per installment payment.
ALTER TABLE "Bills"
ADD COLUMN "lineItems" JSONB;

ALTER TABLE "BillPayments"
ADD COLUMN "refundedAmountCents" INTEGER NOT NULL DEFAULT 0;
