-- Remove legacy field-level division tags. Division ownership now lives on Divisions.fieldIds.
ALTER TABLE "Fields"
  DROP COLUMN IF EXISTS "divisions";
