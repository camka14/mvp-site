-- Split league and playoff divisions plus standings confirmation metadata.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DivisionsKindEnum') THEN
    CREATE TYPE "DivisionsKindEnum" AS ENUM ('LEAGUE', 'PLAYOFF');
  END IF;
END $$;

ALTER TABLE "Divisions"
  ADD COLUMN IF NOT EXISTS "kind" "DivisionsKindEnum" DEFAULT 'LEAGUE',
  ADD COLUMN IF NOT EXISTS "playoffPlacementDivisionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "standingsOverrides" JSONB,
  ADD COLUMN IF NOT EXISTS "standingsConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "standingsConfirmedBy" TEXT;

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "splitLeaguePlayoffDivisions" BOOLEAN DEFAULT FALSE;

UPDATE "Divisions"
SET "kind" = 'LEAGUE'
WHERE "kind" IS NULL;

UPDATE "Sports"
SET
  "usePointsForDraw" = TRUE,
  "updatedAt" = NOW()
WHERE LOWER(COALESCE("name", '')) IN (
  'soccer',
  'indoor soccer',
  'grass soccer',
  'beach soccer',
  'football',
  'hockey',
  'other'
)
AND "usePointsForDraw" IS DISTINCT FROM TRUE;

UPDATE "Sports"
SET
  "usePointsPerGoalScored" = FALSE,
  "usePointsPerGoalConceded" = FALSE,
  "updatedAt" = NOW()
WHERE "usePointsPerGoalScored" IS DISTINCT FROM FALSE
   OR "usePointsPerGoalConceded" IS DISTINCT FROM FALSE;
