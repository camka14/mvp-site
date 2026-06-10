-- CreateEnum
CREATE TYPE "StaffPayRunStatusEnum" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "StaffPayRunItemStatusEnum" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "StaffPayoutStatusEnum" AS ENUM ('NOT_STARTED', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StaffPayRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "StaffPayRunStatusEnum" NOT NULL DEFAULT 'DRAFT',
    "payoutStatus" "StaffPayoutStatusEnum" NOT NULL DEFAULT 'NOT_STARTED',
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "payoutProvider" TEXT,
    "payoutProviderBatchId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "StaffPayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPayRunItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payRunId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "teamId" TEXT,
    "eventTeamId" TEXT,
    "eventStaffAssignmentId" TEXT,
    "teamStaffLaborEntryId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "wageType" "CompensationWageTypeEnum",
    "rateCents" INTEGER,
    "paidMinutes" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "serviceStartAt" TIMESTAMP(3),
    "serviceEndAt" TIMESTAMP(3),
    "status" "StaffPayRunItemStatusEnum" NOT NULL DEFAULT 'DRAFT',
    "payoutStatus" "StaffPayoutStatusEnum" NOT NULL DEFAULT 'NOT_STARTED',
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "payoutProvider" TEXT,
    "payoutProviderTransferId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "StaffPayRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffPayRun_organizationId_idx" ON "StaffPayRun"("organizationId");

-- CreateIndex
CREATE INDEX "StaffPayRun_periodStart_idx" ON "StaffPayRun"("periodStart");

-- CreateIndex
CREATE INDEX "StaffPayRun_periodEnd_idx" ON "StaffPayRun"("periodEnd");

-- CreateIndex
CREATE INDEX "StaffPayRun_status_idx" ON "StaffPayRun"("status");

-- CreateIndex
CREATE INDEX "StaffPayRun_payoutStatus_idx" ON "StaffPayRun"("payoutStatus");

-- CreateIndex
CREATE INDEX "StaffPayRun_approvedByUserId_idx" ON "StaffPayRun"("approvedByUserId");

-- CreateIndex
CREATE INDEX "StaffPayRun_paidByUserId_idx" ON "StaffPayRun"("paidByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayRunItem_eventStaffAssignmentId_key" ON "StaffPayRunItem"("eventStaffAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayRunItem_teamStaffLaborEntryId_key" ON "StaffPayRunItem"("teamStaffLaborEntryId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_payRunId_idx" ON "StaffPayRunItem"("payRunId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_organizationId_idx" ON "StaffPayRunItem"("organizationId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_staffMemberId_idx" ON "StaffPayRunItem"("staffMemberId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_userId_idx" ON "StaffPayRunItem"("userId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_eventId_idx" ON "StaffPayRunItem"("eventId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_teamId_idx" ON "StaffPayRunItem"("teamId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_eventTeamId_idx" ON "StaffPayRunItem"("eventTeamId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_status_idx" ON "StaffPayRunItem"("status");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_payoutStatus_idx" ON "StaffPayRunItem"("payoutStatus");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_serviceStartAt_idx" ON "StaffPayRunItem"("serviceStartAt");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_serviceEndAt_idx" ON "StaffPayRunItem"("serviceEndAt");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_approvedByUserId_idx" ON "StaffPayRunItem"("approvedByUserId");

-- CreateIndex
CREATE INDEX "StaffPayRunItem_paidByUserId_idx" ON "StaffPayRunItem"("paidByUserId");
