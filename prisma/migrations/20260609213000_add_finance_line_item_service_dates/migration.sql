ALTER TABLE "FinancialLineItems"
ADD COLUMN "serviceStartAt" TIMESTAMP(3),
ADD COLUMN "serviceEndAt" TIMESTAMP(3);

UPDATE "FinancialLineItems"
SET "serviceStartAt" = "occurredAt"
WHERE "serviceStartAt" IS NULL
  AND "occurredAt" IS NOT NULL;

CREATE INDEX "FinancialLineItems_serviceStartAt_idx" ON "FinancialLineItems"("serviceStartAt");
CREATE INDEX "FinancialLineItems_serviceEndAt_idx" ON "FinancialLineItems"("serviceEndAt");
