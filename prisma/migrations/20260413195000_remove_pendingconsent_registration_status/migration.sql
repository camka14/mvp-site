UPDATE "EventRegistrations"
SET "status" = 'STARTED'
WHERE "status"::text = 'PENDINGCONSENT';

ALTER TYPE "EventRegistrationsStatusEnum" RENAME TO "EventRegistrationsStatusEnum_old";

CREATE TYPE "EventRegistrationsStatusEnum" AS ENUM (
  'STARTED',
  'ACTIVE',
  'BLOCKED',
  'CANCELLED',
  'CONSENTFAILED'
);

ALTER TABLE "EventRegistrations"
  ALTER COLUMN "status" TYPE "EventRegistrationsStatusEnum"
  USING ("status"::text::"EventRegistrationsStatusEnum");

DROP TYPE "EventRegistrationsStatusEnum_old";
