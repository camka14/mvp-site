CREATE TABLE "OrganizationTags" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganizationTags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationTagAssignments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "OrganizationTagAssignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationTags_slug_key" ON "OrganizationTags"("slug");
CREATE INDEX "OrganizationTags_name_idx" ON "OrganizationTags"("name");
CREATE INDEX "OrganizationTags_isSystem_idx" ON "OrganizationTags"("isSystem");
CREATE UNIQUE INDEX "OrganizationTagAssignments_organizationId_tagId_key" ON "OrganizationTagAssignments"("organizationId", "tagId");
CREATE INDEX "OrganizationTagAssignments_organizationId_idx" ON "OrganizationTagAssignments"("organizationId");
CREATE INDEX "OrganizationTagAssignments_tagId_idx" ON "OrganizationTagAssignments"("tagId");

INSERT INTO "OrganizationTags" ("id", "createdAt", "updatedAt", "name", "slug", "isSystem")
VALUES
  ('default_org_tag_club', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Club', 'club', true),
  ('default_org_tag_facility', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Facility', 'facility', true),
  ('default_org_tag_event_manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Event Manager', 'event-manager', true),
  ('default_org_tag_league_operator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'League Operator', 'league-operator', true),
  ('default_org_tag_tournament_host', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Tournament Host', 'tournament-host', true),
  ('default_org_tag_training_provider', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Training Provider', 'training-provider', true),
  ('default_org_tag_rental_provider', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Rental Provider', 'rental-provider', true)
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
