ALTER TABLE "RefundRequests"
  ADD COLUMN "requestedByUserId" TEXT,
  ADD COLUMN "slotId" TEXT,
  ADD COLUMN "occurrenceDate" TEXT,
  ADD COLUMN "billIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "paymentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requestedAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN "policyDecision" TEXT,
  ADD COLUMN "scopeVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "scopeHash" TEXT;

CREATE INDEX "RefundRequests_eventId_userId_slotId_occurrenceDate_idx"
  ON "RefundRequests"("eventId", "userId", "slotId", "occurrenceDate");

CREATE INDEX "RefundRequests_scopeHash_idx" ON "RefundRequests"("scopeHash");
