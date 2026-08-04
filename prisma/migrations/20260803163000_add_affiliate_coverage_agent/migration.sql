ALTER TABLE "AffiliateSourceDiscoveryCampaigns"
  ADD COLUMN "coverageFingerprint" TEXT;

CREATE UNIQUE INDEX "AffiliateSourceDiscoveryCampaigns_coverageFingerprint_key"
  ON "AffiliateSourceDiscoveryCampaigns"("coverageFingerprint");

CREATE TABLE "AffiliateCoverageAgentJobs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "workerId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "context" JSONB,
  "result" JSONB,
  "errorMessage" TEXT,
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "AffiliateCoverageAgentJobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateCoverageAgentJobs_subjectType_subjectKey_key"
  ON "AffiliateCoverageAgentJobs"("subjectType", "subjectKey");

CREATE INDEX "AffiliateCoverageAgentJobs_status_createdAt_idx"
  ON "AffiliateCoverageAgentJobs"("status", "createdAt");

CREATE INDEX "AffiliateCoverageAgentJobs_subjectType_status_idx"
  ON "AffiliateCoverageAgentJobs"("subjectType", "status");

CREATE INDEX "AffiliateCoverageAgentJobs_leaseExpiresAt_idx"
  ON "AffiliateCoverageAgentJobs"("leaseExpiresAt");
