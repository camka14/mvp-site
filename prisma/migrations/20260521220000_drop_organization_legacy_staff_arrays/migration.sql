-- Organization staff membership now lives exclusively in StaffMembers.
-- The previous migration backfilled any legacy array values into StaffMembers.

ALTER TABLE "Organizations"
  DROP COLUMN IF EXISTS "hostIds",
  DROP COLUMN IF EXISTS "officialIds";

