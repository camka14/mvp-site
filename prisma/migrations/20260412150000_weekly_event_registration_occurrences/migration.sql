DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'EventRegistrationsRosterRoleEnum'
  ) THEN
    CREATE TYPE "EventRegistrationsRosterRoleEnum" AS ENUM ('PARTICIPANT', 'WAITLIST', 'FREE_AGENT');
  END IF;
END
$$;

ALTER TABLE "EventRegistrations"
  ADD COLUMN IF NOT EXISTS "rosterRole" "EventRegistrationsRosterRoleEnum" NOT NULL DEFAULT 'PARTICIPANT',
  ADD COLUMN IF NOT EXISTS "slotId" TEXT,
  ADD COLUMN IF NOT EXISTS "occurrenceDate" TEXT;

UPDATE "EventRegistrations"
SET "status" = 'STARTED'
WHERE "status" = 'PENDINGCONSENT';

CREATE INDEX IF NOT EXISTS "EventRegistrations_eventId_rosterRole_status_idx"
  ON "EventRegistrations" ("eventId", "rosterRole", "status");

CREATE INDEX IF NOT EXISTS "EventRegistrations_eventId_slotId_occurrenceDate_idx"
  ON "EventRegistrations" ("eventId", "slotId", "occurrenceDate");
