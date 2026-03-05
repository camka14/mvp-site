import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { withLegacyFields } from '@/server/legacyFormat';
import { calculateMvpAndStripeFees } from '@/lib/billingFees';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  ownerType: z.enum(['TEAM', 'USER']),
  ownerId: z.string().optional(),
  eventAmountCents: z.number(),
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
      userIds: true,
      teamSignup: true,
      eventType: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const eventAmountCents = Math.round(parsed.data.eventAmountCents);
  if (!Number.isFinite(eventAmountCents) || eventAmountCents <= 0) {
    return NextResponse.json({ error: 'eventAmountCents must be greater than 0' }, { status: 400 });
  }

  const {
    mvpFeeCents,
    stripeFeeCents,
  } = calculateMvpAndStripeFees({
    eventAmountCents,
    eventType: event.eventType,
  });
  const taxAmountCents = parsed.data.taxAmountCents !== undefined
    ? Math.max(0, Math.round(parsed.data.taxAmountCents))
    : 0;
  const totalAmountCents = eventAmountCents + mvpFeeCents + stripeFeeCents + taxAmountCents;

  const ownerType = parsed.data.ownerType;
  const requestedOwnerId = normalizeId(parsed.data.ownerId);
  let ownerId: string | null = null;
  let allowSplit = false;

  if (!event.teamSignup) {
    const participantUserIds = normalizeIdList(event.userIds);
    if (!participantUserIds.includes(normalizedTeamId)) {
      return NextResponse.json({ error: 'User is not a participant of this event.' }, { status: 404 });
    }
    if (ownerType !== 'USER') {
      return NextResponse.json({ error: 'Non-team events can only bill users.' }, { status: 400 });
    }
    ownerId = requestedOwnerId ?? normalizedTeamId;
    if (ownerId !== normalizedTeamId) {
      return NextResponse.json({ error: 'User bill owner must match the participant user.' }, { status: 400 });
    }
  } else {
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

    const teamMemberIds = Array.from(
      new Set([
        ...normalizeIdList(team.playerIds),
        ...normalizeIdList([team.captainId, team.managerId, team.headCoachId]),
      ]),
    );
    ownerId = ownerType === 'TEAM'
      ? (requestedOwnerId ?? team.id)
      : requestedOwnerId;

    if (ownerType === 'TEAM') {
      const allowedTeamOwnerIds = Array.from(
        new Set(
          [team.id, normalizeId(team.parentTeamId)].filter((value): value is string => Boolean(value)),
        ),
      );
      if (!ownerId || !allowedTeamOwnerIds.includes(ownerId)) {
        return NextResponse.json({ error: 'Team bill owner must match the participant team.' }, { status: 400 });
      }
      allowSplit = Boolean(parsed.data.allowSplit);
    } else if (!ownerId || !teamMemberIds.includes(ownerId)) {
      return NextResponse.json({ error: 'User bill owner must be on the selected team.' }, { status: 400 });
    }
  }

  if (!ownerId) {
    return NextResponse.json({ error: 'ownerId is required when billing a user.' }, { status: 400 });
  }

  const label = (() => {
    const normalizedLabel = typeof parsed.data.label === 'string' ? parsed.data.label.trim() : '';
    return normalizedLabel.length > 0 ? normalizedLabel : 'Event registration';
  })();
  const lineItems: Array<{
    id: string;
    type: 'EVENT' | 'FEE' | 'TAX';
    label: string;
    amountCents: number;
  }> = [
    {
      id: 'line_1',
      type: 'EVENT',
      label,
      amountCents: eventAmountCents,
    },
  ];
  if (mvpFeeCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'FEE',
      label: 'MVP fee',
      amountCents: mvpFeeCents,
    });
  }
  if (stripeFeeCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'FEE',
      label: 'Stripe fee',
      amountCents: stripeFeeCents,
    });
  }
  if (taxAmountCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'TAX',
      label: 'Tax',
      amountCents: taxAmountCents,
    });
  }

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
        allowSplit: ownerType === 'TEAM' ? allowSplit : false,
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
