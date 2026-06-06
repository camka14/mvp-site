CREATE TYPE "TeamJoinPolicyEnum" AS ENUM ('CLOSED', 'OPEN_REGISTRATION', 'REQUEST_TO_JOIN');

CREATE TYPE "RegistrationQuestionScopeTypeEnum" AS ENUM ('TEAM', 'EVENT');

CREATE TYPE "RegistrationQuestionAnswerTypeEnum" AS ENUM ('TEXT', 'LONG_TEXT');

CREATE TYPE "RegistrationQuestionResponseSubjectTypeEnum" AS ENUM ('TEAM_JOIN_REQUEST', 'TEAM_REGISTRATION', 'EVENT_REGISTRATION');

CREATE TYPE "TeamJoinRequestStatusEnum" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CANCELLED');

CREATE TYPE "TeamJoinRequestRegistrantTypeEnum" AS ENUM ('SELF', 'CHILD');

ALTER TABLE "Teams"
  ADD COLUMN "joinPolicy" "TeamJoinPolicyEnum" NOT NULL DEFAULT 'CLOSED';

UPDATE "Teams"
SET "joinPolicy" = CASE
  WHEN "openRegistration" = true THEN 'OPEN_REGISTRATION'::"TeamJoinPolicyEnum"
  ELSE 'CLOSED'::"TeamJoinPolicyEnum"
END;

CREATE TABLE "RegistrationQuestions" (
  "id" TEXT NOT NULL,
  "scopeType" "RegistrationQuestionScopeTypeEnum" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "answerType" "RegistrationQuestionAnswerTypeEnum" NOT NULL DEFAULT 'TEXT',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "RegistrationQuestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationQuestionResponses" (
  "id" TEXT NOT NULL,
  "scopeType" "RegistrationQuestionScopeTypeEnum" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "subjectType" "RegistrationQuestionResponseSubjectTypeEnum" NOT NULL,
  "subjectId" TEXT NOT NULL,
  "responderUserId" TEXT NOT NULL,
  "registrantUserId" TEXT NOT NULL,
  "registrantType" TEXT NOT NULL,
  "answersSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationQuestionResponses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamJoinRequests" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "registrantUserId" TEXT NOT NULL,
  "parentId" TEXT,
  "registrantType" "TeamJoinRequestRegistrantTypeEnum" NOT NULL DEFAULT 'SELF',
  "status" "TeamJoinRequestStatusEnum" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "approvedRegistrationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamJoinRequests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Teams_joinPolicy_idx" ON "Teams"("joinPolicy");

CREATE INDEX "RegistrationQuestions_scopeType_scopeId_isActive_idx" ON "RegistrationQuestions"("scopeType", "scopeId", "isActive");
CREATE INDEX "RegistrationQuestions_scopeType_scopeId_sortOrder_idx" ON "RegistrationQuestions"("scopeType", "scopeId", "sortOrder");
CREATE INDEX "RegistrationQuestions_createdBy_idx" ON "RegistrationQuestions"("createdBy");

CREATE UNIQUE INDEX "RegistrationQuestionResponses_subjectType_subjectId_key" ON "RegistrationQuestionResponses"("subjectType", "subjectId");
CREATE INDEX "RegistrationQuestionResponses_scopeType_scopeId_idx" ON "RegistrationQuestionResponses"("scopeType", "scopeId");
CREATE INDEX "RegistrationQuestionResponses_responderUserId_idx" ON "RegistrationQuestionResponses"("responderUserId");
CREATE INDEX "RegistrationQuestionResponses_registrantUserId_idx" ON "RegistrationQuestionResponses"("registrantUserId");

CREATE INDEX "TeamJoinRequests_teamId_status_idx" ON "TeamJoinRequests"("teamId", "status");
CREATE INDEX "TeamJoinRequests_registrantUserId_status_idx" ON "TeamJoinRequests"("registrantUserId", "status");
CREATE INDEX "TeamJoinRequests_requesterUserId_status_idx" ON "TeamJoinRequests"("requesterUserId", "status");
