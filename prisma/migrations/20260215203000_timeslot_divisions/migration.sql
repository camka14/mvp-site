-- Move division ownership to timeslots so scheduler can filter teams by slot division.
ALTER TABLE "TimeSlots"
  ADD COLUMN IF NOT EXISTS "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "TimeSlots"
SET "divisions" = COALESCE("divisions", ARRAY[]::TEXT[])
WHERE "divisions" IS NULL;
