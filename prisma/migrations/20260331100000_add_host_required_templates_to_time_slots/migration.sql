ALTER TABLE "TimeSlots"
ADD COLUMN "hostRequiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
