-- Move field association ownership to divisions while keeping legacy field.divisions for compatibility.
ALTER TABLE "Divisions"
  ADD COLUMN IF NOT EXISTS "key" TEXT,
  ADD COLUMN IF NOT EXISTS "eventId" TEXT,
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "sportId" TEXT,
  ADD COLUMN IF NOT EXISTS "minRating" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxRating" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fieldIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Divisions"
SET "fieldIds" = COALESCE("fieldIds", ARRAY[]::TEXT[])
WHERE "fieldIds" IS NULL;

CREATE INDEX IF NOT EXISTS "Divisions_eventId_idx" ON "Divisions"("eventId");
CREATE INDEX IF NOT EXISTS "Divisions_organizationId_idx" ON "Divisions"("organizationId");
CREATE INDEX IF NOT EXISTS "Divisions_sportId_idx" ON "Divisions"("sportId");
CREATE INDEX IF NOT EXISTS "Divisions_key_idx" ON "Divisions"("key");
