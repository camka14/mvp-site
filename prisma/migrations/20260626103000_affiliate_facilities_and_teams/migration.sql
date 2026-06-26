ALTER TABLE "Facilities" ADD COLUMN IF NOT EXISTS "affiliateUrl" TEXT;

ALTER TABLE "EventTeams" ADD COLUMN IF NOT EXISTS "affiliateUrl" TEXT;

ALTER TABLE "Teams" ADD COLUMN IF NOT EXISTS "affiliateUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Facilities_affiliateUrl_idx" ON "Facilities"("affiliateUrl");

CREATE INDEX IF NOT EXISTS "Teams_affiliateUrl_idx" ON "Teams"("affiliateUrl");
