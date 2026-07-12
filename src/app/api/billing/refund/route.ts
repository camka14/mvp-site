import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRefundPolicy } from '@/lib/refundPolicy';
import {
  applyRefundAttempts,
  buildRefundScopeSnapshot,
  createStripeRefundAttempts,
  hasRefundScopeDrift,
  REFUND_SCOPE_VERSION,
  resolveRefundablePaymentsForRequest,
  isRefundScopeSnapshotValid,
  summarizeRefundAttempts,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';
import {
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  resolveWeeklyOccurrenceStartAt,
} from '@/server/events/weeklyOccurrences';

export const dynamic = 'force-dynamic';

const schema = z.object({
  payloadEvent: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  reason: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const canManageLinkedChildRefund = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const eventId = parsed.data.payloadEvent?.$id ?? parsed.data.payloadEvent?.id ?? parsed.data.payloadEvent?.eventId;
  if (!eventId) {
    return NextResponse.json({ error: 'Event is required' }, { status: 400 });
  }

  const targetUserId = normalizeId(parsed.data.userId)
    ?? normalizeId(parsed.data.user?.$id)
    ?? normalizeId(parsed.data.user?.id)
    ?? session.userId;

  if (!session.isAdmin && targetUserId !== session.userId) {
    const canManageChild = await canManageLinkedChildRefund({
      parentId: session.userId,
      childId: targetUserId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      start: true,
      cancellationRefundHours: true,
      hostId: true,
      organizationId: true,
      eventType: true,
      parentEvent: true,
      timeSlotIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const weeklyOccurrence = isWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
    })
    : null;
  if (weeklyOccurrence && !weeklyOccurrence.ok) {
    return NextResponse.json({ error: weeklyOccurrence.error }, { status: 400 });
  }
  if (isWeeklyParentEvent(event) && (!parsed.data.slotId || !parsed.data.occurrenceDate)) {
    return NextResponse.json(
      { error: 'Weekly event refunds require slotId and occurrenceDate.' },
      { status: 400 },
    );
  }
  if (!isWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json(
      { error: 'Weekly occurrence selection is only valid for weekly events.' },
      { status: 400 },
    );
  }
  const resolvedOccurrence = weeklyOccurrence?.ok ? weeklyOccurrence.value : null;
  const occurrenceWhere = resolvedOccurrence
    ? {
      slotId: resolvedOccurrence.slotId,
      occurrenceDate: resolvedOccurrence.occurrenceDate,
    }
    : {
      slotId: null,
      occurrenceDate: null,
    };

  const participantIds = await getEventParticipantIdsForEvent(eventId, prisma, resolvedOccurrence);
  const registeredTeam = participantIds.teamIds.length > 0
    ? await prisma.teams.findFirst({
      where: {
        id: { in: participantIds.teamIds },
        OR: [
          { playerIds: { has: targetUserId } },
          { captainId: targetUserId },
          { managerId: targetUserId },
          { headCoachId: targetUserId },
          { coachIds: { has: targetUserId } },
        ],
      },
      select: { id: true },
    })
    : null;
  const isTargetInEvent = participantIds.userIds.includes(targetUserId)
    || participantIds.waitListIds.includes(targetUserId)
    || participantIds.freeAgentIds.includes(targetUserId)
    || Boolean(registeredTeam);

  if (!isTargetInEvent) {
    return NextResponse.json(
      { error: 'Selected user is not currently registered, waitlisted, or listed as a free agent for this event.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const reason = normalizeId(parsed.data.reason) ?? 'requested_by_customer';
  const refundTeamId = registeredTeam?.id ?? null;
  const effectiveStart = resolvedOccurrence
    ? resolveWeeklyOccurrenceStartAt(resolvedOccurrence.slot, resolvedOccurrence.occurrenceDate) ?? event.start
    : event.start;
  const { canAutoRefund } = getRefundPolicy({
    start: effectiveStart,
    cancellationRefundHours: event.cancellationRefundHours,
  }, now);

  const requestSelect = {
    id: true,
    eventId: true,
    userId: true,
    hostId: true,
    teamId: true,
    organizationId: true,
    reason: true,
    status: true,
    requestedByUserId: true,
    slotId: true,
    occurrenceDate: true,
    billIds: true,
    paymentIds: true,
    paymentScope: true,
    requestedAmountCents: true,
    currency: true,
    policyDecision: true,
    scopeVersion: true,
    scopeHash: true,
  } as const;

  const buildRefundRequestRow = (id: string, status: RefundRequestRow['status']): RefundRequestRow => ({
    id,
    eventId,
    userId: targetUserId,
    hostId: event.hostId ?? parsed.data.payloadEvent?.hostId ?? null,
    teamId: refundTeamId,
    organizationId: event.organizationId ?? parsed.data.payloadEvent?.organizationId ?? null,
    reason,
    status,
    requestedByUserId: session.userId,
    slotId: resolvedOccurrence?.slotId ?? null,
    occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
  });

  if (canAutoRefund) {
    const existingAutoRefund = await prisma.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        teamId: refundTeamId,
        slotId: resolvedOccurrence?.slotId ?? null,
        occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        status: { in: ['WAITING', 'APPROVED'] },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: requestSelect,
    });

    const baseRefundRequest = existingAutoRefund
      ? { ...existingAutoRefund, reason } as RefundRequestRow
      : buildRefundRequestRow(crypto.randomUUID(), 'APPROVED');
    if (existingAutoRefund && !isRefundScopeSnapshotValid(baseRefundRequest)) {
      return NextResponse.json(
        { error: 'This legacy refund request has no verified payment scope. Submit a new request.' },
        { status: 409 },
      );
    }

    let stripeRefundAttempts: StripeRefundAttempt[] = [];
    let refundRequest: RefundRequestRow;
    try {
      const refundablePayments = await resolveRefundablePaymentsForRequest(prisma, baseRefundRequest);
      if (existingAutoRefund && hasRefundScopeDrift(baseRefundRequest, refundablePayments)) {
        return NextResponse.json(
          { error: 'The payment scope changed after this automatic refund was created. Submit a new refund request.' },
          { status: 409 },
        );
      }
      const scopeSnapshot = existingAutoRefund
        ? {
          billIds: existingAutoRefund.billIds,
          paymentIds: existingAutoRefund.paymentIds,
          paymentScope: existingAutoRefund.paymentScope,
          requestedAmountCents: existingAutoRefund.requestedAmountCents,
          currency: existingAutoRefund.currency,
          policyDecision: existingAutoRefund.policyDecision,
          scopeVersion: existingAutoRefund.scopeVersion,
          scopeHash: existingAutoRefund.scopeHash,
        }
        : buildRefundScopeSnapshot(baseRefundRequest, refundablePayments, 'AUTO_APPROVED');
      refundRequest = { ...baseRefundRequest, ...scopeSnapshot };
      stripeRefundAttempts = await createStripeRefundAttempts({
        request: refundRequest,
        payments: refundablePayments,
        approvedByUserId: session.userId,
      });
    } catch (error) {
      console.error('Stripe refund failed during automatic refund processing', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create refund.' },
        { status: 502 },
      );
    }

    if (!stripeRefundAttempts.length && existingAutoRefund?.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'No refundable payment found for automatic refund.' },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.eventRegistrations.updateMany({
        where: {
          eventId,
          registrantId: targetUserId,
          registrantType: { in: ['SELF', 'CHILD'] },
          rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          ...occurrenceWhere,
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });

      const persistedRequest = existingAutoRefund
        ? await tx.refundRequests.update({
          where: { id: existingAutoRefund.id },
          data: {
            status: 'APPROVED',
            updatedAt: now,
          },
          select: { id: true, status: true },
        })
        : await tx.refundRequests.create({
          data: {
            id: refundRequest.id,
            eventId: refundRequest.eventId,
            userId: refundRequest.userId,
            requestedByUserId: refundRequest.requestedByUserId,
            hostId: refundRequest.hostId,
            teamId: refundRequest.teamId,
            organizationId: refundRequest.organizationId,
            slotId: refundRequest.slotId,
            occurrenceDate: refundRequest.occurrenceDate,
            billIds: refundRequest.billIds ?? [],
            paymentIds: refundRequest.paymentIds ?? [],
            paymentScope: refundRequest.paymentScope ?? [],
            requestedAmountCents: refundRequest.requestedAmountCents ?? 0,
            currency: refundRequest.currency ?? 'usd',
            policyDecision: refundRequest.policyDecision,
            scopeVersion: refundRequest.scopeVersion ?? REFUND_SCOPE_VERSION,
            scopeHash: refundRequest.scopeHash,
            reason: refundRequest.reason,
            status: 'APPROVED',
            createdAt: now,
            updatedAt: now,
          },
          select: { id: true, status: true },
        });

      const updatedPayments = await applyRefundAttempts(tx, stripeRefundAttempts, now);

      return {
        persistedRequest,
        updatedPayments,
      };
    });

    const refundSummary = summarizeRefundAttempts(stripeRefundAttempts);

    return NextResponse.json(
      {
        success: true,
        emailSent: false,
        targetUserId,
        refundId: result.persistedRequest.id,
        refundAlreadyPending: false,
        refundStatus: result.persistedRequest.status,
        refundedAmountCents: refundSummary.refundedAmountCents,
        stripeRefundIds: refundSummary.stripeRefundIds,
        refundedPaymentIds: result.updatedPayments.map((payment: { id: string }) => payment.id),
      },
      { status: 200 },
    );
  }

  const waitingRequest = buildRefundRequestRow(crypto.randomUUID(), 'WAITING');
  const waitingPayments = await resolveRefundablePaymentsForRequest(prisma, waitingRequest);
  const waitingScope = buildRefundScopeSnapshot(waitingRequest, waitingPayments, 'HOST_REVIEW_REQUIRED');

  const result = await prisma.$transaction(async (tx) => {
    const existingWaitingRequest = await tx.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        teamId: refundTeamId,
        slotId: resolvedOccurrence?.slotId ?? null,
        occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        status: 'WAITING',
      },
      orderBy: { updatedAt: 'desc' },
      select: requestSelect,
    });

    await tx.eventRegistrations.updateMany({
      where: {
        eventId,
        registrantId: targetUserId,
        registrantType: { in: ['SELF', 'CHILD'] },
        rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
        ...occurrenceWhere,
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });

    if (existingWaitingRequest && isRefundScopeSnapshotValid(existingWaitingRequest as RefundRequestRow)) {
      return {
        createdRefund: false,
        refundId: existingWaitingRequest.id,
      };
    }

    const createdRefund = await tx.refundRequests.create({
      data: {
        id: waitingRequest.id,
        eventId,
        userId: targetUserId,
        requestedByUserId: session.userId,
        hostId: event.hostId ?? parsed.data.payloadEvent?.hostId ?? null,
        teamId: refundTeamId,
        organizationId: event.organizationId ?? parsed.data.payloadEvent?.organizationId ?? null,
        slotId: resolvedOccurrence?.slotId ?? null,
        occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        billIds: waitingScope.billIds,
        paymentIds: waitingScope.paymentIds,
        paymentScope: waitingScope.paymentScope,
        requestedAmountCents: waitingScope.requestedAmountCents,
        currency: waitingScope.currency,
        policyDecision: waitingScope.policyDecision,
        scopeVersion: waitingScope.scopeVersion,
        scopeHash: waitingScope.scopeHash,
        reason,
        status: 'WAITING',
        createdAt: now,
        updatedAt: now,
      },
      select: {
        id: true,
      },
    });

    return {
      createdRefund: true,
      refundId: createdRefund.id,
    };
  });

  return NextResponse.json(
    {
      success: true,
      emailSent: false,
      targetUserId,
      refundId: result.refundId,
      refundAlreadyPending: !result.createdRefund,
    },
    { status: 200 },
  );
}
