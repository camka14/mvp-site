CREATE TYPE "AccountingSyncSourceTypeEnum" AS ENUM ('STAFF_PAY_RUN');

CREATE TYPE "AccountingSyncStatusEnum" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'REAUTH_REQUIRED', 'VOID');

ALTER TABLE "OrganizationAccountingConnections"
ADD COLUMN "lastIntuitTid" TEXT,
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "payrollExpenseAccountExternalId" TEXT,
ADD COLUMN "payrollExpenseAccountName" TEXT,
ADD COLUMN "payrollLiabilityAccountExternalId" TEXT,
ADD COLUMN "payrollLiabilityAccountName" TEXT;

CREATE TABLE "AccountingSyncRecords" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "OrganizationAccountingProviderEnum" NOT NULL,
    "sourceType" "AccountingSyncSourceTypeEnum" NOT NULL,
    "staffPayRunId" TEXT,
    "status" "AccountingSyncStatusEnum" NOT NULL DEFAULT 'PENDING',
    "externalTxnId" TEXT,
    "externalTxnType" TEXT,
    "externalTxnDocNumber" TEXT,
    "intuitTid" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "syncedAt" TIMESTAMP(3),
    "syncedByUserId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "AccountingSyncRecords_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingSyncRecords_provider_sourceType_staffPayRunId_key"
    ON "AccountingSyncRecords"("provider", "sourceType", "staffPayRunId");

CREATE INDEX "AccountingSyncRecords_organizationId_idx"
    ON "AccountingSyncRecords"("organizationId");

CREATE INDEX "AccountingSyncRecords_provider_idx"
    ON "AccountingSyncRecords"("provider");

CREATE INDEX "AccountingSyncRecords_sourceType_idx"
    ON "AccountingSyncRecords"("sourceType");

CREATE INDEX "AccountingSyncRecords_staffPayRunId_idx"
    ON "AccountingSyncRecords"("staffPayRunId");

CREATE INDEX "AccountingSyncRecords_status_idx"
    ON "AccountingSyncRecords"("status");

CREATE INDEX "AccountingSyncRecords_syncedByUserId_idx"
    ON "AccountingSyncRecords"("syncedByUserId");
