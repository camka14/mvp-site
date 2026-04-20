DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'OrganizationsVerificationStatusEnum'
  ) THEN
    CREATE TYPE "OrganizationsVerificationStatusEnum" AS ENUM (
      'UNVERIFIED',
      'LEGACY_CONNECTED',
      'PENDING',
      'ACTION_REQUIRED',
      'VERIFIED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'OrganizationsVerificationReviewStatusEnum'
  ) THEN
    CREATE TYPE "OrganizationsVerificationReviewStatusEnum" AS ENUM (
      'NONE',
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'StripeAccountsAccountOriginEnum'
  ) THEN
    CREATE TYPE "StripeAccountsAccountOriginEnum" AS ENUM (
      'LEGACY_OAUTH',
      'PLATFORM_ONBOARDING'
    );
  END IF;
END
$$;

ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "verificationStatus" "OrganizationsVerificationStatusEnum" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationReviewStatus" "OrganizationsVerificationReviewStatusEnum" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "verificationReviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationReviewUpdatedAt" TIMESTAMP(3);

ALTER TABLE "StripeAccounts"
  ADD COLUMN IF NOT EXISTS "accountOrigin" "StripeAccountsAccountOriginEnum",
  ADD COLUMN IF NOT EXISTS "accountType" TEXT,
  ADD COLUMN IF NOT EXISTS "isActiveForBilling" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "detailsSubmitted" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "chargesEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "payoutsEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "requirementsCurrentlyDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "requirementsPastDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "requirementsEventuallyDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "requirementsDisabledReason" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationLastSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Organizations_verificationStatus_idx"
  ON "Organizations" ("verificationStatus");

CREATE INDEX IF NOT EXISTS "Organizations_verificationReviewStatus_idx"
  ON "Organizations" ("verificationReviewStatus");

CREATE INDEX IF NOT EXISTS "StripeAccounts_organizationId_updatedAt_idx"
  ON "StripeAccounts" ("organizationId", "updatedAt");

CREATE INDEX IF NOT EXISTS "StripeAccounts_organizationId_accountOrigin_idx"
  ON "StripeAccounts" ("organizationId", "accountOrigin");

CREATE INDEX IF NOT EXISTS "StripeAccounts_organizationId_isActiveForBilling_idx"
  ON "StripeAccounts" ("organizationId", "isActiveForBilling");

CREATE INDEX IF NOT EXISTS "StripeAccounts_userId_updatedAt_idx"
  ON "StripeAccounts" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "StripeAccounts_accountId_idx"
  ON "StripeAccounts" ("accountId");
