CREATE INDEX IF NOT EXISTS "OrganizationReviews_org_status_created_id_idx"
ON "OrganizationReviews" ("organizationId", "status", "createdAt" DESC, "id" DESC);
