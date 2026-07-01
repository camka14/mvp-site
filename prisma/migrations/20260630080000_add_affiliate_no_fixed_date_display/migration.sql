ALTER TABLE "AffiliateImportCandidates"
  ADD COLUMN IF NOT EXISTS "dateDisplayMode" TEXT,
  ADD COLUMN IF NOT EXISTS "dateDisplayText" TEXT;

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "dateDisplayMode" TEXT DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "dateDisplayText" TEXT;

UPDATE "Events"
SET "dateDisplayMode" = 'SCHEDULED'
WHERE "dateDisplayMode" IS NULL;

CREATE INDEX IF NOT EXISTS "Events_dateDisplayMode_idx" ON "Events"("dateDisplayMode");
