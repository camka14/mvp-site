-- Add richer division metadata and registration-mode controls.

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "registrationByDivisionType" BOOLEAN;

ALTER TABLE "VolleyBallTeams"
  ADD COLUMN IF NOT EXISTS "divisionTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "divisionTypeName" TEXT;

ALTER TABLE "EventRegistrations"
  ADD COLUMN IF NOT EXISTS "divisionId" TEXT,
  ADD COLUMN IF NOT EXISTS "divisionTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "divisionTypeKey" TEXT;

ALTER TABLE "Divisions"
  ADD COLUMN IF NOT EXISTS "divisionTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "divisionTypeName" TEXT,
  ADD COLUMN IF NOT EXISTS "ratingType" TEXT,
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "ageCutoffDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ageCutoffLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "ageCutoffSource" TEXT;
