ALTER TYPE "BillsOwnerTypeEnum" ADD VALUE IF NOT EXISTS 'ORGANIZATION';

ALTER TABLE "Bills"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

ALTER TABLE "TimeSlots"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "rentalBookingId" TEXT,
  ADD COLUMN IF NOT EXISTS "rentalBookingItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "rentalLocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "RentalBookings" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "renterType" TEXT NOT NULL DEFAULT 'USER',
  "renterUserId" TEXT,
  "renterOrganizationId" TEXT,
  "createdByUserId" TEXT,
  "billId" TEXT,
  "eventId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "paymentIntentId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB,

  CONSTRAINT "RentalBookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RentalBookingItems" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bookingId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "facilityId" TEXT,
  "fieldId" TEXT NOT NULL,
  "availabilitySlotId" TEXT,
  "eventId" TEXT,
  "eventTimeSlotId" TEXT,
  "start" TIMESTAMP(3) NOT NULL,
  "end" TIMESTAMP(3) NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "requiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "hostRequiredTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,

  CONSTRAINT "RentalBookingItems_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentalBookings_paymentIntentId_key"
  ON "RentalBookings"("paymentIntentId");

CREATE INDEX IF NOT EXISTS "Bills_sourceType_sourceId_idx"
  ON "Bills"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "Bills_organizationId_sourceType_idx"
  ON "Bills"("organizationId", "sourceType");

CREATE INDEX IF NOT EXISTS "TimeSlots_sourceType_idx"
  ON "TimeSlots"("sourceType");

CREATE INDEX IF NOT EXISTS "TimeSlots_rentalBookingId_idx"
  ON "TimeSlots"("rentalBookingId");

CREATE INDEX IF NOT EXISTS "TimeSlots_rentalBookingItemId_idx"
  ON "TimeSlots"("rentalBookingItemId");

CREATE INDEX IF NOT EXISTS "RentalBookings_organizationId_status_idx"
  ON "RentalBookings"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "RentalBookings_renterUserId_status_idx"
  ON "RentalBookings"("renterUserId", "status");

CREATE INDEX IF NOT EXISTS "RentalBookings_renterOrganizationId_status_idx"
  ON "RentalBookings"("renterOrganizationId", "status");

CREATE INDEX IF NOT EXISTS "RentalBookings_billId_idx"
  ON "RentalBookings"("billId");

CREATE INDEX IF NOT EXISTS "RentalBookings_eventId_idx"
  ON "RentalBookings"("eventId");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_bookingId_idx"
  ON "RentalBookingItems"("bookingId");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_organizationId_status_idx"
  ON "RentalBookingItems"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_facilityId_idx"
  ON "RentalBookingItems"("facilityId");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_fieldId_start_end_idx"
  ON "RentalBookingItems"("fieldId", "start", "end");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_eventId_idx"
  ON "RentalBookingItems"("eventId");

CREATE INDEX IF NOT EXISTS "RentalBookingItems_eventTimeSlotId_idx"
  ON "RentalBookingItems"("eventTimeSlotId");
