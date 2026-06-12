-- Add website authenticator app MFA state.

ALTER TYPE "AuthMfaChallengePurposeEnum" ADD VALUE 'PROFILE_TOTP_SETUP';

ALTER TABLE "SensitiveUserData"
ADD COLUMN "totpSecretEncrypted" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpVerifiedAt" TIMESTAMP(3),
ADD COLUMN "totpLastUsedCounter" INTEGER,
ADD COLUMN "totpProvider" TEXT;

ALTER TABLE "AuthMfaChallenges"
ADD COLUMN "totpSecretEncrypted" TEXT;

CREATE INDEX "SensitiveUserData_totpEnabledAt_idx" ON "SensitiveUserData"("totpEnabledAt");
