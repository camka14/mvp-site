import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRefundPolicy } from '@/lib/refundPolicy';
import {
  applyRefundAttempts,
  createStripeRefundAttempts,
  resolveRefundablePaymentsForRequest,
  summarizeRefundAttempts,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';

export const dynamic = 'force-dynamic';

const schema = z.object({
  payloadEvent: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  reason: z.string().optional(),
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
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const participantIds = await getEventParticipantIdsForEvent(eventId);
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
  const { canAutoRefund } = getRefundPolicy(event, now);

  const requestSelect = {
    id: true,
    eventId: true,
    userId: true,
    hostId: true,
    teamId: true,
    organizationId: true,
    reason: true,
    status: true,
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
  });

  if (canAutoRefund) {
    const existingAutoRefund = await prisma.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        teamId: refundTeamId,
        status: { in: ['WAITING', 'APPROVED'] },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: requestSelect,
    });

    const refundRequest = existingAutoRefund
      ? { ...existingAutoRefund, reason } as RefundRequestRow
      : buildRefundRequestRow(crypto.randomUUID(), 'APPROVED');

    let stripeRefundAttempts: StripeRefundAttempt[] = [];
    try {
      const refundablePayments = await resolveRefundablePaymentsForRequest(prisma, refundRequest);
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
          status: { in: ['STARTED', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          slotId: null,
          occurrenceDate: null,
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
            hostId: refundRequest.hostId,
            teamId: refundRequest.teamId,
            organizationId: refundRequest.organizationId,
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

  const result = await prisma.$transaction(async (tx) => {
    const existingWaitingRequest = await tx.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        teamId: refundTeamId,
        status: 'WAITING',
      },
      select: { id: true },
    });

    await tx.eventRegistrations.updateMany({
      where: {
        eventId,
        registrantId: targetUserId,
        registrantType: { in: ['SELF', 'CHILD'] },
        rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
        status: { in: ['STARTED', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
        slotId: null,
        occurrenceDate: null,
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });

    if (existingWaitingRequest) {
      return {
        createdRefund: false,
        refundId: existingWaitingRequest.id,
      };
    }

    const createdRefund = await tx.refundRequests.create({
      data: {
        id: crypto.randomUUID(),
        eventId,
        userId: targetUserId,
        hostId: event.hostId ?? parsed.data.payloadEvent?.hostId ?? null,
        teamId: refundTeamId,
        organizationId: event.organizationId ?? parsed.data.payloadEvent?.organizationId ?? null,
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
