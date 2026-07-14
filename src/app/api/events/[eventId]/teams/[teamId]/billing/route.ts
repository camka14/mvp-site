import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { loadBillDiscountSummaries, withBillDiscountAmounts } from '@/server/billing/billDiscountSummaries';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';

export const dynamic = 'force-dynamic';

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

const resolveOccurrenceFromRequest = (req: NextRequest): {
  occurrence: { slotId: string; occurrenceDate: string } | null;
  error: string | null;
} => {
  const slotId = normalizeId(req.nextUrl.searchParams.get('slotId'));
  const occurrenceDate = normalizeId(req.nextUrl.searchParams.get('occurrenceDate'));
  if (!slotId && !occurrenceDate) {
    return { occurrence: null, error: null };
  }
  if (!slotId || !occurrenceDate) {
    return { occurrence: null, error: 'slotId and occurrenceDate are both required for weekly billing.' };
  }
  return { occurrence: { slotId, occurrenceDate }, error: null };
};

const toDisplayName = (user: { id: string; firstName: string | null; lastName: string | null; userName: string }) => {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName.length > 0) {
    return fullName;
  }
  if (typeof user.userName === 'string' && user.userName.trim().length > 0) {
    return user.userName.trim();
  }
  return user.id;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; teamId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, teamId } = await params;

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamSignup: true,
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
  const participantOccurrence = resolveOccurrenceFromRequest(req);
  if (participantOccurrence.error) {
    return NextResponse.json({ error: participantOccurrence.error }, { status: 400 });
  }
  const participantIds = await getEventParticipantIdsForEvent(event.id, prisma, participantOccurrence.occurrence);

  if (!event.teamSignup) {
    const participantUserIds = participantIds.userIds;
    if (!participantUserIds.includes(normalizedTeamId)) {
      return NextResponse.json({ error: 'User is not a participant of this event.' }, { status: 404 });
    }

    const user = await prisma.userData.findUnique({
      where: { id: normalizedTeamId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'Participant user not found.' }, { status: 404 });
    }

    const userBills = await prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'USER',
        ownerId: normalizedTeamId,
      },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        parentBillId: true,
        sourceType: true,
        sourceId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        allowSplit: true,
        lineItems: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const billIds = userBills.map((bill) => bill.id);
    const billPayments = billIds.length > 0
      ? await prisma.billPayments.findMany({
        where: { billId: { in: billIds } },
        select: {
          id: true,
          billId: true,
          sequence: true,
          dueDate: true,
          amountCents: true,
          paidAmountCents: true,
          status: true,
          paidAt: true,
          paymentIntentId: true,
          payerUserId: true,
          refundedAmountCents: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
      })
      : [];
    const proofRows = billIds.length > 0
      ? await (prisma as any).billPaymentProofs.findMany({
        where: { billId: { in: billIds } },
        select: {
          id: true,
          billPaymentId: true,
          fileId: true,
          status: true,
          amountAcceptedCents: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const proofsByPaymentId = new Map<string, typeof proofRows>();
    (proofRows as any[]).forEach((proof) => {
      const existing = proofsByPaymentId.get(proof.billPaymentId);
      if (existing) {
        existing.push(proof);
      } else {
        proofsByPaymentId.set(proof.billPaymentId, [proof]);
      }
    });

    const paymentsByBillId = new Map<string, typeof billPayments>();
    billPayments.forEach((payment) => {
      const existing = paymentsByBillId.get(payment.billId);
      if (existing) {
        existing.push(payment);
      } else {
        paymentsByBillId.set(payment.billId, [payment]);
      }
    });

    const ownerDisplayName = toDisplayName(user);
    const discountAmountsByBillId = await loadBillDiscountSummaries(
      prisma,
      userBills.map((bill) => ({
        ...bill,
        payments: paymentsByBillId.get(bill.id) ?? [],
      })),
    );
    const bills = userBills.map((bill) => {
      const payments = (paymentsByBillId.get(bill.id) ?? []).map((payment) => {
        const refundedAmountCents = Math.max(0, Number(payment.refundedAmountCents ?? 0));
        const refundableAmountCents = Math.max(0, payment.amountCents - refundedAmountCents);
        return {
          ...payment,
          refundedAmountCents,
          refundableAmountCents,
          isRefundable: refundableAmountCents > 0 && payment.status === 'PAID',
          manualPaymentProofs: (proofsByPaymentId.get(payment.id) ?? []).map((proof: any) => ({
            id: proof.id,
            status: proof.status ?? null,
            fileId: proof.fileId,
            fileUrl: `/api/files/${encodeURIComponent(proof.fileId)}`,
            amountAcceptedCents: proof.amountAcceptedCents ?? null,
          })),
        };
      });

      const paidAmountCents = payments.reduce((sum, payment) => (
        sum + Math.min(
          Math.max(0, payment.amountCents),
          Math.max(0, Number((payment as any).paidAmountCents ?? (payment.status === 'PAID' ? payment.amountCents : 0))),
        )
      ), 0);
      const refundedAmountCents = payments.reduce((sum, payment) => sum + payment.refundedAmountCents, 0);
      const refundableAmountCents = Math.max(0, paidAmountCents - refundedAmountCents);

      return {
        ...bill,
        ...withBillDiscountAmounts(bill, discountAmountsByBillId),
        ownerName: ownerDisplayName,
        paidAmountCents,
        refundedAmountCents,
        refundableAmountCents,
        payments,
      };
    });

    const totals = bills.reduce(
      (aggregate, bill) => ({
        paidAmountCents: aggregate.paidAmountCents + bill.paidAmountCents,
        refundedAmountCents: aggregate.refundedAmountCents + bill.refundedAmountCents,
        refundableAmountCents: aggregate.refundableAmountCents + bill.refundableAmountCents,
      }),
      {
        paidAmountCents: 0,
        refundedAmountCents: 0,
        refundableAmountCents: 0,
      },
    );

    return NextResponse.json(
      {
        event: {
          id: event.id,
        },
        team: {
          id: user.id,
          name: ownerDisplayName,
          playerIds: [user.id],
        },
        users: [
          {
            id: user.id,
            displayName: ownerDisplayName,
          },
        ],
        bills,
        totals,
      },
      { status: 200 },
    );
  }

  const eventTeamIds = participantIds.teamIds;
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

  const teamOwnerIds = Array.from(
    new Set(
      [team.id, normalizeId(team.parentTeamId)].filter((value): value is string => Boolean(value)),
    ),
  );
  const playerIds = normalizeIdList(team.playerIds);
  const teamMemberIds = Array.from(
    new Set([
      ...playerIds,
      ...normalizeIdList([team.captainId, team.managerId, team.headCoachId]),
    ]),
  );

  const [users, teamBills] = await Promise.all([
    teamMemberIds.length > 0
      ? prisma.userData.findMany({
        where: { id: { in: teamMemberIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userName: true,
        },
      })
      : Promise.resolve([]),
    prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'TEAM',
        ownerId: { in: teamOwnerIds },
      },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        sourceType: true,
        sourceId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        allowSplit: true,
        lineItems: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const teamBillIds = teamBills.map((bill) => bill.id);
  const userBills = teamMemberIds.length > 0
    ? await prisma.bills.findMany({
      where: {
        eventId,
        ownerType: 'USER',
        ownerId: { in: teamMemberIds },
        ...(teamBillIds.length > 0
          ? {
              OR: [
                { parentBillId: { in: teamBillIds } },
                { parentBillId: null },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        parentBillId: true,
        sourceType: true,
        sourceId: true,
        totalAmountCents: true,
        paidAmountCents: true,
        status: true,
        allowSplit: true,
        lineItems: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];

  const allBills = Array.from(
    new Map([...teamBills, ...userBills].map((bill) => [bill.id, bill])).values(),
  );
  const billIds = allBills.map((bill) => bill.id);
  const billPayments = billIds.length > 0
    ? await prisma.billPayments.findMany({
      where: { billId: { in: billIds } },
      select: {
        id: true,
        billId: true,
        sequence: true,
        dueDate: true,
        amountCents: true,
        paidAmountCents: true,
        status: true,
        paidAt: true,
        paymentIntentId: true,
        payerUserId: true,
        refundedAmountCents: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    })
    : [];
  const proofRows = billIds.length > 0
    ? await (prisma as any).billPaymentProofs.findMany({
      where: { billId: { in: billIds } },
      select: {
        id: true,
        billPaymentId: true,
        fileId: true,
        status: true,
        amountAcceptedCents: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];
  const proofsByPaymentId = new Map<string, typeof proofRows>();
  (proofRows as any[]).forEach((proof) => {
    const existing = proofsByPaymentId.get(proof.billPaymentId);
    if (existing) {
      existing.push(proof);
    } else {
      proofsByPaymentId.set(proof.billPaymentId, [proof]);
    }
  });

  const usersById = new Map(users.map((user) => [user.id, user]));
  const paymentsByBillId = new Map<string, typeof billPayments>();
  billPayments.forEach((payment) => {
    const existing = paymentsByBillId.get(payment.billId);
    if (existing) {
      existing.push(payment);
    } else {
      paymentsByBillId.set(payment.billId, [payment]);
    }
  });

  const discountAmountsByBillId = await loadBillDiscountSummaries(
    prisma,
    allBills.map((bill) => ({
      ...bill,
      payments: paymentsByBillId.get(bill.id) ?? [],
    })),
  );
  const bills = allBills.map((bill) => {
    const ownerName = bill.ownerType === 'TEAM'
      ? (teamOwnerIds.includes(bill.ownerId) ? (team.name || team.id) : bill.ownerId)
      : (() => {
          const owner = usersById.get(bill.ownerId);
          return owner ? toDisplayName(owner) : bill.ownerId;
        })();

    const payments = (paymentsByBillId.get(bill.id) ?? []).map((payment) => {
      const refundedAmountCents = Math.max(0, Number(payment.refundedAmountCents ?? 0));
      const refundableAmountCents = Math.max(0, payment.amountCents - refundedAmountCents);
      return {
        ...payment,
        refundedAmountCents,
        refundableAmountCents,
        isRefundable: refundableAmountCents > 0 && payment.status === 'PAID',
        manualPaymentProofs: (proofsByPaymentId.get(payment.id) ?? []).map((proof: any) => ({
          id: proof.id,
          status: proof.status ?? null,
          fileId: proof.fileId,
          fileUrl: `/api/files/${encodeURIComponent(proof.fileId)}`,
          amountAcceptedCents: proof.amountAcceptedCents ?? null,
        })),
      };
    });

    const paidAmountCents = payments.reduce((sum, payment) => (
      sum + Math.min(
        Math.max(0, payment.amountCents),
        Math.max(0, Number((payment as any).paidAmountCents ?? (payment.status === 'PAID' ? payment.amountCents : 0))),
      )
    ), 0);
    const refundedAmountCents = payments.reduce((sum, payment) => sum + payment.refundedAmountCents, 0);
    const refundableAmountCents = Math.max(0, paidAmountCents - refundedAmountCents);

    return {
      ...bill,
      ...withBillDiscountAmounts(bill, discountAmountsByBillId),
      ownerName,
      paidAmountCents,
      refundedAmountCents,
      refundableAmountCents,
      payments,
    };
  });

  const totals = bills.reduce(
    (aggregate, bill) => ({
      paidAmountCents: aggregate.paidAmountCents + bill.paidAmountCents,
      refundedAmountCents: aggregate.refundedAmountCents + bill.refundedAmountCents,
      refundableAmountCents: aggregate.refundableAmountCents + bill.refundableAmountCents,
    }),
    {
      paidAmountCents: 0,
      refundedAmountCents: 0,
      refundableAmountCents: 0,
    },
  );

  return NextResponse.json(
    {
      event: {
        id: event.id,
      },
      team: {
        id: team.id,
        name: team.name,
        playerIds,
      },
      users: users.map((user) => ({
        id: user.id,
        displayName: toDisplayName(user),
      })),
      bills,
      totals,
    },
    { status: 200 },
  );
}
