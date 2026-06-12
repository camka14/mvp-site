ALTER TABLE "OrganizationAccountingConnections"
ADD COLUMN "externalCompanyIdEncrypted" TEXT;

UPDATE "OrganizationAccountingConnections"
SET "externalCompanyId" = NULL
WHERE "provider" = 'QUICKBOOKS_ONLINE';
