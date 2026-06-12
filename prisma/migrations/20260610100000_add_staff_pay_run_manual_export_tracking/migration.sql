ALTER TABLE "StaffPayRun"
ADD COLUMN "scheduledPayDate" TIMESTAMP(3),
ADD COLUMN "exportedAt" TIMESTAMP(3),
ADD COLUMN "exportedByUserId" TEXT,
ADD COLUMN "exportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastExportFormat" TEXT;

CREATE INDEX "StaffPayRun_scheduledPayDate_idx" ON "StaffPayRun"("scheduledPayDate");
CREATE INDEX "StaffPayRun_exportedByUserId_idx" ON "StaffPayRun"("exportedByUserId");
