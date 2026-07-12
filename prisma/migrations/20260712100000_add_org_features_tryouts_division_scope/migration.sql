-- Add organization capability modes without changing existing organization behavior.
CREATE TYPE "OrganizationFeatureEnum" AS ENUM ('CLUB_TEAMS', 'FACILITIES_RENTALS', 'EVENT_MANAGEMENT');
CREATE TYPE "DivisionScopeEnum" AS ENUM ('ORGANIZATION', 'EVENT');
CREATE TYPE "DivisionStatusEnum" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

ALTER TYPE "EventsEventTypeEnum" ADD VALUE 'TRYOUT';

ALTER TABLE "Organizations"
  ADD COLUMN "enabledFeatures" "OrganizationFeatureEnum"[] NOT NULL
  DEFAULT ARRAY['EVENT_MANAGEMENT']::"OrganizationFeatureEnum"[];

ALTER TABLE "Divisions"
  ADD COLUMN "scope" "DivisionScopeEnum" NOT NULL DEFAULT 'EVENT',
  ADD COLUMN "status" "DivisionStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sourceDivisionId" TEXT,
  ADD COLUMN "skillDivisionTypeId" TEXT,
  ADD COLUMN "ageDivisionTypeId" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "registrationUrl" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

-- Existing composite ids use skill_<skill>_age_<age>. Backfill the normalized
-- values in SQL; the follow-up audit script handles older non-composite ids.
WITH parsed AS (
  SELECT
    "id",
    regexp_match(lower(trim("divisionTypeId")), '^skill_(.+)_age_(.+)$') AS parts
  FROM "Divisions"
  WHERE "divisionTypeId" IS NOT NULL
)
UPDATE "Divisions" AS division
SET
  "skillDivisionTypeId" = parsed.parts[1],
  "ageDivisionTypeId" = parsed.parts[2]
FROM parsed
WHERE division."id" = parsed."id"
  AND parsed.parts IS NOT NULL;

CREATE INDEX "Divisions_scope_status_organizationId_idx"
  ON "Divisions"("scope", "status", "organizationId");
CREATE INDEX "Divisions_scope_status_eventId_idx"
  ON "Divisions"("scope", "status", "eventId");
CREATE INDEX "Divisions_scope_status_sportId_ageDivisionTypeId_idx"
  ON "Divisions"("scope", "status", "sportId", "ageDivisionTypeId");
CREATE INDEX "Divisions_scope_status_sportId_skillDivisionTypeId_idx"
  ON "Divisions"("scope", "status", "sportId", "skillDivisionTypeId");
CREATE INDEX "Divisions_scope_status_gender_idx"
  ON "Divisions"("scope", "status", "gender");
CREATE INDEX "Divisions_sourceDivisionId_idx" ON "Divisions"("sourceDivisionId");
CREATE INDEX "Divisions_price_idx" ON "Divisions"("price");

CREATE UNIQUE INDEX "Divisions_active_organization_catalog_key"
  ON "Divisions"("organizationId", "sportId", "key")
  WHERE "scope" = 'ORGANIZATION' AND "status" <> 'ARCHIVED';
