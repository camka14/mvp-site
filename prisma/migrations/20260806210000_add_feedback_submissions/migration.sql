CREATE TYPE "FeedbackSubmissionTypeEnum" AS ENUM ('BUG', 'IDEA', 'GENERAL');

CREATE TYPE "FeedbackSubmissionStatusEnum" AS ENUM ('NEW', 'IN_REVIEW', 'PLANNED', 'CLOSED');

CREATE TABLE "FeedbackSubmissions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "FeedbackSubmissionTypeEnum" NOT NULL,
    "status" "FeedbackSubmissionStatusEnum" NOT NULL DEFAULT 'NEW',
    "message" TEXT NOT NULL,
    "additionalContext" TEXT,
    "submitterUserId" TEXT,
    "allowContact" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT,
    "sourcePath" TEXT,
    "userAgent" TEXT,
    "clientContext" JSONB NOT NULL DEFAULT '{}',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,

    CONSTRAINT "FeedbackSubmissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackSubmissions_status_createdAt_idx"
    ON "FeedbackSubmissions"("status", "createdAt");

CREATE INDEX "FeedbackSubmissions_type_status_createdAt_idx"
    ON "FeedbackSubmissions"("type", "status", "createdAt");

CREATE INDEX "FeedbackSubmissions_submitterUserId_createdAt_idx"
    ON "FeedbackSubmissions"("submitterUserId", "createdAt");
