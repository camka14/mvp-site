CREATE TYPE "OrganizationAccountingProviderEnum" AS ENUM ('QUICKBOOKS_ONLINE');

CREATE TYPE "OrganizationAccountingConnectionStatusEnum" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');

CREATE TABLE "OrganizationAccountingConnections" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "OrganizationAccountingProviderEnum" NOT NULL,
    "status" "OrganizationAccountingConnectionStatusEnum" NOT NULL DEFAULT 'CONNECTED',
    "externalCompanyId" TEXT,
    "externalCompanyName" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenType" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenHardExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "connectedByUserId" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "disconnectedByUserId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "OrganizationAccountingConnections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationAccountingConnections_organizationId_provider_key"
    ON "OrganizationAccountingConnections"("organizationId", "provider");

CREATE INDEX "OrganizationAccountingConnections_organizationId_idx"
    ON "OrganizationAccountingConnections"("organizationId");

CREATE INDEX "OrganizationAccountingConnections_provider_externalCompanyId_idx"
    ON "OrganizationAccountingConnections"("provider", "externalCompanyId");

CREATE INDEX "OrganizationAccountingConnections_status_idx"
    ON "OrganizationAccountingConnections"("status");

CREATE INDEX "OrganizationAccountingConnections_connectedByUserId_idx"
    ON "OrganizationAccountingConnections"("connectedByUserId");

CREATE INDEX "OrganizationAccountingConnections_disconnectedByUserId_idx"
    ON "OrganizationAccountingConnections"("disconnectedByUserId");
