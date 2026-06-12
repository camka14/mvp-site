CREATE TYPE "FinanceCategoryAccountingEntryTypeEnum" AS ENUM ('REVENUE', 'EXPENSE', 'LIABILITY', 'ASSET');

CREATE TABLE "OrganizationFinanceCategoryAccountingMappings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "OrganizationAccountingProviderEnum" NOT NULL,
    "category" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "entryType" "FinanceCategoryAccountingEntryTypeEnum" NOT NULL,
    "accountExternalId" TEXT,
    "accountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "OrganizationFinanceCategoryAccountingMappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationFinanceCategoryAccountingMappings_organizationId_provider_categoryKey_entryType_key"
    ON "OrganizationFinanceCategoryAccountingMappings"("organizationId", "provider", "categoryKey", "entryType");

CREATE INDEX "OrganizationFinanceCategoryAccountingMappings_organizationId_idx"
    ON "OrganizationFinanceCategoryAccountingMappings"("organizationId");

CREATE INDEX "OrganizationFinanceCategoryAccountingMappings_provider_idx"
    ON "OrganizationFinanceCategoryAccountingMappings"("provider");

CREATE INDEX "OrganizationFinanceCategoryAccountingMappings_categoryKey_idx"
    ON "OrganizationFinanceCategoryAccountingMappings"("categoryKey");

CREATE INDEX "OrganizationFinanceCategoryAccountingMappings_entryType_idx"
    ON "OrganizationFinanceCategoryAccountingMappings"("entryType");

CREATE INDEX "OrganizationFinanceCategoryAccountingMappings_isActive_idx"
    ON "OrganizationFinanceCategoryAccountingMappings"("isActive");
