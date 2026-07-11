import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageEvent, hasOrganizationStaffAccess } from '@/server/accessControl';
import { canManageCanonicalTeam } from '@/server/teams/teamMembership';
import {
  applyRefundAttempts,
  buildTeamRegistrationRefundEventId,
  createStripeRefundAttempts,
  isRefundScopeSnapshotValid,
  resolveRefundablePaymentsForRequest,
  summarizeRefundAttempts,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['WAITING', 'APPROVED', 'REJECTED']),
}).passthrough();

const refundRequestResponseSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.refundRequests.findUnique({
    where: { id },
    select: refundRequestResponseSelect,
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const teamRegistrationRefundEventId = existing.teamId
    ? buildTeamRegistrationRefundEventId(existing.teamId)
    : null;
  const isTeamRegistrationRefund = Boolean(
    existing.teamId
      && teamRegistrationRefundEventId
      && existing.eventId === teamRegistrationRefundEventId,
  );

  const eventAccess = await prisma.events.findUnique({
    where: { id: existing.eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (eventAccess) {
    if (!session.isAdmin && !(await canManageEvent(session, eventAccess))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (isTeamRegistrationRefund && existing.teamId) {
    const team = await prisma.canonicalTeams.findUnique({
      where: { id: existing.teamId },
      select: {
        id: true,
        organizationId: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const [canManageTeam, organization] = await Promise.all([
      canManageCanonicalTeam({ teamId: team.id, userId: session.userId, isAdmin: session.isAdmin }),
      team.organizationId
        ? prisma.organizations.findUnique({
          where: { id: team.organizationId },
          select: { id: true, ownerId: true },
        })
        : Promise.resolve(null),
    ]);
    const canManageOrganization = organization
      ? await hasOrganizationStaffAccess(
        { userId: session.userId, isAdmin: session.isAdmin },
        organization,
        ['HOST', 'STAFF'],
      )
      : false;
    if (!canManageTeam && !canManageOrganization) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date();
  let stripeRefundAttempts: StripeRefundAttempt[] = [];
  if (parsed.data.status === 'APPROVED') {
    if (!isRefundScopeSnapshotValid(existing as RefundRequestRow)) {
      return NextResponse.json(
        { error: 'Refund scope is missing or invalid. Ask the customer to submit a new request.' },
        { status: 409 },
      );
    }
    const refundablePayments = await resolveRefundablePaymentsForRequest(prisma, existing as RefundRequestRow);
    const resolvedPaymentIds = new Set(refundablePayments.map((payment) => payment.id));
    const resolvedBillIds = new Set(refundablePayments.map((payment) => payment.billId));
    const currentRefundableAmountCents = refundablePayments.reduce(
      (total, payment) => total + payment.refundableAmountCents,
      0,
    );
    const hasScopeDrift = existing.paymentIds.some((paymentId) => !resolvedPaymentIds.has(paymentId))
      || existing.billIds.some((billId) => !resolvedBillIds.has(billId))
      || currentRefundableAmountCents !== existing.requestedAmountCents;
    if (hasScopeDrift) {
      return NextResponse.json(
        { error: 'Refund scope changed after the request was submitted. Review a new request before refunding.' },
        { status: 409 },
      );
    }
    try {
      stripeRefundAttempts = await createStripeRefundAttempts({
        request: existing as RefundRequestRow,
        payments: refundablePayments,
        approvedByUserId: session.userId,
      });
    } catch (error) {
      console.error('Stripe refund failed during refund request approval', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create refund.' },
        { status: 502 },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequests.update({
      where: { id },
      data: { status: parsed.data.status, updatedAt: now },
      select: refundRequestResponseSelect,
    });

    const updatedPayments = await applyRefundAttempts(tx, stripeRefundAttempts, now);

    return {
      updated,
      updatedPayments,
    };
  });

  const refundSummary = summarizeRefundAttempts(stripeRefundAttempts);

  return NextResponse.json(
    {
      ...withLegacyFields(result.updated),
      refundedAmountCents: refundSummary.refundedAmountCents,
      stripeRefundIds: refundSummary.stripeRefundIds,
      refundedPaymentIds: result.updatedPayments.map((payment: { id: string }) => payment.id),
    },
    { status: 200 },
  );
}
