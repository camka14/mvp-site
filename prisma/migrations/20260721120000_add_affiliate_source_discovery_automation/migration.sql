CREATE TABLE "AffiliateSourceDiscoveryCampaigns" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "location" TEXT,
    "sportIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceTypeHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "autoCreateIntakes" BOOLEAN NOT NULL DEFAULT true,
    "searchIntervalMinutes" INTEGER NOT NULL DEFAULT 10080,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "maxQueriesPerRun" INTEGER NOT NULL DEFAULT 10,
    "maxResultsPerQuery" INTEGER NOT NULL DEFAULT 10,
    "queryCursor" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AffiliateSourceDiscoveryCampaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceDiscoveryRuns" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "generatedQueryCount" INTEGER NOT NULL DEFAULT 0,
    "returnedResultCount" INTEGER NOT NULL DEFAULT 0,
    "newResultCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "createdIntakeCount" INTEGER NOT NULL DEFAULT 0,
    "providerJobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "summary" JSONB,
    CONSTRAINT "AffiliateSourceDiscoveryRuns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceDiscoveryResults" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "latestRunId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "urlKey" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "latestQuery" TEXT NOT NULL,
    "latestRank" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "score" INTEGER NOT NULL DEFAULT 0,
    "sourceTypeHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sportHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasonDetails" JSONB,
    "matchingIntakeId" TEXT,
    "matchingSourceId" TEXT,
    "matchingOrganizationId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AffiliateSourceDiscoveryResults_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceDomainPolicies" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "termsUrl" TEXT,
    "robotsSummary" TEXT,
    "restrictionNotes" TEXT,
    "evidence" JSONB,
    CONSTRAINT "AffiliateSourceDomainPolicies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateSourceMappingJobs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "intakeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "branch" TEXT,
    "commit" TEXT,
    "resultSummary" JSONB,
    "errorMessage" TEXT,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AffiliateSourceMappingJobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateSourceDiscoveryCampaigns_name_key" ON "AffiliateSourceDiscoveryCampaigns"("name");
CREATE INDEX "AffiliateSourceDiscoveryCampaigns_status_nextRunAt_idx" ON "AffiliateSourceDiscoveryCampaigns"("status", "nextRunAt");
CREATE INDEX "AffiliateSourceDiscoveryCampaigns_createdByUserId_idx" ON "AffiliateSourceDiscoveryCampaigns"("createdByUserId");
CREATE INDEX "AffiliateSourceDiscoveryRuns_campaignId_createdAt_idx" ON "AffiliateSourceDiscoveryRuns"("campaignId", "createdAt");
CREATE INDEX "AffiliateSourceDiscoveryRuns_status_queuedAt_idx" ON "AffiliateSourceDiscoveryRuns"("status", "queuedAt");
CREATE INDEX "AffiliateSourceDiscoveryRuns_requestedByUserId_idx" ON "AffiliateSourceDiscoveryRuns"("requestedByUserId");
CREATE UNIQUE INDEX "AffiliateSourceDiscoveryResults_campaignId_urlKey_key" ON "AffiliateSourceDiscoveryResults"("campaignId", "urlKey");
CREATE INDEX "AffiliateSourceDiscoveryResults_campaignId_status_score_idx" ON "AffiliateSourceDiscoveryResults"("campaignId", "status", "score");
CREATE INDEX "AffiliateSourceDiscoveryResults_policyKey_status_idx" ON "AffiliateSourceDiscoveryResults"("policyKey", "status");
CREATE INDEX "AffiliateSourceDiscoveryResults_matchingIntakeId_idx" ON "AffiliateSourceDiscoveryResults"("matchingIntakeId");
CREATE INDEX "AffiliateSourceDiscoveryResults_matchingSourceId_idx" ON "AffiliateSourceDiscoveryResults"("matchingSourceId");
CREATE INDEX "AffiliateSourceDiscoveryResults_matchingOrganizationId_idx" ON "AffiliateSourceDiscoveryResults"("matchingOrganizationId");
CREATE UNIQUE INDEX "AffiliateSourceDomainPolicies_policyKey_key" ON "AffiliateSourceDomainPolicies"("policyKey");
CREATE INDEX "AffiliateSourceDomainPolicies_status_expiresAt_idx" ON "AffiliateSourceDomainPolicies"("status", "expiresAt");
CREATE INDEX "AffiliateSourceMappingJobs_status_createdAt_idx" ON "AffiliateSourceMappingJobs"("status", "createdAt");
CREATE INDEX "AffiliateSourceMappingJobs_intakeId_createdAt_idx" ON "AffiliateSourceMappingJobs"("intakeId", "createdAt");
CREATE INDEX "AffiliateSourceMappingJobs_leaseExpiresAt_idx" ON "AffiliateSourceMappingJobs"("leaseExpiresAt");
