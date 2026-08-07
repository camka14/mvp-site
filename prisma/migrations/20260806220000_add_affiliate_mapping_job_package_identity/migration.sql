ALTER TABLE "AffiliateSourceMappingJobs"
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "mappingId" TEXT,
ADD COLUMN "legacyIdentityMigrationEligible" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AffiliateSourceMappingJobs"
SET "legacyIdentityMigrationEligible" = true
WHERE "status" IN ('QUEUED', 'CLAIMED', 'REVIEW_REQUIRED')
  AND "sourceId" IS NULL
  AND "mappingId" IS NULL;

CREATE INDEX "AffiliateSourceMappingJobs_sourceId_mappingId_createdAt_idx"
ON "AffiliateSourceMappingJobs"("sourceId", "mappingId", "createdAt");
