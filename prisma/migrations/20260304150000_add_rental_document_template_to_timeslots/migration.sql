-- Add optional rental document template assignment for rental checkout signing.
ALTER TABLE "TimeSlots"
ADD COLUMN "rentalDocumentTemplateId" TEXT;
