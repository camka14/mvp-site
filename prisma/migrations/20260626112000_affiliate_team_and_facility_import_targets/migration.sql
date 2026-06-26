ALTER TABLE "AffiliateImportCandidates"
  ADD COLUMN IF NOT EXISTS "publishedTeamId" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedFacilityId" TEXT;

ALTER TABLE "Teams"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;

CREATE INDEX IF NOT EXISTS "AffiliateImportCandidates_publishedTeamId_idx"
  ON "AffiliateImportCandidates"("publishedTeamId");

CREATE INDEX IF NOT EXISTS "AffiliateImportCandidates_publishedFacilityId_idx"
  ON "AffiliateImportCandidates"("publishedFacilityId");

CREATE INDEX IF NOT EXISTS "Teams_sourceType_sourceId_idx"
  ON "Teams"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "Teams_organizationId_sourceType_idx"
  ON "Teams"("organizationId", "sourceType");
