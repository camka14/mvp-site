import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { createEventStaffAssignment, FinanceMutationError } from '@/server/finance/financeMutations';

export const dynamic = 'force-dynamic';

const eventStaffSchema = z.object({
  staffMemberId: z.string().trim().min(1),
  organizationRoleId: z.string().trim().min(1).optional().nullable(),
  userId: z.string().trim().min(1).optional().nullable(),
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
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = eventStaffSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event, prisma))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const assignment = await createEventStaffAssignment({
      eventId,
      ...parsed.data,
      actingUserId: session.userId,
    }, prisma);
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
