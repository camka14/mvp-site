ALTER TABLE "Events"
ADD COLUMN "installmentDueRelativeDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "Divisions"
ADD COLUMN "installmentDueRelativeDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "Bills"
ADD COLUMN "slotId" TEXT,
ADD COLUMN "occurrenceDate" TEXT;

CREATE INDEX "Bills_eventId_slotId_occurrenceDate_idx"
ON "Bills"("eventId", "slotId", "occurrenceDate");
