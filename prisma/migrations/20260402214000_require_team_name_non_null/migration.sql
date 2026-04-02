-- Backfill legacy teams that were created with null/blank names.
UPDATE "VolleyBallTeams"
SET "name" = CONCAT('Team ', SUBSTRING("id" FROM 1 FOR 8))
WHERE "name" IS NULL OR BTRIM("name") = '';

-- Enforce team name as required for all future writes.
ALTER TABLE "VolleyBallTeams"
ALTER COLUMN "name" SET NOT NULL;
