CREATE TYPE "OrganizationOriginTypeEnum" AS ENUM (
  'FIRST_PARTY',
  'AFFILIATE_IMPORTED'
);

CREATE TYPE "OrganizationOwnershipStatusEnum" AS ENUM (
  'UNCLAIMED',
  'CLAIM_PENDING',
  'CLAIMED',
  'REVIEW_REQUIRED',
  'DISPUTED',
  'SUSPENDED'
);

CREATE TYPE "OrganizationClaimStatusEnum" AS ENUM (
  'PENDING_VERIFICATION',
  'PENDING_MANUAL_REVIEW',
  'APPROVED_PENDING_ACCEPTANCE',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'DISPUTED',
  'REVOKED',
  'EXPIRED'
);

CREATE TYPE "OrganizationClaimMethodEnum" AS ENUM (
  'DOMAIN_EMAIL',
  'DNS_TXT',
  'HTML_META',
  'MANUAL_REVIEW',
  'LEGACY_OWNER'
);

CREATE TYPE "OrganizationClaimRequestTypeEnum" AS ENUM (
  'INITIAL_CLAIM',
  'OWNERSHIP_TRANSFER',
  'OWNERSHIP_DISPUTE',
  'DUPLICATE_PROFILE_REVIEW'
);

CREATE TYPE "OrganizationOwnershipIssueReasonEnum" AS ENUM (
  'FORMER_REPRESENTATIVE',
  'OWNER_UNAVAILABLE',
  'UNAUTHORIZED_OR_MISLEADING_CLAIM',
  'DUPLICATE_OR_INCORRECT_PROFILE',
  'OTHER'
);

CREATE TYPE "OrganizationOwnershipRequestedOutcomeEnum" AS ENUM (
  'OWNERSHIP_TRANSFER',
  'REVIEW_OR_REVOKE_CLAIM',
  'MERGE_OR_CORRECT_PROFILE'
);

CREATE TYPE "OrganizationOwnershipResolutionEnum" AS ENUM (
  'UPHOLD_CURRENT_OWNER',
  'INITIATE_OWNERSHIP_TRANSFER',
  'REVOKE_TO_UNCLAIMED',
  'SUSPEND_OWNER_ACCESS',
  'MERGE_OR_CORRECT_PROFILE'
);

CREATE TYPE "OrganizationClaimEvidenceStatusEnum" AS ENUM (
  'PENDING',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'REVOKED'
);

CREATE TYPE "OrganizationClaimVerificationLevelEnum" AS ENUM (
  'NONE',
  'AFFILIATION',
  'SITE_CONTROL',
  'MANUAL_REVIEW'
);

ALTER TYPE "AuthMfaChallengePurposeEnum"
  ADD VALUE 'ORGANIZATION_CLAIM';

ALTER TABLE "Organizations"
  ADD COLUMN "originType" "OrganizationOriginTypeEnum" NOT NULL DEFAULT 'FIRST_PARTY',
  ADD COLUMN "ownershipStatus" "OrganizationOwnershipStatusEnum" NOT NULL DEFAULT 'CLAIMED',
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "claimedByUserId" TEXT,
  ADD COLUMN "claimVerificationLevel" "OrganizationClaimVerificationLevelEnum" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "ownershipVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "ownershipVerificationLastCheckedAt" TIMESTAMP(3);

ALTER TABLE "OrganizationReviews"
  ADD COLUMN "hiddenReason" TEXT;

CREATE TABLE "OrganizationDomains" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "registrableDomain" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isSharedPlatform" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),

  CONSTRAINT "OrganizationDomains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationClaims" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "claimantUserId" TEXT NOT NULL,
  "requestType" "OrganizationClaimRequestTypeEnum" NOT NULL,
  "status" "OrganizationClaimStatusEnum" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "method" "OrganizationClaimMethodEnum" NOT NULL,
  "verificationLevel" "OrganizationClaimVerificationLevelEnum" NOT NULL DEFAULT 'NONE',
  "organizationDomainId" TEXT,
  "verificationEmail" TEXT,
  "verificationEmailDomain" TEXT,
  "roleTitle" TEXT,
  "explanation" TEXT,
  "publicEvidenceUrl" TEXT,
  "officialContactName" TEXT,
  "officialContactEmail" TEXT,
  "officialContactPhone" TEXT,
  "officialContactUrl" TEXT,
  "submittedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "internalDecisionNotes" TEXT,
  "userDecisionMessage" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revocationReason" TEXT,
  "issueReason" "OrganizationOwnershipIssueReasonEnum",
  "requestedOutcome" "OrganizationOwnershipRequestedOutcomeEnum",
  "resolution" "OrganizationOwnershipResolutionEnum",
  "parentRequestId" TEXT,
  "currentOwnerNotifiedAt" TIMESTAMP(3),
  "currentOwnerResponseDueAt" TIMESTAMP(3),
  "currentOwnerRespondedAt" TIMESTAMP(3),
  "currentOwnerResponse" TEXT,
  "currentOwnerPublicEvidenceUrl" TEXT,
  "credibilityDecidedAt" TIMESTAMP(3),
  "credibilityDecidedByUserId" TEXT,
  "responseExtensionUntil" TIMESTAMP(3),
  "responseExtensionGrantedByUserId" TEXT,
  "certifiedAt" TIMESTAMP(3),
  "currentOwnerApprovedAt" TIMESTAMP(3),
  "currentOwnerApprovedByUserId" TEXT,

  CONSTRAINT "OrganizationClaims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationClaimEvidence" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "claimId" TEXT NOT NULL,
  "method" "OrganizationClaimMethodEnum" NOT NULL,
  "status" "OrganizationClaimEvidenceStatusEnum" NOT NULL DEFAULT 'PENDING',
  "secretHash" TEXT,
  "challengeValue" TEXT,
  "expiresAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "metadata" JSONB,

  CONSTRAINT "OrganizationClaimEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationClaimEvents" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "claimId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "metadata" JSONB,

  CONSTRAINT "OrganizationClaimEvents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationReviewResponses" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "organizationReviewId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "responderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "OrganizationReviewStatusEnum" NOT NULL DEFAULT 'PUBLISHED',
  "hiddenAt" TIMESTAMP(3),
  "hiddenByUserId" TEXT,
  "hiddenReason" TEXT,

  CONSTRAINT "OrganizationReviewResponses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationDomains_organizationId_isPrimary_idx"
  ON "OrganizationDomains"("organizationId", "isPrimary");
