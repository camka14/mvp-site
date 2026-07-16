CREATE TABLE "AffiliateSourceIntakes" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "region" TEXT,
  "baseUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "complianceStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  "targetKindHints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "suggestedClassification" JSONB,
  "organizationId" TEXT,
  "affiliateSourceId" TEXT,
  "selectedLogoArtifactId" TEXT,
  "lastRunId" TEXT,
  "createdByUserId" TEXT,
  "complianceReviewedByUserId" TEXT,
  "complianceReviewedAt" TIMESTAMP(3),
  "complianceTermsUrl" TEXT,
  "complianceNotes" TEXT,

  CONSTRAINT "AffiliateSourceIntakes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceIntakePages" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "intakeId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "urlKey" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'LISTING',
  "targetKindHints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "discoverySource" TEXT NOT NULL DEFAULT 'MANUAL',
  "robotsStatus" TEXT NOT NULL DEFAULT 'UNCHECKED',
  "robotsCheckedAt" TIMESTAMP(3),
  "robotsNotes" TEXT,
  "metadata" JSONB,

  CONSTRAINT "AffiliateSourceIntakePages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceIntakeRuns" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "intakeId" TEXT NOT NULL,
  "requestedPageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestedByUserId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'FIRECRAWL',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "workerId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerJobIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "discoveredUrlCount" INTEGER NOT NULL DEFAULT 0,
  "capturedPageCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "summary" JSONB,

  CONSTRAINT "AffiliateSourceIntakeRuns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceIntakeArtifacts" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "intakeId" TEXT NOT NULL,
  "pageId" TEXT,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "finalUrl" TEXT,
  "provider" TEXT,
  "httpStatus" INTEGER,
  "contentHash" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "retainUntil" TIMESTAMP(3),
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,

  CONSTRAINT "AffiliateSourceIntakeArtifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateSourceIntakes_sourceKey_key" ON "AffiliateSourceIntakes"("sourceKey");
CREATE INDEX "AffiliateSourceIntakes_status_idx" ON "AffiliateSourceIntakes"("status");
CREATE INDEX "AffiliateSourceIntakes_complianceStatus_idx" ON "AffiliateSourceIntakes"("complianceStatus");
CREATE INDEX "AffiliateSourceIntakes_region_status_idx" ON "AffiliateSourceIntakes"("region", "status");
CREATE INDEX "AffiliateSourceIntakes_organizationId_idx" ON "AffiliateSourceIntakes"("organizationId");
CREATE INDEX "AffiliateSourceIntakes_affiliateSourceId_idx" ON "AffiliateSourceIntakes"("affiliateSourceId");

CREATE UNIQUE INDEX "AffiliateSourceIntakePages_urlKey_key" ON "AffiliateSourceIntakePages"("urlKey");
CREATE INDEX "AffiliateSourceIntakePages_intakeId_status_idx" ON "AffiliateSourceIntakePages"("intakeId", "status");
CREATE INDEX "AffiliateSourceIntakePages_intakeId_role_idx" ON "AffiliateSourceIntakePages"("intakeId", "role");
CREATE INDEX "AffiliateSourceIntakePages_robotsStatus_idx" ON "AffiliateSourceIntakePages"("robotsStatus");

CREATE INDEX "AffiliateSourceIntakeRuns_intakeId_createdAt_idx" ON "AffiliateSourceIntakeRuns"("intakeId", "createdAt");
CREATE INDEX "AffiliateSourceIntakeRuns_status_queuedAt_idx" ON "AffiliateSourceIntakeRuns"("status", "queuedAt");
CREATE INDEX "AffiliateSourceIntakeRuns_requestedByUserId_idx" ON "AffiliateSourceIntakeRuns"("requestedByUserId");

CREATE UNIQUE INDEX "AffiliateSourceIntakeArtifacts_dedupeKey_key" ON "AffiliateSourceIntakeArtifacts"("dedupeKey");
CREATE INDEX "AffiliateSourceIntakeArtifacts_intakeId_createdAt_idx" ON "AffiliateSourceIntakeArtifacts"("intakeId", "createdAt");
CREATE INDEX "AffiliateSourceIntakeArtifacts_runId_kind_idx" ON "AffiliateSourceIntakeArtifacts"("runId", "kind");
CREATE INDEX "AffiliateSourceIntakeArtifacts_pageId_kind_idx" ON "AffiliateSourceIntakeArtifacts"("pageId", "kind");
CREATE INDEX "AffiliateSourceIntakeArtifacts_intake_kind_hash_idx" ON "AffiliateSourceIntakeArtifacts"("intakeId", "kind", "contentHash");
CREATE INDEX "AffiliateSourceIntakeArtifacts_fileId_idx" ON "AffiliateSourceIntakeArtifacts"("fileId");
CREATE INDEX "AffiliateSourceIntakeArtifacts_retainUntil_pinned_idx" ON "AffiliateSourceIntakeArtifacts"("retainUntil", "isPinned");
