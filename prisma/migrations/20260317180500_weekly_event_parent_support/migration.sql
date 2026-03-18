DO $$
BEGIN
  ALTER TYPE "EventsEventTypeEnum" ADD VALUE IF NOT EXISTS 'WEEKLY_EVENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Events"
  ALTER COLUMN "end" DROP NOT NULL;

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "parentEvent" TEXT;

CREATE INDEX IF NOT EXISTS "Events_parentEvent_idx"
  ON "Events"("parentEvent");
