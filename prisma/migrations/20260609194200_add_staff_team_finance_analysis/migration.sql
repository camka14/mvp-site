CREATE TYPE "CompensationWageTypeEnum" AS ENUM ('HOURLY', 'SALARY', 'FLAT_PER_EVENT');

CREATE TYPE "StaffLaborStatusEnum" AS ENUM ('PLANNED', 'ACTUAL', 'CANCELLED');

CREATE TYPE "FinancialLineItemScopeEnum" AS ENUM ('ORGANIZATION', 'EVENT', 'TEAM', 'EVENT_TEAM');

CREATE TYPE "FinancialLineItemStatusEnum" AS ENUM ('ESTIMATED', 'APPROVED', 'ACTUAL', 'PAID', 'VOID');

CREATE TABLE "OrganizationRoleCompensationRates" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "organizationRoleId" TEXT NOT NULL,
  "wageType" "CompensationWageTypeEnum" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "OrganizationRoleCompensationRates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffCompensationRates" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "wageType" "CompensationWageTypeEnum" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "StaffCompensationRates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventStaffAssignments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "staffMemberId" TEXT NOT NULL,
  "organizationRoleId" TEXT,
  "userId" TEXT,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "plannedMinutes" INTEGER,
  "actualMinutes" INTEGER,
  "rateOverrideType" "CompensationWageTypeEnum",
  "rateOverrideCents" INTEGER,
  "status" "StaffLaborStatusEnum" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "EventStaffAssignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamStaffLaborEntries" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT,
  "eventTeamId" TEXT,
  "eventId" TEXT,
  "staffMemberId" TEXT,
  "userId" TEXT NOT NULL,
  "teamStaffAssignmentId" TEXT,
  "eventTeamStaffAssignmentId" TEXT,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "plannedMinutes" INTEGER,
  "actualMinutes" INTEGER,
  "rateOverrideType" "CompensationWageTypeEnum",
  "rateOverrideCents" INTEGER,
  "status" "StaffLaborStatusEnum" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "TeamStaffLaborEntries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialLineItems" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT,
  "teamId" TEXT,
  "eventTeamId" TEXT,
  "scope" "FinancialLineItemScopeEnum" NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amountCents" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION,
  "unitLabel" TEXT,
  "status" "FinancialLineItemStatusEnum" NOT NULL DEFAULT 'ACTUAL',
  "occurredAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  CONSTRAINT "FinancialLineItems_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationRoleCompensationRates_organizationId_idx" ON "OrganizationRoleCompensationRates"("organizationId");
CREATE INDEX "OrganizationRoleCompensationRates_organizationRoleId_idx" ON "OrganizationRoleCompensationRates"("organizationRoleId");
CREATE INDEX "OrgRoleCompRates_role_effectiveFrom_idx" ON "OrganizationRoleCompensationRates"("organizationRoleId", "effectiveFrom");
CREATE INDEX "OrgRoleCompRates_role_effectiveTo_idx" ON "OrganizationRoleCompensationRates"("organizationRoleId", "effectiveTo");

CREATE INDEX "StaffCompensationRates_organizationId_idx" ON "StaffCompensationRates"("organizationId");
CREATE INDEX "StaffCompensationRates_staffMemberId_idx" ON "StaffCompensationRates"("staffMemberId");
CREATE INDEX "StaffCompensationRates_staffMemberId_effectiveFrom_idx" ON "StaffCompensationRates"("staffMemberId", "effectiveFrom");
CREATE INDEX "StaffCompensationRates_staffMemberId_effectiveTo_idx" ON "StaffCompensationRates"("staffMemberId", "effectiveTo");

CREATE INDEX "EventStaffAssignments_organizationId_idx" ON "EventStaffAssignments"("organizationId");
CREATE INDEX "EventStaffAssignments_eventId_idx" ON "EventStaffAssignments"("eventId");
CREATE INDEX "EventStaffAssignments_staffMemberId_idx" ON "EventStaffAssignments"("staffMemberId");
CREATE INDEX "EventStaffAssignments_organizationRoleId_idx" ON "EventStaffAssignments"("organizationRoleId");
CREATE INDEX "EventStaffAssignments_status_idx" ON "EventStaffAssignments"("status");

CREATE INDEX "TeamStaffLaborEntries_organizationId_idx" ON "TeamStaffLaborEntries"("organizationId");
CREATE INDEX "TeamStaffLaborEntries_teamId_idx" ON "TeamStaffLaborEntries"("teamId");
CREATE INDEX "TeamStaffLaborEntries_eventTeamId_idx" ON "TeamStaffLaborEntries"("eventTeamId");
CREATE INDEX "TeamStaffLaborEntries_eventId_idx" ON "TeamStaffLaborEntries"("eventId");
CREATE INDEX "TeamStaffLaborEntries_staffMemberId_idx" ON "TeamStaffLaborEntries"("staffMemberId");
CREATE INDEX "TeamStaffLaborEntries_userId_idx" ON "TeamStaffLaborEntries"("userId");
CREATE INDEX "TeamStaffLaborEntries_teamStaffAssignmentId_idx" ON "TeamStaffLaborEntries"("teamStaffAssignmentId");
CREATE INDEX "TeamStaffLaborEntries_eventTeamStaffAssignmentId_idx" ON "TeamStaffLaborEntries"("eventTeamStaffAssignmentId");
CREATE INDEX "TeamStaffLaborEntries_status_idx" ON "TeamStaffLaborEntries"("status");

CREATE INDEX "FinancialLineItems_organizationId_idx" ON "FinancialLineItems"("organizationId");
CREATE INDEX "FinancialLineItems_eventId_idx" ON "FinancialLineItems"("eventId");
CREATE INDEX "FinancialLineItems_teamId_idx" ON "FinancialLineItems"("teamId");
CREATE INDEX "FinancialLineItems_eventTeamId_idx" ON "FinancialLineItems"("eventTeamId");
CREATE INDEX "FinancialLineItems_scope_idx" ON "FinancialLineItems"("scope");
CREATE INDEX "FinancialLineItems_category_idx" ON "FinancialLineItems"("category");
CREATE INDEX "FinancialLineItems_status_idx" ON "FinancialLineItems"("status");
CREATE INDEX "FinancialLineItems_occurredAt_idx" ON "FinancialLineItems"("occurredAt");
