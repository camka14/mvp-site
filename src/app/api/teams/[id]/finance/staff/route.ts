import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canAccessTeamFinance } from '@/server/finance/financeAccess';
import { createTeamStaffLaborEntry, FinanceMutationError } from '@/server/finance/financeMutations';
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
