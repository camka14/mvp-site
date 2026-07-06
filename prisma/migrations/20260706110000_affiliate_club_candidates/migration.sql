ALTER TABLE "AffiliateImportCandidates"
  ADD COLUMN "publishedOrganizationId" TEXT;

CREATE INDEX IF NOT EXISTS "AffiliateImportCandidates_publishedOrganizationId_idx"
  ON "AffiliateImportCandidates"("publishedOrganizationId");
