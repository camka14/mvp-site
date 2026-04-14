ALTER TABLE "UserData"
ADD COLUMN "blockedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "hiddenEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "chatTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "chatTermsVersion" TEXT;

ALTER TABLE "Messages"
ADD COLUMN "removedAt" TIMESTAMP(3),
ADD COLUMN "removedByUserId" TEXT,
ADD COLUMN "removalReason" TEXT;

ALTER TABLE "ChatGroup"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedReason" TEXT,
ADD COLUMN "archivedByUserId" TEXT;

ALTER TABLE "AuthUser"
ADD COLUMN "disabledAt" TIMESTAMP(3),
ADD COLUMN "disabledByUserId" TEXT,
ADD COLUMN "disabledReason" TEXT;

CREATE TYPE "ModerationReportTargetTypeEnum" AS ENUM ('CHAT_GROUP', 'EVENT', 'BLOCK_USER');

CREATE TYPE "ModerationReportStatusEnum" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTIONED', 'DISMISSED');

CREATE TABLE "ModerationReport" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "reporterUserId" TEXT NOT NULL,
  "targetType" "ModerationReportTargetTypeEnum" NOT NULL,
  "targetId" TEXT NOT NULL,
  "category" TEXT,
  "notes" TEXT,
  "status" "ModerationReportStatusEnum" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewNotes" TEXT,
  "metadata" JSONB,

  CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Messages_chatId_removedAt_idx" ON "Messages"("chatId", "removedAt");
CREATE INDEX "ChatGroup_archivedAt_idx" ON "ChatGroup"("archivedAt");
CREATE INDEX "ModerationReport_reporterUserId_idx" ON "ModerationReport"("reporterUserId");
CREATE INDEX "ModerationReport_targetType_targetId_idx" ON "ModerationReport"("targetType", "targetId");
CREATE INDEX "ModerationReport_status_dueAt_idx" ON "ModerationReport"("status", "dueAt");
CREATE INDEX "AuthUser_disabledAt_idx" ON "AuthUser"("disabledAt");
