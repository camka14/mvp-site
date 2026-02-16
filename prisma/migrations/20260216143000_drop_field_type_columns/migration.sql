-- Remove deprecated field-surface metadata; sports now encode variants directly.

ALTER TABLE "Events"
  DROP COLUMN IF EXISTS "fieldType";

ALTER TABLE "Fields"
  DROP COLUMN IF EXISTS "type";

DROP TYPE IF EXISTS "EventsFieldTypeEnum";
