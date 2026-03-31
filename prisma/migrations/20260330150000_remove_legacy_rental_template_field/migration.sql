UPDATE "TimeSlots"
SET "requiredTemplateIds" = CASE
  WHEN "rentalDocumentTemplateId" IS NULL OR BTRIM("rentalDocumentTemplateId") = '' THEN COALESCE("requiredTemplateIds", ARRAY[]::TEXT[])
  WHEN COALESCE("requiredTemplateIds", ARRAY[]::TEXT[]) @> ARRAY[BTRIM("rentalDocumentTemplateId")]::TEXT[] THEN COALESCE("requiredTemplateIds", ARRAY[]::TEXT[])
  ELSE ARRAY_APPEND(COALESCE("requiredTemplateIds", ARRAY[]::TEXT[]), BTRIM("rentalDocumentTemplateId"))
END;

ALTER TABLE "TimeSlots"
DROP COLUMN IF EXISTS "rentalDocumentTemplateId";
