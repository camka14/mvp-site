ALTER TYPE "ModerationReportTargetTypeEnum" ADD VALUE IF NOT EXISTS 'ORGANIZATION_REVIEW';

CREATE TYPE "OrganizationReviewStatusEnum" AS ENUM ('PUBLISHED', 'HIDDEN');

CREATE TABLE "OrganizationReviews" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "body" TEXT,
  "status" "OrganizationReviewStatusEnum" NOT NULL DEFAULT 'PUBLISHED',
  "hiddenAt" TIMESTAMP(3),
  "hiddenByUserId" TEXT,

  CONSTRAINT "OrganizationReviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationReviews_organizationId_reviewerUserId_key"
  ON "OrganizationReviews"("organizationId", "reviewerUserId");

CREATE INDEX "OrganizationReviews_organizationId_status_updatedAt_idx"
  ON "OrganizationReviews"("organizationId", "status", "updatedAt");

CREATE INDEX "OrganizationReviews_reviewerUserId_idx"
  ON "OrganizationReviews"("reviewerUserId");

ALTER TABLE "OrganizationReviews"
  ADD CONSTRAINT "OrganizationReviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