CREATE INDEX "OrganizationDomains_registrableDomain_idx"
  ON "OrganizationDomains"("registrableDomain");
CREATE UNIQUE INDEX "OrganizationDomains_organizationId_host_key"
  ON "OrganizationDomains"("organizationId", "host");
CREATE UNIQUE INDEX "OrganizationDomains_primary_organization_key"
  ON "OrganizationDomains"("organizationId")
  WHERE "isPrimary" = true;

CREATE INDEX "OrganizationClaims_organizationId_status_idx"
  ON "OrganizationClaims"("organizationId", "status");
CREATE INDEX "OrganizationClaims_organizationId_requestType_status_idx"
  ON "OrganizationClaims"("organizationId", "requestType", "status");
CREATE INDEX "OrganizationClaims_claimantUserId_status_idx"
  ON "OrganizationClaims"("claimantUserId", "status");
CREATE INDEX "OrganizationClaims_organizationDomainId_idx"
  ON "OrganizationClaims"("organizationDomainId");
CREATE INDEX "OrganizationClaims_parentRequestId_idx"
  ON "OrganizationClaims"("parentRequestId");
CREATE INDEX "OrganizationClaims_expiresAt_idx"
  ON "OrganizationClaims"("expiresAt");
CREATE UNIQUE INDEX "OrganizationClaims_active_initial_organization_key"
  ON "OrganizationClaims"("organizationId")
  WHERE "requestType" = 'INITIAL_CLAIM'
    AND "status" IN (
      'PENDING_VERIFICATION',
      'PENDING_MANUAL_REVIEW',
      'APPROVED_PENDING_ACCEPTANCE'
    );
CREATE UNIQUE INDEX "OrganizationClaims_active_requester_organization_key"
  ON "OrganizationClaims"("organizationId", "claimantUserId")
  WHERE "status" IN (
    'PENDING_VERIFICATION',
    'PENDING_MANUAL_REVIEW',
    'APPROVED_PENDING_ACCEPTANCE',
    'DISPUTED'
  );

CREATE INDEX "OrganizationClaimEvidence_claimId_status_idx"
  ON "OrganizationClaimEvidence"("claimId", "status");
CREATE INDEX "OrganizationClaimEvidence_expiresAt_idx"
  ON "OrganizationClaimEvidence"("expiresAt");

CREATE INDEX "OrganizationClaimEvents_organizationId_createdAt_idx"
  ON "OrganizationClaimEvents"("organizationId", "createdAt");
CREATE INDEX "OrganizationClaimEvents_claimId_createdAt_idx"
  ON "OrganizationClaimEvents"("claimId", "createdAt");
CREATE INDEX "OrganizationClaimEvents_actorUserId_idx"
  ON "OrganizationClaimEvents"("actorUserId");

CREATE UNIQUE INDEX "OrganizationReviewResponses_organizationReviewId_key"
  ON "OrganizationReviewResponses"("organizationReviewId");
CREATE INDEX "OrganizationReviewResponses_organizationId_status_updatedAt_idx"
  ON "OrganizationReviewResponses"("organizationId", "status", "updatedAt");
CREATE INDEX "OrganizationReviewResponses_responderUserId_idx"
  ON "OrganizationReviewResponses"("responderUserId");

CREATE INDEX "Organizations_originType_idx"
  ON "Organizations"("originType");
CREATE INDEX "Organizations_ownershipStatus_idx"
  ON "Organizations"("ownershipStatus");
CREATE INDEX "Organizations_originType_ownershipStatus_idx"
  ON "Organizations"("originType", "ownershipStatus");
