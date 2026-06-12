ALTER TYPE "AccountingSyncSourceTypeEnum" ADD VALUE IF NOT EXISTS 'FINANCE_JOURNAL_ENTRY';

ALTER TABLE "AccountingSyncRecords"
  ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "AccountingSyncRecords_provider_sourceType_sourceKey_key"
  ON "AccountingSyncRecords"("provider", "sourceType", "sourceKey");

CREATE INDEX "AccountingSyncRecords_sourceKey_idx"
  ON "AccountingSyncRecords"("sourceKey");
