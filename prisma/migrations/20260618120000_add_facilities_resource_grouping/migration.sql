CREATE TABLE "Facilities" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "address" TEXT,
  "coordinates" JSONB,
  "operatingHours" JSONB,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER,

  CONSTRAINT "Facilities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Fields" ADD COLUMN "facilityId" TEXT;

CREATE INDEX "Facilities_organizationId_idx" ON "Facilities"("organizationId");
CREATE INDEX "Facilities_organizationId_isDefault_idx" ON "Facilities"("organizationId", "isDefault");
CREATE INDEX "Facilities_status_idx" ON "Facilities"("status");
CREATE INDEX "Fields_facilityId_idx" ON "Fields"("facilityId");

INSERT INTO "Facilities" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "name",
  "location",
  "address",
  "coordinates",
  "operatingHours",
  "timeZone",
  "status",
  "isDefault",
  "sortOrder"
)
SELECT
  'facility_' || regexp_replace(o."id", '[^a-zA-Z0-9_]+', '_', 'g'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  o."id",
  COALESCE(NULLIF(o."name", ''), 'Main Facility'),
  COALESCE(NULLIF(o."location", ''), NULLIF(o."address", ''), NULLIF(o."name", ''), 'Main Facility'),
  o."address",
  o."coordinates",
  NULL,
  'UTC',
  'ACTIVE',
  true,
  0
FROM "Organizations" o
WHERE EXISTS (
  SELECT 1
  FROM "Fields" f
  WHERE f."organizationId" = o."id"
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Fields" f
SET "facilityId" = 'facility_' || regexp_replace(f."organizationId", '[^a-zA-Z0-9_]+', '_', 'g')
WHERE f."organizationId" IS NOT NULL
  AND (f."facilityId" IS NULL OR f."facilityId" = '');
