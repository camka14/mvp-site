-- Add website phone MFA state and short-lived challenge records.

CREATE TYPE "AuthMfaChallengePurposeEnum" AS ENUM ('LOGIN', 'LOGIN_SETUP', 'PROFILE_PHONE_SETUP');

ALTER TABLE "SensitiveUserData"
ADD COLUMN "phoneNumberE164" TEXT,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN "phoneVerificationProvider" TEXT,
ADD COLUMN "phoneVerificationLastSentAt" TIMESTAMP(3),
ADD COLUMN "phoneVerificationAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "financialMfaRequiredAt" TIMESTAMP(3),
ADD COLUMN "financialMfaSatisfiedAt" TIMESTAMP(3);

CREATE INDEX "SensitiveUserData_userId_idx" ON "SensitiveUserData"("userId");
CREATE INDEX "SensitiveUserData_phoneVerifiedAt_idx" ON "SensitiveUserData"("phoneVerifiedAt");

CREATE TABLE "AuthMfaChallenges" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "AuthMfaChallengePurposeEnum" NOT NULL,
  "phoneNumberE164" TEXT,
  "provider" TEXT NOT NULL,
  "providerChallengeId" TEXT,
  "devCodeHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "verificationIpHash" TEXT,
  "verificationUserAgent" TEXT,

  CONSTRAINT "AuthMfaChallenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthMfaChallenges_userId_purpose_consumedAt_idx" ON "AuthMfaChallenges"("userId", "purpose", "consumedAt");
CREATE INDEX "AuthMfaChallenges_expiresAt_idx" ON "AuthMfaChallenges"("expiresAt");
