-- AlterTable
ALTER TABLE "BoldSignSyncOperations" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "EventTeams" RENAME CONSTRAINT "VolleyBallTeams_pkey" TO "EventTeams_pkey";

-- AlterTable
ALTER TABLE "SignedDocuments" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "TeamRegistrations" ADD COLUMN     "consentDocumentId" TEXT,
ADD COLUMN     "consentStatus" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "registrantType" "EventRegistrationsRegistrantTypeEnum" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "rosterRole" "EventRegistrationsRosterRoleEnum" NOT NULL DEFAULT 'PARTICIPANT';

-- AlterTable
ALTER TABLE "Teams" ADD COLUMN     "requiredTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "BoldSignSyncOperations_teamId_idx" ON "BoldSignSyncOperations"("teamId");

-- RenameIndex
ALTER INDEX "VolleyBallTeams_captainId_idx" RENAME TO "EventTeams_captainId_idx";

-- RenameIndex
ALTER INDEX "VolleyBallTeams_headCoachId_idx" RENAME TO "EventTeams_headCoachId_idx";

-- RenameIndex
ALTER INDEX "VolleyBallTeams_managerId_idx" RENAME TO "EventTeams_managerId_idx";

-- RenameIndex
ALTER INDEX "VolleyBallTeams_parentTeamId_idx" RENAME TO "EventTeams_parentTeamId_idx";
