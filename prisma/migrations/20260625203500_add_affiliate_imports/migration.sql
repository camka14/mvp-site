CREATE TABLE "AffiliateScrapeSources" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "baseUrl" TEXT,
  "listUrl" TEXT NOT NULL,
  "targetKind" TEXT NOT NULL DEFAULT 'EVENT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "activeMappingId" TEXT,
  "lastScrapeRunId" TEXT,
  "lastScrapedAt" TIMESTAMP(3),
  "notes" TEXT,
  "metadata" JSONB,

  CONSTRAINT "AffiliateScrapeSources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateScrapeMappings" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "mapping" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "notes" TEXT,
  "validatedAt" TIMESTAMP(3),

  CONSTRAINT "AffiliateScrapeMappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateScrapeRuns" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "mappingId" TEXT,
  "requestedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "fetchedUrl" TEXT,
  "finalUrl" TEXT,
  "httpStatus" INTEGER,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "logs" JSONB,
  "metadata" JSONB,

  CONSTRAINT "AffiliateScrapeRuns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateImportCandidates" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "mappingId" TEXT,
  "listingKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "organizerName" TEXT,
  "sportName" TEXT,
  "formatLabel" TEXT,
  "city" TEXT,
  "venueName" TEXT,
  "address" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "timeZone" TEXT,
  "scheduleText" TEXT,
  "skillLevel" TEXT,
  "ageGroup" TEXT,
  "divisionText" TEXT,
  "participantOptionsText" TEXT,
  "priceText" TEXT,
  "statusText" TEXT,
  "registrationDeadlineText" TEXT,
  "officialActionUrl" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "description" TEXT,
  "rawPayload" JSONB,
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publishedListingId" TEXT,

  CONSTRAINT "AffiliateImportCandidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateListings" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceId" TEXT NOT NULL,
  "candidateId" TEXT,
  "listingKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "title" TEXT NOT NULL,
  "organizerName" TEXT,
  "sportName" TEXT,
  "formatLabel" TEXT,
  "city" TEXT,
  "venueName" TEXT,
  "address" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "timeZone" TEXT,
  "scheduleText" TEXT,
  "skillLevel" TEXT,
  "ageGroup" TEXT,
  "divisionText" TEXT,
  "participantOptionsText" TEXT,
  "priceText" TEXT,
  "statusText" TEXT,
  "registrationDeadlineText" TEXT,
  "officialActionUrl" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "description" TEXT,
  "rawPayload" JSONB,
  "metadata" JSONB,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedByUserId" TEXT,
  "archivedAt" TIMESTAMP(3),

  CONSTRAINT "AffiliateListings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AffiliateScrapeSources_sourceKey_key" ON "AffiliateScrapeSources"("sourceKey");
CREATE INDEX "AffiliateScrapeSources_status_idx" ON "AffiliateScrapeSources"("status");
CREATE INDEX "AffiliateScrapeSources_targetKind_status_idx" ON "AffiliateScrapeSources"("targetKind", "status");

CREATE UNIQUE INDEX "AffiliateScrapeMappings_sourceId_version_key" ON "AffiliateScrapeMappings"("sourceId", "version");
CREATE INDEX "AffiliateScrapeMappings_sourceId_isActive_idx" ON "AffiliateScrapeMappings"("sourceId", "isActive");

CREATE INDEX "AffiliateScrapeRuns_sourceId_createdAt_idx" ON "AffiliateScrapeRuns"("sourceId", "createdAt");
CREATE INDEX "AffiliateScrapeRuns_mappingId_idx" ON "AffiliateScrapeRuns"("mappingId");
CREATE INDEX "AffiliateScrapeRuns_status_idx" ON "AffiliateScrapeRuns"("status");

CREATE UNIQUE INDEX "AffiliateImportCandidates_sourceId_dedupeKey_key" ON "AffiliateImportCandidates"("sourceId", "dedupeKey");
CREATE INDEX "AffiliateImportCandidates_runId_idx" ON "AffiliateImportCandidates"("runId");
CREATE INDEX "AffiliateImportCandidates_mappingId_idx" ON "AffiliateImportCandidates"("mappingId");
CREATE INDEX "AffiliateImportCandidates_listingKind_status_idx" ON "AffiliateImportCandidates"("listingKind", "status");
CREATE INDEX "AffiliateImportCandidates_status_idx" ON "AffiliateImportCandidates"("status");

CREATE INDEX "AffiliateListings_sourceId_status_idx" ON "AffiliateListings"("sourceId", "status");
CREATE INDEX "AffiliateListings_candidateId_idx" ON "AffiliateListings"("candidateId");
CREATE INDEX "AffiliateListings_listingKind_status_idx" ON "AffiliateListings"("listingKind", "status");
CREATE INDEX "AffiliateListings_startsAt_idx" ON "AffiliateListings"("startsAt");
