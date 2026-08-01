CREATE TABLE "AffiliateApprovalJobs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "reviewerId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "decision" JSONB,
  "errorMessage" TEXT,
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "AffiliateApprovalJobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateApprovalJobs_subjectType_subjectKey_key"
  ON "AffiliateApprovalJobs"("subjectType", "subjectKey");

CREATE INDEX "AffiliateApprovalJobs_status_createdAt_idx"
  ON "AffiliateApprovalJobs"("status", "createdAt");

CREATE INDEX "AffiliateApprovalJobs_leaseExpiresAt_idx"
  ON "AffiliateApprovalJobs"("leaseExpiresAt");

CREATE INDEX "AffiliateApprovalJobs_subjectType_status_idx"
  ON "AffiliateApprovalJobs"("subjectType", "status");
