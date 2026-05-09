ALTER TABLE "Sports" ADD COLUMN IF NOT EXISTS "skillDivisionTypes" JSONB;
DELETE FROM "Divisions"
WHERE "eventId" IS NULL
  AND "organizationId" IS NULL;
