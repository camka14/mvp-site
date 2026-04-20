ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "publicSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "publicPageEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "publicWidgetsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "brandPrimaryColor" TEXT,
  ADD COLUMN IF NOT EXISTS "brandAccentColor" TEXT,
  ADD COLUMN IF NOT EXISTS "publicHeadline" TEXT,
  ADD COLUMN IF NOT EXISTS "publicIntroText" TEXT,
  ADD COLUMN IF NOT EXISTS "embedAllowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "Organizations_publicSlug_key"
  ON "Organizations"("publicSlug")
  WHERE "publicSlug" IS NOT NULL;
