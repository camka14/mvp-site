-- CreateTable
CREATE TABLE "EventTemplates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceEventId" TEXT,
    "ownerUserId" TEXT,
    "organizationId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "sportId" TEXT,
    "eventType" "EventsEventTypeEnum",
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "endOffsetMinutesFromEventStart" INTEGER,
    "location" TEXT NOT NULL,
    "address" TEXT,
    "affiliateUrl" TEXT,
    "winnerSetCount" INTEGER,
    "loserSetCount" INTEGER,
    "doubleElimination" BOOLEAN,
    "rating" DOUBLE PRECISION,
    "teamSizeLimit" INTEGER NOT NULL,
    "maxParticipants" INTEGER,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "assistantHostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noFixedEndDateTime" BOOLEAN NOT NULL DEFAULT true,
    "price" INTEGER NOT NULL,
    "registrationPaymentMode" "RegistrationPaymentModeEnum" NOT NULL DEFAULT 'ONLINE',
    "manualPaymentLinks" JSONB NOT NULL DEFAULT '[]',
    "manualPaymentInstructions" TEXT,
    "taxHandling" TEXT NOT NULL DEFAULT 'INHERIT_ORG',
    "organizerManualTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "singleDivision" BOOLEAN,
    "registrationByDivisionType" BOOLEAN,
    "cancellationRefundHours" INTEGER,
    "teamSignup" BOOLEAN,
    "prize" TEXT,
    "registrationCutoffHours" INTEGER,
    "seedColor" INTEGER,
    "imageId" TEXT,
    "winnerBracketPointsToVictory" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "loserBracketPointsToVictory" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "coordinates" JSONB,
    "gamesPerOpponent" INTEGER,
    "includePlayoffs" BOOLEAN,
    "playoffTeamCount" INTEGER,
    "usesSets" BOOLEAN,
    "matchDurationMinutes" INTEGER,
    "setDurationMinutes" INTEGER,
    "setsPerMatch" INTEGER,
    "restTimeMinutes" INTEGER,
    "pointsToVictory" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "officialSchedulingMode" "EventsOfficialSchedulingModeEnum" NOT NULL DEFAULT 'SCHEDULE',
    "doTeamsOfficiate" BOOLEAN,
    "teamOfficialsMaySwap" BOOLEAN,
    "officialPositions" JSONB,
    "matchRulesOverride" JSONB,
    "autoCreatePointMatchIncidents" BOOLEAN DEFAULT false,
    "allowPaymentPlans" BOOLEAN,
    "installmentCount" INTEGER,
    "installmentDueDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "installmentDueRelativeDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "installmentAmounts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "allowTeamSplitDefault" BOOLEAN,
    "splitLeaguePlayoffDivisions" BOOLEAN DEFAULT false,
    "requiredTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisionDetails" JSONB,
    "playoffDivisionDetails" JSONB,
    "divisionResourceIds" JSONB,
    "leagueScoringConfigId" TEXT,

    CONSTRAINT "EventTemplates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplateResources" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "templateId" TEXT NOT NULL,
    "sourceResourceId" TEXT,
    "name" TEXT,
    "resourceType" TEXT,
    "location" TEXT,
    "organizationId" TEXT,
    "facilityId" TEXT,
    "facilityName" TEXT,
    "lat" DOUBLE PRECISION,
    "long" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventTemplateResources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplateTimeSlots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "templateId" TEXT NOT NULL,
    "sourceTimeSlotId" TEXT,
    "dayOffsetFromEventStart" INTEGER NOT NULL DEFAULT 0,
    "startOffsetMinutesFromEventStart" INTEGER NOT NULL DEFAULT 0,
    "endOffsetMinutesFromEventStart" INTEGER NOT NULL DEFAULT 0,
    "startTimeMinutes" INTEGER,
    "endTimeMinutes" INTEGER,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateResourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rentalResourceHintIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hostRequiredTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventTemplateTimeSlots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplateRentalResourceHints" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "templateId" TEXT NOT NULL,
    "sourceResourceId" TEXT,
    "sourceOrganizationId" TEXT,
    "name" TEXT,
    "facilityName" TEXT,
    "location" TEXT,
    "resourceType" TEXT,
    "notes" TEXT,

    CONSTRAINT "EventTemplateRentalResourceHints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplateLeagueScoringConfigs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "eventTemplateId" TEXT NOT NULL,
    "pointsForWin" INTEGER,
    "pointsForDraw" INTEGER,
    "pointsForLoss" INTEGER,
    "pointsPerSetWin" DOUBLE PRECISION,
    "pointsPerSetLoss" DOUBLE PRECISION,
    "pointsPerGameWin" DOUBLE PRECISION,
    "pointsPerGameLoss" DOUBLE PRECISION,
    "pointsPerGoalScored" DOUBLE PRECISION,
    "pointsPerGoalConceded" DOUBLE PRECISION,

    CONSTRAINT "EventTemplateLeagueScoringConfigs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTemplates_ownerUserId_idx" ON "EventTemplates"("ownerUserId");

-- CreateIndex
CREATE INDEX "EventTemplates_organizationId_idx" ON "EventTemplates"("organizationId");

-- CreateIndex
CREATE INDEX "EventTemplates_sourceEventId_idx" ON "EventTemplates"("sourceEventId");

-- CreateIndex
CREATE INDEX "EventTemplates_sportId_idx" ON "EventTemplates"("sportId");

-- CreateIndex
CREATE INDEX "EventTemplates_archivedAt_idx" ON "EventTemplates"("archivedAt");

-- CreateIndex
CREATE INDEX "EventTemplateResources_templateId_idx" ON "EventTemplateResources"("templateId");

-- CreateIndex
CREATE INDEX "EventTemplateResources_sourceResourceId_idx" ON "EventTemplateResources"("sourceResourceId");

-- CreateIndex
CREATE INDEX "EventTemplateResources_organizationId_idx" ON "EventTemplateResources"("organizationId");

-- CreateIndex
CREATE INDEX "EventTemplateResources_facilityId_idx" ON "EventTemplateResources"("facilityId");

-- CreateIndex
CREATE INDEX "EventTemplateTimeSlots_templateId_idx" ON "EventTemplateTimeSlots"("templateId");

-- CreateIndex
CREATE INDEX "EventTemplateTimeSlots_sourceTimeSlotId_idx" ON "EventTemplateTimeSlots"("sourceTimeSlotId");

-- CreateIndex
CREATE INDEX "EventTemplateRentalResourceHints_templateId_idx" ON "EventTemplateRentalResourceHints"("templateId");

-- CreateIndex
CREATE INDEX "EventTemplateRentalResourceHints_sourceResourceId_idx" ON "EventTemplateRentalResourceHints"("sourceResourceId");

-- CreateIndex
CREATE INDEX "EventTemplateRentalResourceHints_sourceOrganizationId_idx" ON "EventTemplateRentalResourceHints"("sourceOrganizationId");

-- CreateIndex
CREATE INDEX "EventTemplateLeagueScoringConfigs_eventTemplateId_idx" ON "EventTemplateLeagueScoringConfigs"("eventTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTemplateLeagueScoringConfigs_eventTemplateId_key" ON "EventTemplateLeagueScoringConfigs"("eventTemplateId");
