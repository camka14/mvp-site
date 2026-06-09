import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canAccessTeamFinance } from '@/server/finance/financeAccess';
import { createTeamStaffLaborEntry, FinanceMutationError } from '@/server/finance/financeMutations';
import { ensureDefaultOrganizationRoles } from '@/server/organizationRoles';
import { normalizeId } from '@/server/teams/teamMembership';

export const dynamic = 'force-dynamic';

const teamStaffSchema = z.object({
  userId: z.string().trim().min(1),
  staffMemberId: z.string().trim().min(1).optional().nullable(),
  eventTeamId: z.string().trim().min(1).optional().nullable(),
  eventId: z.string().trim().min(1).optional().nullable(),
  teamStaffAssignmentId: z.string().trim().min(1).optional().nullable(),
  eventTeamStaffAssignmentId: z.string().trim().min(1).optional().nullable(),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  actualStart: z.string().optional().nullable(),
  actualEnd: z.string().optional().nullable(),
  plannedMinutes: z.coerce.number().int().positive().optional().nullable(),
  actualMinutes: z.coerce.number().int().positive().optional().nullable(),
  rateOverrideType: z.enum(['HOURLY', 'SALARY', 'FLAT_PER_EVENT']).optional().nullable(),
  rateOverrideCents: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(['PLANNED', 'ACTUAL', 'CANCELLED']).optional().nullable(),
  notes: z.string().optional().nullable(),
}).strict();

const mutationErrorResponse = (error: unknown) => {
  if (error instanceof FinanceMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
};

const displayName = (
  user: { firstName?: string | null; lastName?: string | null; userName?: string | null } | null | undefined,
  fallback: string,
): string => {
  const fullName = [user?.firstName, user?.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
  if (fullName) {
    return fullName;
  }
  const userName = typeof user?.userName === 'string' ? user.userName.trim() : '';
  return userName || fallback;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = normalizeId(id);
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  if (!(await canAccessTeamFinance(teamId, session, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const team = await prisma.canonicalTeams.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      organizationId: true,
    },
  });
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }
  if (!team.organizationId) {
    return NextResponse.json({ error: 'Team staff costs require an organization team.' }, { status: 400 });
  }

  const [staffMembers, staffRoles] = await Promise.all([
    prisma.staffMembers.findMany({
      where: { organizationId: team.organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        roleId: true,
        types: true,
      },
    }),
    ensureDefaultOrganizationRoles(prisma, team.organizationId),
  ]);

  const userIds = Array.from(new Set(
    staffMembers
      .map((staffMember) => staffMember.userId)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
  ));
  const users = userIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
      },
    })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const rolesById = new Map(staffRoles.map((role) => [role.id, role]));

  return NextResponse.json({
    staffMembers: staffMembers.map((staffMember) => ({
      id: staffMember.id,
      userId: staffMember.userId,
      roleId: staffMember.roleId,
      roleName: staffMember.roleId ? rolesById.get(staffMember.roleId)?.name ?? null : null,
      displayName: displayName(
        staffMember.userId ? usersById.get(staffMember.userId) : null,
        `Staff ${staffMember.id}`,
      ),
      types: staffMember.types,
    })),
    staffRoles: staffRoles.map((role) => ({
      id: role.id,
      name: role.name,
      kind: role.kind,
      systemKey: role.systemKey,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      permissions: role.permissions,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(req);
  const { id } = await params;
  const teamId = normalizeId(id);
  if (!teamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = teamStaffSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await canAccessTeamFinance(teamId, session, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const laborEntry = await createTeamStaffLaborEntry({
      teamId,
      ...parsed.data,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ laborEntry }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
