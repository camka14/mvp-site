-- Add required template assignments to rental time slots.
ALTER TABLE "TimeSlots"
ADD COLUMN "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
