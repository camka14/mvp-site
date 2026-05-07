ALTER TABLE "Divisions"
DROP COLUMN IF EXISTS "divisionTypeName";

ALTER TABLE "EventTeams"
DROP COLUMN IF EXISTS "divisionTypeName";

ALTER TABLE "Teams"
DROP COLUMN IF EXISTS "divisionTypeName";
