-- AlterTable
ALTER TABLE "Events" ADD COLUMN "teamCheckInMode" TEXT NOT NULL DEFAULT 'OFF';
ALTER TABLE "Events" ADD COLUMN "teamCheckInOpenMinutesBefore" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Events" ADD COLUMN "allowMatchRosterEdits" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Events" ADD COLUMN "allowTemporaryMatchPlayers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TeamCheckIns" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "matchId" TEXT,
    "eventTeamId" TEXT NOT NULL,
    "checkInKey" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedInByUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CHECKED_IN',

    CONSTRAINT "TeamCheckIns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRosterEntries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "eventTeamId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "linkedAt" TIMESTAMP(3),
    "linkedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MatchRosterEntries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamCheckIns_checkInKey_key" ON "TeamCheckIns"("checkInKey");

-- CreateIndex
CREATE INDEX "TeamCheckIns_eventId_idx" ON "TeamCheckIns"("eventId");

-- CreateIndex
CREATE INDEX "TeamCheckIns_eventId_eventTeamId_scope_idx" ON "TeamCheckIns"("eventId", "eventTeamId", "scope");

-- CreateIndex
CREATE INDEX "TeamCheckIns_eventId_matchId_eventTeamId_idx" ON "TeamCheckIns"("eventId", "matchId", "eventTeamId");

-- CreateIndex
CREATE INDEX "TeamCheckIns_checkedInByUserId_idx" ON "TeamCheckIns"("checkedInByUserId");

-- CreateIndex
CREATE INDEX "MatchRosterEntries_eventId_idx" ON "MatchRosterEntries"("eventId");

-- CreateIndex
CREATE INDEX "MatchRosterEntries_eventId_matchId_idx" ON "MatchRosterEntries"("eventId", "matchId");

-- CreateIndex
CREATE INDEX "MatchRosterEntries_eventId_matchId_eventTeamId_idx" ON "MatchRosterEntries"("eventId", "matchId", "eventTeamId");

-- CreateIndex
CREATE INDEX "MatchRosterEntries_eventTeamId_userId_idx" ON "MatchRosterEntries"("eventTeamId", "userId");

-- CreateIndex
CREATE INDEX "MatchRosterEntries_userId_idx" ON "MatchRosterEntries"("userId");
