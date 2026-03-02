CREATE TYPE "BoldSignSyncOperationTypeEnum" AS ENUM (
  'TEMPLATE_CREATE',
  'TEMPLATE_DELETE',
  'DOCUMENT_SEND'
);

CREATE TYPE "BoldSignSyncOperationStatusEnum" AS ENUM (
  'PENDING_WEBHOOK',
  'PENDING_RECONCILE',
  'CONFIRMED',
  'FAILED',
  'FAILED_RETRYABLE',
  'TIMED_OUT'
);

CREATE TABLE "BoldSignWebhookEvents" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "boldSignEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "objectType" TEXT,
  "templateId" TEXT,
  "documentId" TEXT,
  "eventTimestamp" INTEGER,
  "signatureTimestamp" INTEGER,
  "processingStatus" TEXT NOT NULL,
  "processingError" TEXT,
  "payload" JSONB NOT NULL,
  "headers" JSONB,
  CONSTRAINT "BoldSignWebhookEvents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoldSignWebhookEvents_boldSignEventId_key"
  ON "BoldSignWebhookEvents"("boldSignEventId");

CREATE INDEX "BoldSignWebhookEvents_eventType_idx"
  ON "BoldSignWebhookEvents"("eventType");

CREATE INDEX "BoldSignWebhookEvents_templateId_idx"
  ON "BoldSignWebhookEvents"("templateId");

CREATE INDEX "BoldSignWebhookEvents_documentId_idx"
  ON "BoldSignWebhookEvents"("documentId");

CREATE INDEX "BoldSignWebhookEvents_processingStatus_idx"
  ON "BoldSignWebhookEvents"("processingStatus");

CREATE TABLE "BoldSignSyncOperations" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "operationType" "BoldSignSyncOperationTypeEnum" NOT NULL,
  "status" "BoldSignSyncOperationStatusEnum" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "organizationId" TEXT,
  "eventId" TEXT,
  "templateDocumentId" TEXT,
  "signedDocumentRecordId" TEXT,
  "templateId" TEXT,
  "documentId" TEXT,
  "userId" TEXT,
  "childUserId" TEXT,
  "signerRole" TEXT,
  "signerEmail" TEXT,
  "roleIndex" INTEGER,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "payload" JSONB,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "BoldSignSyncOperations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoldSignSyncOperations_idempotencyKey_key"
  ON "BoldSignSyncOperations"("idempotencyKey");

CREATE INDEX "BoldSignSyncOperations_status_updatedAt_idx"
  ON "BoldSignSyncOperations"("status", "updatedAt");

CREATE INDEX "BoldSignSyncOperations_templateId_idx"
  ON "BoldSignSyncOperations"("templateId");

CREATE INDEX "BoldSignSyncOperations_documentId_idx"
  ON "BoldSignSyncOperations"("documentId");

CREATE INDEX "BoldSignSyncOperations_eventId_idx"
  ON "BoldSignSyncOperations"("eventId");
