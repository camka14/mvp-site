ALTER TABLE "RefundRequests"
  ADD COLUMN "paymentScope" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "RefundRequests"
  ALTER COLUMN "scopeVersion" SET DEFAULT 2;
