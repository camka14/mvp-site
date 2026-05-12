CREATE TYPE "OrganizationsStatusEnum" AS ENUM ('LISTED', 'UNLISTED');

ALTER TABLE "Organizations"
  ADD COLUMN "status" "OrganizationsStatusEnum" NOT NULL DEFAULT 'LISTED';

CREATE INDEX "Organizations_status_idx" ON "Organizations"("status");
