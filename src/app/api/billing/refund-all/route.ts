import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';
import {
  buildRefundScopeSnapshot,
  isRefundScopeSnapshotValid,
  resolveRefundablePaymentsForRequest,
  type RefundRequestRow,
} from '@/server/refunds/refundExecution';

export const dynamic = 'force-dynamic';

const schema = z.object({
  eventId: z.string(),
  teamId: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const refundRequestScopeSelect = {
  id: true,
  eventId: true,
  userId: true,
  requestedByUserId: true,
  hostId: true,
  teamId: true,
  organizationId: true,
  reason: true,
  status: true,
  slotId: true,
  occurrenceDate: true,
  billIds: true,
  paymentIds: true,
  requestedAmountCents: true,
  currency: true,
  policyDecision: true,
  scopeVersion: true,
  scopeHash: true,
} as const;

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await prisma.events.findUnique({
    where: { id: parsed.data.eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const participantIds = await getEventParticipantIdsForEvent(event.id);
  const normalizedTeamId = normalizeId(parsed.data.teamId);
  const canManageCurrentEvent = await canManageEvent(session, event);
  const now = new Date();

  if (normalizedTeamId) {
    if (!participantIds.teamIds.includes(normalizedTeamId)) {
      return NextResponse.json({ error: 'Team is not registered for this event.' }, { status: 400 });
    }

    const team = await prisma.teams.findUnique({
      where: { id: normalizedTeamId },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
        playerIds: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const canManageTeam = normalizeId(team.managerId) === session.userId;

    if (!session.isAdmin && !canManageTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existingWaitingRequest = await prisma.refundRequests.findFirst({
      where: {
        eventId: event.id,
        teamId: normalizedTeamId,
        status: 'WAITING',
      },
      select: refundRequestScopeSelect,
    });

    if (existingWaitingRequest && isRefundScopeSnapshotValid(existingWaitingRequest as RefundRequestRow)) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        refundId: existingWaitingRequest.id,
        refundAlreadyPending: true,
      }, { status: 200 });
    }

    const refundRequest: RefundRequestRow = {
      id: crypto.randomUUID(),
      eventId: event.id,
      userId: session.userId,
      requestedByUserId: session.userId,
      hostId: event.hostId,
      organizationId: event.organizationId,
      teamId: normalizedTeamId,
      reason: normalizeId(parsed.data.reason) ?? 'team_refund_requested',
      status: 'WAITING',
      authorizedPayerUserIds: Array.from(new Set([
        session.userId,
        normalizeId(team.captainId),
        normalizeId(team.managerId),
        normalizeId(team.headCoachId),
        ...(Array.isArray(team.coachIds) ? team.coachIds : []),
        ...(Array.isArray(team.playerIds) ? team.playerIds : []),
      ].filter((id): id is string => Boolean(id)))),
    };
    const payments = await resolveRefundablePaymentsForRequest(prisma, refundRequest);
    if (!payments.length) {
      return NextResponse.json(
        { error: 'No refundable payment found for this team.' },
        { status: 409 },
      );
    }
    const scope = buildRefundScopeSnapshot(refundRequest, payments, 'HOST_REVIEW_REQUIRED');

    const created = await prisma.refundRequests.create({
      data: {
        id: refundRequest.id,
        eventId: refundRequest.eventId,
        userId: refundRequest.userId,
        requestedByUserId: refundRequest.requestedByUserId,
        hostId: refundRequest.hostId,
        organizationId: refundRequest.organizationId,
        teamId: refundRequest.teamId,
        billIds: scope.billIds,
        paymentIds: scope.paymentIds,
        requestedAmountCents: scope.requestedAmountCents,
        currency: scope.currency,
        policyDecision: scope.policyDecision,
        scopeVersion: scope.scopeVersion,
        scopeHash: scope.scopeHash,
        reason: refundRequest.reason,
        status: 'WAITING',
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      emailSent: false,
      refundId: created.id,
      refundAlreadyPending: false,
    }, { status: 200 });
  }

  if (!session.isAdmin && !canManageCurrentEvent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const refundUserIds = new Set<string>();
  for (const id of participantIds.userIds) refundUserIds.add(id);
  for (const id of participantIds.freeAgentIds) refundUserIds.add(id);

  const eventTeamIds = participantIds.teamIds;
  if (eventTeamIds.length) {
    const teams = await prisma.teams.findMany({
      where: { id: { in: eventTeamIds } },
      select: { captainId: true },
    });
    for (const team of teams) {
      const captainId = normalizeId(team.captainId);
      if (captainId) {
        refundUserIds.add(captainId);
      }
    }
  }

  // Host doesn't need a refund request for their own event deletion.
  if (event.hostId) {
    refundUserIds.delete(event.hostId);
  }

  const targets = Array.from(refundUserIds);
  if (!targets.length) {
    return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
  }

  // Only a request with a verified immutable scope can block a new refund
  // request. Older rows without a scope were never safe to approve and must
  // not prevent a customer from submitting a fully scoped replacement.
  const existing = await prisma.refundRequests.findMany({
    where: {
      eventId: event.id,
      userId: { in: targets },
      teamId: null,
      status: { in: ['WAITING', 'APPROVED'] },
    },
    select: refundRequestScopeSelect,
  });
  const existingSet = new Set(
    existing
      .filter((row) => isRefundScopeSnapshotValid(row as RefundRequestRow))
      .map((row) => row.userId),
  );
  const toCreate = targets.filter((id) => !existingSet.has(id));

  for (const userId of toCreate) {
    const refundRequest: RefundRequestRow = {
      id: crypto.randomUUID(),
      eventId: event.id,
      userId,
      requestedByUserId: session.userId,
      hostId: event.hostId,
      organizationId: event.organizationId,
      teamId: null,
      reason: 'event_deleted_by_host',
      status: 'WAITING',
    };
    const payments = await resolveRefundablePaymentsForRequest(prisma, refundRequest);
    if (!payments.length) {
      continue;
    }
    const scope = buildRefundScopeSnapshot(refundRequest, payments, 'HOST_REVIEW_REQUIRED');
    await prisma.refundRequests.create({
      data: {
        id: refundRequest.id,
        eventId: refundRequest.eventId,
        userId: refundRequest.userId,
        requestedByUserId: refundRequest.requestedByUserId,
        hostId: refundRequest.hostId,
        organizationId: refundRequest.organizationId,
        teamId: null,
        billIds: scope.billIds,
        paymentIds: scope.paymentIds,
        requestedAmountCents: scope.requestedAmountCents,
        currency: scope.currency,
        policyDecision: scope.policyDecision,
        scopeVersion: scope.scopeVersion,
        scopeHash: scope.scopeHash,
        reason: refundRequest.reason,
        status: 'WAITING',
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
}
