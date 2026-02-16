-- Add team role metadata and immutable-history version linkage.

ALTER TABLE "VolleyBallTeams"
  ADD COLUMN IF NOT EXISTS "managerId" TEXT;

UPDATE "VolleyBallTeams"
SET "managerId" = "captainId"
WHERE "managerId" IS NULL;

ALTER TABLE "VolleyBallTeams"
  ALTER COLUMN "managerId" SET NOT NULL;

ALTER TABLE "VolleyBallTeams"
  ADD COLUMN IF NOT EXISTS "coachIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "parentTeamId" TEXT;

UPDATE "VolleyBallTeams"
SET "coachIds" = ARRAY[]::TEXT[]
WHERE "coachIds" IS NULL;

ALTER TABLE "VolleyBallTeams"
  ALTER COLUMN "coachIds" SET NOT NULL,
  ALTER COLUMN "coachIds" SET DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "VolleyBallTeams_managerId_idx"
  ON "VolleyBallTeams"("managerId");

CREATE INDEX IF NOT EXISTS "VolleyBallTeams_parentTeamId_idx"
  ON "VolleyBallTeams"("parentTeamId");
