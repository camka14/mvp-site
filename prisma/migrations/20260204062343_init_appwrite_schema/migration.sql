-- CreateEnum
CREATE TYPE "BillsOwnerTypeEnum" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "BillsStatusEnum" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillPaymentsStatusEnum" AS ENUM ('PENDING', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "RefundRequestsStatusEnum" AS ENUM ('WAITING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventsStateEnum" AS ENUM ('PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "EventsEventTypeEnum" AS ENUM ('TOURNAMENT', 'EVENT', 'LEAGUE');

-- CreateEnum
CREATE TYPE "EventsFieldTypeEnum" AS ENUM ('INDOOR', 'GRASS', 'SAND');

-- CreateEnum
CREATE TYPE "ProductsPeriodEnum" AS ENUM ('WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionsPeriodEnum" AS ENUM ('WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionsStatusEnum" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateDocumentsTypeEnum" AS ENUM ('PDF', 'TEXT');

-- CreateEnum
CREATE TYPE "ParentChildLinksStatusEnum" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EventRegistrationsRegistrantTypeEnum" AS ENUM ('SELF', 'CHILD', 'TEAM');

-- CreateEnum
CREATE TYPE "EventRegistrationsStatusEnum" AS ENUM ('PENDINGCONSENT', 'ACTIVE', 'BLOCKED', 'CANCELLED', 'CONSENTFAILED');

-- CreateTable
CREATE TABLE "Fields" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "fieldNumber" INTEGER NOT NULL,
    "divisions" TEXT[],
    "lat" DOUBLE PRECISION,
    "long" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "inUse" BOOLEAN,
    "name" TEXT,
    "type" TEXT,
    "rentalSlotIds" TEXT[],
    "location" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "Fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matches" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "division" TEXT,
    "team1Points" INTEGER[],
    "team2Points" INTEGER[],
    "setResults" INTEGER[],
    "side" TEXT,
    "matchId" INTEGER NOT NULL,
    "losersBracket" BOOLEAN,
    "winnerNextMatchId" TEXT,
    "loserNextMatchId" TEXT,
    "previousRightId" TEXT,
    "previousLeftId" TEXT,
    "refereeCheckedIn" BOOLEAN,
    "refereeId" TEXT,
    "team1Id" TEXT,
    "team2Id" TEXT,
    "eventId" TEXT,
    "fieldId" TEXT,
    "teamRefereeId" TEXT,

    CONSTRAINT "Matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Divisions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,

    CONSTRAINT "Divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserData" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "dobVerified" BOOLEAN,
    "dobVerifiedAt" TIMESTAMP(3),
    "ageVerificationProvider" TEXT,
    "teamIds" TEXT[],
    "friendIds" TEXT[],
    "userName" TEXT NOT NULL,
    "hasStripeAccount" BOOLEAN,
    "followingIds" TEXT[],
    "friendRequestIds" TEXT[],
    "friendRequestSentIds" TEXT[],
    "uploadedImages" TEXT[],
    "profileImageId" TEXT,

    CONSTRAINT "UserData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveUserData" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "SensitiveUserData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invites" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT,
    "eventId" TEXT,
    "organizationId" TEXT,
    "teamId" TEXT,
    "userId" TEXT,
    "createdBy" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,

    CONSTRAINT "Invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolleyBallTeams" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "seed" INTEGER NOT NULL,
    "playerIds" TEXT[],
    "division" TEXT,
    "wins" INTEGER,
    "losses" INTEGER,
    "name" TEXT,
    "captainId" TEXT NOT NULL,
    "pending" TEXT[],
    "teamSize" INTEGER NOT NULL,
    "profileImageId" TEXT,
    "sport" TEXT,

    CONSTRAINT "VolleyBallTeams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "body" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attachmentUrls" TEXT[],
    "chatId" TEXT NOT NULL,
    "readByIds" TEXT[],
    "sentTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "userIds" TEXT[],
    "hostId" TEXT NOT NULL,

    CONSTRAINT "ChatGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockFiles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "docId" TEXT,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LockFiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PaymentIntents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bills" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "ownerType" "BillsOwnerTypeEnum" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventId" TEXT,
    "totalAmountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER,
    "nextPaymentDue" TIMESTAMP(3),
    "nextPaymentAmountCents" INTEGER,
    "parentBillId" TEXT,
    "allowSplit" BOOLEAN,
    "status" "BillsStatusEnum",
    "paymentPlanEnabled" BOOLEAN,
    "createdBy" TEXT,

    CONSTRAINT "Bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "billId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "BillPaymentsStatusEnum",
    "paidAt" TIMESTAMP(3),
    "paymentIntentId" TEXT,
    "payerUserId" TEXT,

    CONSTRAINT "BillPayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequests" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostId" TEXT,
    "reason" TEXT NOT NULL,
    "organizationId" TEXT,
    "status" "RefundRequestsStatusEnum",

    CONSTRAINT "RefundRequests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeAccounts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "customerId" TEXT,
    "accountId" TEXT,
    "userId" TEXT,
    "organizationId" TEXT,
    "email" TEXT,

    CONSTRAINT "StripeAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "divisions" TEXT[],
    "winnerSetCount" INTEGER,
    "loserSetCount" INTEGER,
    "doubleElimination" BOOLEAN,
    "location" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "teamSizeLimit" INTEGER NOT NULL,
    "maxParticipants" INTEGER,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "hostId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "singleDivision" BOOLEAN,
    "waitListIds" TEXT[],
    "freeAgentIds" TEXT[],
    "cancellationRefundHours" INTEGER,
    "teamSignup" BOOLEAN,
    "prize" TEXT,
    "registrationCutoffHours" INTEGER,
    "seedColor" INTEGER,
    "imageId" TEXT NOT NULL,
    "fieldCount" INTEGER,
    "winnerBracketPointsToVictory" INTEGER[],
    "loserBracketPointsToVictory" INTEGER[],
    "coordinates" JSONB NOT NULL,
    "gamesPerOpponent" INTEGER,
    "includePlayoffs" BOOLEAN,
    "playoffTeamCount" INTEGER,
    "usesSets" BOOLEAN,
    "matchDurationMinutes" INTEGER,
    "setDurationMinutes" INTEGER,
    "setsPerMatch" INTEGER,
    "restTimeMinutes" INTEGER,
    "state" "EventsStateEnum",
    "pointsToVictory" INTEGER[],
    "sportId" TEXT,
    "timeSlotIds" TEXT[],
    "fieldIds" TEXT[],
    "teamIds" TEXT[],
    "userIds" TEXT[],
    "registrationIds" TEXT[],
    "leagueScoringConfigId" TEXT,
    "organizationId" TEXT,
    "autoCancellation" BOOLEAN,
    "eventType" "EventsEventTypeEnum",
    "fieldType" "EventsFieldTypeEnum",
    "doTeamsRef" BOOLEAN,
    "refereeIds" TEXT[],
    "allowPaymentPlans" BOOLEAN,
    "installmentCount" INTEGER,
    "installmentDueDates" TIMESTAMP(3)[],
    "installmentAmounts" INTEGER[],
    "allowTeamSplitDefault" BOOLEAN,
    "requiredTemplateIds" TEXT[],

    CONSTRAINT "Events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organizations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "logoId" TEXT,
    "ownerId" TEXT NOT NULL,
    "website" TEXT,
    "refIds" TEXT[],
    "hasStripeAccount" BOOLEAN,
    "coordinates" JSONB,
    "fieldIds" TEXT[],
    "productIds" TEXT[],
    "teamIds" TEXT[],

    CONSTRAINT "Organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Products" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "period" "ProductsPeriodEnum" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "isActive" BOOLEAN,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,

    CONSTRAINT "Products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriptions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "period" "SubscriptionsPeriodEnum" NOT NULL,
    "status" "SubscriptionsStatusEnum",
    "stripeSubscriptionId" TEXT,

    CONSTRAINT "Subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "dayOfWeek" INTEGER,
    "startTimeMinutes" INTEGER,
    "endTimeMinutes" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "repeating" BOOLEAN NOT NULL,
    "endDate" TIMESTAMP(3),
    "scheduledFieldId" TEXT,
    "price" INTEGER,

    CONSTRAINT "TimeSlots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueScoringConfigs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "pointsForWin" INTEGER,
    "pointsForDraw" INTEGER,
    "pointsForLoss" INTEGER,
    "pointsForForfeitWin" INTEGER,
    "pointsForForfeitLoss" INTEGER,
    "pointsPerSetWin" DOUBLE PRECISION,
    "pointsPerSetLoss" DOUBLE PRECISION,
    "pointsPerGameWin" DOUBLE PRECISION,
    "pointsPerGameLoss" DOUBLE PRECISION,
    "pointsPerGoalScored" DOUBLE PRECISION,
    "pointsPerGoalConceded" DOUBLE PRECISION,
    "maxGoalBonusPoints" INTEGER,
    "minGoalBonusThreshold" INTEGER,
    "pointsForShutout" DOUBLE PRECISION,
    "pointsForCleanSheet" DOUBLE PRECISION,
    "applyShutoutOnlyIfWin" BOOLEAN,
    "pointsPerGoalDifference" DOUBLE PRECISION,
    "maxGoalDifferencePoints" INTEGER,
    "pointsPenaltyPerGoalDifference" DOUBLE PRECISION,
    "pointsForParticipation" DOUBLE PRECISION,
    "pointsForNoShow" DOUBLE PRECISION,
    "pointsForWinStreakBonus" DOUBLE PRECISION,
    "winStreakThreshold" INTEGER,
    "pointsForOvertimeWin" DOUBLE PRECISION,
    "pointsForOvertimeLoss" DOUBLE PRECISION,
    "overtimeEnabled" BOOLEAN,
    "pointsPerRedCard" DOUBLE PRECISION,
    "pointsPerYellowCard" DOUBLE PRECISION,
    "pointsPerPenalty" DOUBLE PRECISION,
    "maxPenaltyDeductions" INTEGER,
    "maxPointsPerMatch" DOUBLE PRECISION,
    "minPointsPerMatch" DOUBLE PRECISION,
    "goalDifferenceTiebreaker" BOOLEAN,
    "headToHeadTiebreaker" BOOLEAN,
    "totalGoalsTiebreaker" BOOLEAN,
    "enableBonusForComebackWin" BOOLEAN,
    "bonusPointsForComebackWin" DOUBLE PRECISION,
    "enableBonusForHighScoringMatch" BOOLEAN,
    "highScoringThreshold" INTEGER,
    "bonusPointsForHighScoringMatch" DOUBLE PRECISION,
    "enablePenaltyForUnsportingBehavior" BOOLEAN,
    "penaltyPointsForUnsportingBehavior" DOUBLE PRECISION,
    "pointPrecision" INTEGER,

    CONSTRAINT "LeagueScoringConfigs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sports" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "usePointsForWin" BOOLEAN,
    "usePointsForDraw" BOOLEAN,
    "usePointsForLoss" BOOLEAN,
    "usePointsForForfeitWin" BOOLEAN,
    "usePointsForForfeitLoss" BOOLEAN,
    "usePointsPerSetWin" BOOLEAN,
    "usePointsPerSetLoss" BOOLEAN,
    "usePointsPerGameWin" BOOLEAN,
    "usePointsPerGameLoss" BOOLEAN,
    "usePointsPerGoalScored" BOOLEAN,
    "usePointsPerGoalConceded" BOOLEAN,
    "useMaxGoalBonusPoints" BOOLEAN,
    "useMinGoalBonusThreshold" BOOLEAN,
    "usePointsForShutout" BOOLEAN,
    "usePointsForCleanSheet" BOOLEAN,
    "useApplyShutoutOnlyIfWin" BOOLEAN,
    "usePointsPerGoalDifference" BOOLEAN,
    "useMaxGoalDifferencePoints" BOOLEAN,
    "usePointsPenaltyPerGoalDifference" BOOLEAN,
    "usePointsForParticipation" BOOLEAN,
    "usePointsForNoShow" BOOLEAN,
    "usePointsForWinStreakBonus" BOOLEAN,
    "useWinStreakThreshold" BOOLEAN,
    "usePointsForOvertimeWin" BOOLEAN,
    "usePointsForOvertimeLoss" BOOLEAN,
    "useOvertimeEnabled" BOOLEAN,
    "usePointsPerRedCard" BOOLEAN,
    "usePointsPerYellowCard" BOOLEAN,
    "usePointsPerPenalty" BOOLEAN,
    "useMaxPenaltyDeductions" BOOLEAN,
    "useMaxPointsPerMatch" BOOLEAN,
    "useMinPointsPerMatch" BOOLEAN,
    "useGoalDifferenceTiebreaker" BOOLEAN,
    "useHeadToHeadTiebreaker" BOOLEAN,
    "useTotalGoalsTiebreaker" BOOLEAN,
    "useEnableBonusForComebackWin" BOOLEAN,
    "useBonusPointsForComebackWin" BOOLEAN,
    "useEnableBonusForHighScoringMatch" BOOLEAN,
    "useHighScoringThreshold" BOOLEAN,
    "useBonusPointsForHighScoringMatch" BOOLEAN,
    "useEnablePenaltyUnsporting" BOOLEAN,
    "usePenaltyPointsUnsporting" BOOLEAN,
    "usePointPrecision" BOOLEAN,

    CONSTRAINT "Sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDocuments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "templateId" TEXT,
    "type" "TemplateDocumentsTypeEnum",
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "signOnce" BOOLEAN,
    "status" TEXT,
    "createdBy" TEXT,
    "roleIndex" INTEGER,
    "roleIndexes" INTEGER[],
    "signerRoles" TEXT[],
    "content" TEXT,

    CONSTRAINT "TemplateDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedDocuments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "signedDocumentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "hostId" TEXT,
    "organizationId" TEXT,
    "eventId" TEXT,
    "status" TEXT,
    "signedAt" TEXT,
    "signerEmail" TEXT,
    "roleIndex" INTEGER,
    "signerRole" TEXT,
    "ipAddress" TEXT,
    "requestId" TEXT,

    CONSTRAINT "SignedDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentChildLinks" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "status" "ParentChildLinksStatusEnum" NOT NULL,
    "relationship" TEXT,
    "linkMethod" TEXT,
    "createdBy" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ParentChildLinks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistrations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "eventId" TEXT NOT NULL,
    "registrantId" TEXT NOT NULL,
    "parentId" TEXT,
    "registrantType" "EventRegistrationsRegistrantTypeEnum" NOT NULL,
    "status" "EventRegistrationsStatusEnum" NOT NULL,
    "ageAtEvent" INTEGER,
    "consentDocumentId" TEXT,
    "consentStatus" TEXT,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "EventRegistrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT,
    "organizationId" TEXT,
    "bucket" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fields_organizationId_idx" ON "Fields"("organizationId");

-- CreateIndex
CREATE INDEX "Matches_eventId_idx" ON "Matches"("eventId");

-- CreateIndex
CREATE INDEX "Matches_matchId_idx" ON "Matches"("matchId");

-- CreateIndex
CREATE INDEX "Matches_winnerNextMatchId_idx" ON "Matches"("winnerNextMatchId");

-- CreateIndex
CREATE INDEX "Matches_loserNextMatchId_idx" ON "Matches"("loserNextMatchId");

-- CreateIndex
CREATE INDEX "Matches_previousLeftId_idx" ON "Matches"("previousLeftId");

-- CreateIndex
CREATE INDEX "Matches_previousRightId_idx" ON "Matches"("previousRightId");

-- CreateIndex
CREATE INDEX "Matches_fieldId_idx" ON "Matches"("fieldId");

-- CreateIndex
CREATE INDEX "VolleyBallTeams_captainId_idx" ON "VolleyBallTeams"("captainId");

-- CreateIndex
CREATE INDEX "Events_organizationId_idx" ON "Events"("organizationId");

-- CreateIndex
CREATE INDEX "Events_hostId_idx" ON "Events"("hostId");

-- CreateIndex
CREATE INDEX "Events_sportId_idx" ON "Events"("sportId");

-- CreateIndex
CREATE INDEX "TimeSlots_scheduledFieldId_idx" ON "TimeSlots"("scheduledFieldId");

-- CreateIndex
CREATE INDEX "EventRegistrations_eventId_idx" ON "EventRegistrations"("eventId");

-- CreateIndex
CREATE INDEX "EventRegistrations_registrantId_idx" ON "EventRegistrations"("registrantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");

-- CreateIndex
CREATE INDEX "AuthUser_email_idx" ON "AuthUser"("email");

-- CreateIndex
CREATE INDEX "File_uploaderId_idx" ON "File"("uploaderId");

-- CreateIndex
CREATE INDEX "File_organizationId_idx" ON "File"("organizationId");
