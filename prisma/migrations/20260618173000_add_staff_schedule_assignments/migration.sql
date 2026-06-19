-- CreateEnum
CREATE TYPE "StaffScheduleAssignmentKindEnum" AS ENUM ('STAFF_SHIFT', 'OFFICIAL_SHIFT');

-- CreateTable
CREATE TABLE "StaffScheduleAssignments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentAssignmentId" TEXT,
    "staffMemberId" TEXT,
    "organizationRoleId" TEXT,
    "userId" TEXT,
    "assignmentKind" "StaffScheduleAssignmentKindEnum" NOT NULL DEFAULT 'STAFF_SHIFT',
    "facilityId" TEXT,
    "fieldId" TEXT,
    "timeSlotId" TEXT NOT NULL,
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

    CONSTRAINT "StaffScheduleAssignments_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StaffPayRunItem" ADD COLUMN "staffScheduleAssignmentId" TEXT,
ADD COLUMN "staffScheduleOccurrenceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffScheduleAssignments_timeSlotId_key" ON "StaffScheduleAssignments"("timeSlotId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_organizationId_idx" ON "StaffScheduleAssignments"("organizationId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_parentAssignmentId_idx" ON "StaffScheduleAssignments"("parentAssignmentId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_staffMemberId_idx" ON "StaffScheduleAssignments"("staffMemberId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_organizationRoleId_idx" ON "StaffScheduleAssignments"("organizationRoleId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_userId_idx" ON "StaffScheduleAssignments"("userId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_assignmentKind_idx" ON "StaffScheduleAssignments"("assignmentKind");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_facilityId_idx" ON "StaffScheduleAssignments"("facilityId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_fieldId_idx" ON "StaffScheduleAssignments"("fieldId");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_status_idx" ON "StaffScheduleAssignments"("status");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_plannedStart_idx" ON "StaffScheduleAssignments"("plannedStart");

-- CreateIndex
CREATE INDEX "StaffScheduleAssignments_plannedEnd_idx" ON "StaffScheduleAssignments"("plannedEnd");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayRunItem_staffScheduleOccurrenceKey_key" ON "StaffPayRunItem"("staffScheduleOccurrenceKey");
