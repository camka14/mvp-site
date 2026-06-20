import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import {
  deleteStaffScheduleAssignment,
  StaffScheduleAssignmentError,
  updateStaffScheduleAssignment,
} from '@/server/staff/scheduleAssignments';

export const dynamic = 'force-dynamic';

const timeSlotSchema = z.object({
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]).nullable().optional(),
  repeating: z.boolean().optional().nullable(),
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
  startTimeMinutes: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  endTimeMinutes: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  timeZone: z.string().trim().optional().nullable(),
}).strict();

const updateAssignmentSchema = z.object({
  userId: z.string().trim().min(1).optional().nullable(),
  facilityId: z.string().trim().min(1).optional().nullable(),
  fieldId: z.string().trim().min(1).optional().nullable(),
  rateOverrideType: z.enum(['HOURLY', 'SALARY', 'FLAT_PER_EVENT']).optional().nullable(),
  rateOverrideCents: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  timeSlot: timeSlotSchema.optional().nullable(),
  action: z.enum(['UNASSIGN']).optional().nullable(),
}).strict();

const accessDenied = async (organizationId: string, session: { userId: string; isAdmin: boolean }) => {
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return { response: NextResponse.json({ error: 'Organization not found' }, { status: 404 }) };
  }
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.STAFF_MANAGE))) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { organization };
};

const errorResponse = (error: unknown) => {
  if (error instanceof StaffScheduleAssignmentError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const session = await requireSession(req);
  const { id, assignmentId } = await params;
  const denied = await accessDenied(id, session);
  if ('response' in denied) {
    return denied.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = updateAssignmentSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const assignment = await updateStaffScheduleAssignment({
      ...parsed.data,
      organizationId: id,
      assignmentId,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ assignment }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const session = await requireSession(req);
  const { id, assignmentId } = await params;
  const denied = await accessDenied(id, session);
  if ('response' in denied) {
    return denied.response;
  }

  try {
    const result = await deleteStaffScheduleAssignment({
      organizationId: id,
      assignmentId,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
