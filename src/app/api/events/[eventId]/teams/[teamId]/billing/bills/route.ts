import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  ownerType: z.enum(['TEAM', 'USER']),
  ownerId: z.string().optional(),
  eventAmountCents: z.number(),
  feeAmountCents: z.number().optional(),
  taxAmountCents: z.number().optional(),
  allowSplit: z.boolean().optional(),
  label: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; teamId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, teamId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
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
      teamIds: true,
      teamSignup: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!event.teamSignup) {
    return NextResponse.json({ error: 'This event does not use team participants.' }, { status: 400 });
  }

  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }
  const eventTeamIds = normalizeIdList(event.teamIds);
  if (!eventTeamIds.includes(normalizedTeamId)) {
    return NextResponse.json({ error: 'Team is not a participant of this event.' }, { status: 404 });
  }

  const team = await prisma.teams.findUnique({
    where: { id: normalizedTeamId },
    select: {
      id: true,
      name: true,
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
      parentTeamId: true,
    },
  });
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const eventAmountCents = Math.round(parsed.data.eventAmountCents);
  if (!Number.isFinite(eventAmountCents) || eventAmountCents <= 0) {
    return NextResponse.json({ error: 'eventAmountCents must be greater than 0' }, { status: 400 });
  }

  const feeAmountCents = parsed.data.feeAmountCents !== undefined
    ? Math.max(0, Math.round(parsed.data.feeAmountCents))
    : Math.max(0, Math.round(eventAmountCents * 0.01));
  const taxAmountCents = parsed.data.taxAmountCents !== undefined
    ? Math.max(0, Math.round(parsed.data.taxAmountCents))
    : 0;
  const totalAmountCents = eventAmountCents + feeAmountCents + taxAmountCents;

  const teamMemberIds = Array.from(
    new Set([
      ...normalizeIdList(team.playerIds),
      ...normalizeIdList([team.captainId, team.managerId, team.headCoachId]),
    ]),
  );

  const ownerType = parsed.data.ownerType;
  const requestedOwnerId = normalizeId(parsed.data.ownerId);
  const ownerId = ownerType === 'TEAM'
    ? (requestedOwnerId ?? team.id)
    : requestedOwnerId;

  if (!ownerId) {
    return NextResponse.json({ error: 'ownerId is required when billing a user.' }, { status: 400 });
  }

  if (ownerType === 'TEAM') {
    const allowedTeamOwnerIds = Array.from(
      new Set(
        [team.id, normalizeId(team.parentTeamId)].filter((value): value is string => Boolean(value)),
      ),
    );
    if (!allowedTeamOwnerIds.includes(ownerId)) {
      return NextResponse.json({ error: 'Team bill owner must match the participant team.' }, { status: 400 });
    }
  } else if (!teamMemberIds.includes(ownerId)) {
    return NextResponse.json({ error: 'User bill owner must be on the selected team.' }, { status: 400 });
  }

  const label = (() => {
    const normalizedLabel = typeof parsed.data.label === 'string' ? parsed.data.label.trim() : '';
    return normalizedLabel.length > 0 ? normalizedLabel : 'Event registration';
  })();
  const lineItems = [
    {
      id: 'line_1',
      type: 'EVENT',
      label,
      amountCents: eventAmountCents,
    },
    ...(feeAmountCents > 0
      ? [
          {
            id: 'line_2',
            type: 'FEE',
            label: 'Processing fee',
            amountCents: feeAmountCents,
          },
        ]
      : []),
    ...(taxAmountCents > 0
      ? [
          {
            id: 'line_3',
            type: 'TAX',
            label: 'Tax',
            amountCents: taxAmountCents,
          },
        ]
      : []),
  ];

  const now = new Date();
  const bill = await prisma.$transaction(async (tx) => {
    const createdBill = await tx.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType,
        ownerId,
        eventId,
        organizationId: event.organizationId ?? null,
        totalAmountCents,
        paidAmountCents: 0,
        nextPaymentAmountCents: totalAmountCents,
        nextPaymentDue: now,
        parentBillId: null,
        allowSplit: ownerType === 'TEAM' ? Boolean(parsed.data.allowSplit) : false,
        status: 'OPEN',
        paymentPlanEnabled: false,
        createdBy: session.userId,
        lineItems,
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: createdBill.id,
        sequence: 1,
        dueDate: now,
        amountCents: totalAmountCents,
        status: 'PENDING',
        refundedAmountCents: 0,
        createdAt: now,
        updatedAt: now,
      },
    });

    return createdBill;
  });

  return NextResponse.json({ bill: withLegacyFields(bill) }, { status: 201 });
}
