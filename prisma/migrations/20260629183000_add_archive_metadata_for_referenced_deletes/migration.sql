-- Add archive metadata for delete-or-archive flows.
-- These columns are nullable so existing rows remain active by default.

ALTER TABLE "Events"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "Fields"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "TimeSlots"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "Teams"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "EventTeams"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT,
  ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "Events_archivedAt_idx" ON "Events"("archivedAt");
CREATE INDEX "Events_organizationId_archivedAt_idx" ON "Events"("organizationId", "archivedAt");

CREATE INDEX "Fields_archivedAt_idx" ON "Fields"("archivedAt");

CREATE INDEX "TimeSlots_archivedAt_idx" ON "TimeSlots"("archivedAt");

CREATE INDEX "Teams_archivedAt_idx" ON "Teams"("archivedAt");
CREATE INDEX "Teams_organizationId_archivedAt_idx" ON "Teams"("organizationId", "archivedAt");

CREATE INDEX "EventTeams_archivedAt_idx" ON "EventTeams"("archivedAt");
