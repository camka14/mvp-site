BEGIN;

UPDATE "Organizations"
SET "productIds" = ARRAY[]::TEXT[]
WHERE "productIds" IS NULL;

UPDATE "UserData"
SET "teamIds" = ARRAY[]::TEXT[]
WHERE "teamIds" IS NULL;

ALTER TABLE "Organizations"
ALTER COLUMN "productIds" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "UserData"
ALTER COLUMN "teamIds" SET DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "Products_organizationId_idx"
ON "Products"("organizationId");

COMMIT;
