import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import {
  createStaffScheduleAssignment,
  listStaffScheduleAssignments,
  StaffScheduleAssignmentError,
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

const createAssignmentSchema = z.object({
  parentAssignmentId: z.string().trim().min(1).optional().nullable(),
  userId: z.string().trim().min(1).optional().nullable(),
  assignmentKind: z.enum(['STAFF_SHIFT', 'OFFICIAL_SHIFT']).optional().nullable(),
  facilityId: z.string().trim().min(1).optional().nullable(),
  fieldId: z.string().trim().min(1).optional().nullable(),
  rateOverrideType: z.enum(['HOURLY', 'SALARY', 'FLAT_PER_EVENT']).optional().nullable(),
  rateOverrideCents: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  timeSlot: timeSlotSchema,
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const denied = await accessDenied(id, session);
  if ('response' in denied) {
    return denied.response;
  }

  const [assignments, facilities, fields, staffRows] = await Promise.all([
    listStaffScheduleAssignments(id, prisma),
    prisma.facilities.findMany({
      where: { organizationId: id, status: { not: 'ARCHIVED' } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.fields.findMany({
      where: { organizationId: id },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    }),
    prisma.staffMembers.findMany({
      where: { organizationId: id },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        types: true,
        roleId: true,
      },
    }),
  ]);

  const userIds = Array.from(new Set(staffRows.map((staffMember) => staffMember.userId).filter(Boolean)));
  const roleIds = Array.from(new Set(staffRows.map((staffMember) => staffMember.roleId).filter((roleId): roleId is string => Boolean(roleId))));
  const [users, roles] = await Promise.all([
    userIds.length
      ? prisma.userData.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, userName: true },
      })
      : Promise.resolve([]),
    roleIds.length
      ? prisma.organizationRoles.findMany({
        where: { organizationId: id, id: { in: roleIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const staffMembers = staffRows.map((staffMember) => {
    const user = usersById.get(staffMember.userId);
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
      || user?.userName
      || staffMember.userId;
    return {
      staffMemberId: staffMember.id,
      userId: staffMember.userId,
      fullName,
      userName: user?.userName ?? null,
      types: staffMember.types,
      roleId: staffMember.roleId,
      roleName: staffMember.roleId ? rolesById.get(staffMember.roleId)?.name ?? null : null,
    };
  });

  return NextResponse.json({ assignments, facilities, fields, staffMembers }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const denied = await accessDenied(id, session);
  if ('response' in denied) {
    return denied.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createAssignmentSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const assignment = await createStaffScheduleAssignment({
      ...parsed.data,
      organizationId: id,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
