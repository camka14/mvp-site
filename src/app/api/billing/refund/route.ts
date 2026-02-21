import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

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

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeId(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
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
      hostId: true,
      organizationId: true,
      userIds: true,
      waitListIds: true,
      freeAgentIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const currentUserIds = normalizeIdList(event.userIds);
  const currentWaitlistIds = normalizeIdList(event.waitListIds);
  const currentFreeAgentIds = normalizeIdList(event.freeAgentIds);
  const isTargetInEvent = currentUserIds.includes(targetUserId)
    || currentWaitlistIds.includes(targetUserId)
    || currentFreeAgentIds.includes(targetUserId);

  if (!isTargetInEvent) {
    return NextResponse.json(
      { error: 'Selected user is not currently registered, waitlisted, or listed as a free agent for this event.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const reason = normalizeId(parsed.data.reason) ?? 'requested_by_customer';

  const result = await prisma.$transaction(async (tx) => {
    const existingWaitingRequest = await tx.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        status: 'WAITING',
      },
      select: { id: true },
    });

    await tx.events.update({
      where: { id: eventId },
      data: {
        userIds: currentUserIds.filter((id) => id !== targetUserId),
        waitListIds: currentWaitlistIds.filter((id) => id !== targetUserId),
        freeAgentIds: currentFreeAgentIds.filter((id) => id !== targetUserId),
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
