import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageEvent } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['WAITING', 'APPROVED', 'REJECTED']),
}).passthrough();

const TEAM_REFUND_FANOUT_REASON = 'team_refund_fanout';

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

type RefundRequestRow = {
  id: string;
  eventId: string;
  teamId: string | null;
  userId: string;
  hostId: string | null;
  organizationId: string | null;
  reason: string;
  status: 'WAITING' | 'APPROVED' | 'REJECTED' | null;
};

const resolveTeamRefundTargetUserIds = async (
  tx: any,
  request: RefundRequestRow,
): Promise<string[]> => {
  const teamId = normalizeId(request.teamId);
  if (!teamId) {
    return [];
  }

  const team = await tx.teams.findUnique({
    where: { id: teamId },
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
    return [];
  }

  const memberUserIds = Array.from(
    new Set([
      ...normalizeIdList(team.playerIds),
      ...normalizeIdList(team.coachIds),
      normalizeId(team.captainId),
      normalizeId(team.managerId),
      normalizeId(team.headCoachId),
    ].filter((entry): entry is string => Boolean(entry))),
  );

  const teamBills = await tx.bills.findMany({
    where: {
      eventId: request.eventId,
      ownerType: 'TEAM',
      ownerId: teamId,
    },
    select: { id: true },
  });
  const teamBillIds = teamBills.map((bill: { id: string }) => bill.id);

  const splitUserBills = teamBillIds.length
    ? await tx.bills.findMany({
        where: {
          parentBillId: { in: teamBillIds },
          ownerType: 'USER',
        },
        select: { id: true, ownerId: true },
      })
    : [];
  const directUserBills = memberUserIds.length
    ? await tx.bills.findMany({
        where: {
          eventId: request.eventId,
          ownerType: 'USER',
          ownerId: { in: memberUserIds },
        },
        select: { id: true, ownerId: true },
      })
    : [];
  const billIdsForPayerLookup = Array.from(
    new Set([
      ...teamBillIds,
      ...splitUserBills.map((bill: { id: string }) => bill.id),
      ...directUserBills.map((bill: { id: string }) => bill.id),
    ]),
  );
  const billPayers = billIdsForPayerLookup.length
    ? await tx.billPayments.findMany({
        where: {
          billId: { in: billIdsForPayerLookup },
          payerUserId: { not: null },
        },
        select: { payerUserId: true },
      })
    : [];

  const splitBillUserIds = normalizeIdList(splitUserBills.map((bill: { ownerId: string }) => bill.ownerId));
  if (splitBillUserIds.length) {
    return splitBillUserIds;
  }

  const directBillUserIds = normalizeIdList(directUserBills.map((bill: { ownerId: string }) => bill.ownerId));
  if (directBillUserIds.length) {
    return directBillUserIds;
  }

  const payerUserIds = normalizeIdList(billPayers.map((payment: { payerUserId: string | null }) => payment.payerUserId));
  if (payerUserIds.length) {
    return payerUserIds;
  }

  const fallbackManagers = normalizeIdList([
    team.captainId,
    team.managerId,
    team.headCoachId,
  ]);
  if (fallbackManagers.length) {
    return fallbackManagers;
  }

  return memberUserIds.slice(0, 1);
};

const fanoutTeamRefundApproval = async (
  tx: any,
  request: RefundRequestRow,
  now: Date,
): Promise<string[]> => {
  const teamId = normalizeId(request.teamId);
  if (!teamId) {
    return [];
  }

  const targetUserIds = await resolveTeamRefundTargetUserIds(tx, request);
  if (!targetUserIds.length) {
    return [];
  }

  const existingRows = await tx.refundRequests.findMany({
    where: {
      eventId: request.eventId,
      teamId,
      reason: TEAM_REFUND_FANOUT_REASON,
      userId: { in: targetUserIds },
    },
    select: { id: true, userId: true },
  });
  const existingByUserId = new Map(existingRows.map((row: { id: string; userId: string }) => [row.userId, row.id]));

  for (const targetUserId of targetUserIds) {
    const existingId = existingByUserId.get(targetUserId);
    if (existingId) {
      await tx.refundRequests.update({
        where: { id: existingId },
        data: {
          status: 'APPROVED',
          hostId: request.hostId,
          organizationId: request.organizationId,
          updatedAt: now,
        },
      });
      continue;
    }

    await tx.refundRequests.create({
      data: {
        id: crypto.randomUUID(),
        eventId: request.eventId,
        userId: targetUserId,
        hostId: request.hostId,
        organizationId: request.organizationId,
        teamId,
        reason: TEAM_REFUND_FANOUT_REASON,
        status: 'APPROVED',
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return targetUserIds;
};

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
    select: {
      id: true,
      eventId: true,
      userId: true,
      hostId: true,
      teamId: true,
      organizationId: true,
      reason: true,
      status: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const eventAccess = await prisma.events.findUnique({
    where: { id: existing.eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  if (!eventAccess) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && !(await canManageEvent(session, eventAccess))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequests.update({
      where: { id },
      data: { status: parsed.data.status, updatedAt: now },
    });

    const fanoutUserIds = (
      parsed.data.status === 'APPROVED' && normalizeId(updated.teamId)
    )
      ? await fanoutTeamRefundApproval(tx, updated as RefundRequestRow, now)
      : [];

    return {
      updated,
      fanoutUserIds,
    };
  });

  return NextResponse.json(
    {
      ...withLegacyFields(result.updated),
      fanoutUserIds: result.fanoutUserIds,
    },
    { status: 200 },
  );
}
