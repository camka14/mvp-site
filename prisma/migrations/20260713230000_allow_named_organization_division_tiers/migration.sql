DROP INDEX IF EXISTS "Divisions_active_organization_catalog_key";

CREATE UNIQUE INDEX "Divisions_active_organization_catalog_key"
  ON "Divisions"("organizationId", "sportId", "key", "name")
  WHERE "scope" = 'ORGANIZATION' AND "status" <> 'ARCHIVED';
