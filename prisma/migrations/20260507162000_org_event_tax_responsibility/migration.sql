ALTER TABLE "Organizations"
  ADD COLUMN "taxOrganizationType" TEXT NOT NULL DEFAULT 'INDIVIDUAL_OR_CLUB',
  ADD COLUMN "operatesAthleticFacility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultEventTaxHandling" TEXT NOT NULL DEFAULT 'STRIPE_TAX',
  ADD COLUMN "defaultRentalTaxHandling" TEXT NOT NULL DEFAULT 'STRIPE_TAX',
  ADD COLUMN "taxResponsibilityAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "taxResponsibilityAcceptedByUserId" TEXT,
  ADD COLUMN "taxResponsibilityAgreementVersion" TEXT;

ALTER TABLE "Events"
  ADD COLUMN "taxHandling" TEXT NOT NULL DEFAULT 'INHERIT_ORG';

ALTER TABLE "TimeSlots"
  ADD COLUMN "taxHandling" TEXT NOT NULL DEFAULT 'STRIPE_TAX';
