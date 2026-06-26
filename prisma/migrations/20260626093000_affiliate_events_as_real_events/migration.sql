ALTER TABLE "AffiliateScrapeSources"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "AffiliateImportCandidates"
  ADD COLUMN IF NOT EXISTS "publishedEventId" TEXT;

ALTER TABLE "Events"
  ALTER COLUMN "hostId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "organizerName" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleText" TEXT,
  ADD COLUMN IF NOT EXISTS "priceText" TEXT,
  ADD COLUMN IF NOT EXISTS "statusText" TEXT;

CREATE INDEX IF NOT EXISTS "AffiliateScrapeSources_organizationId_idx"
  ON "AffiliateScrapeSources"("organizationId");

CREATE INDEX IF NOT EXISTS "AffiliateImportCandidates_publishedEventId_idx"
  ON "AffiliateImportCandidates"("publishedEventId");

CREATE INDEX IF NOT EXISTS "Events_sourceType_sourceId_idx"
  ON "Events"("sourceType", "sourceId");
