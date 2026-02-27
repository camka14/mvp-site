import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';

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
      userIds: true,
      waitListIds: true,
      freeAgentIds: true,
      teamIds: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const normalizedTeamId = normalizeId(parsed.data.teamId);
  const canManageCurrentEvent = await canManageEvent(session, event);
  const now = new Date();

  if (normalizedTeamId) {
    const eventTeamIds = normalizeIdList(event.teamIds);
    if (!eventTeamIds.includes(normalizedTeamId)) {
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
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const teamManagerIds = new Set<string>([
      ...normalizeIdList(team.coachIds),
      normalizeId(team.captainId),
      normalizeId(team.managerId),
      normalizeId(team.headCoachId),
    ].filter((entry): entry is string => Boolean(entry)));
    const canManageTeam = teamManagerIds.has(session.userId);

    if (!session.isAdmin && !canManageCurrentEvent && !canManageTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existingWaitingRequest = await prisma.refundRequests.findFirst({
      where: {
        eventId: event.id,
        teamId: normalizedTeamId,
        status: 'WAITING',
      },
      select: { id: true },
    });

    if (existingWaitingRequest) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        refundId: existingWaitingRequest.id,
        refundAlreadyPending: true,
      }, { status: 200 });
    }

    const created = await prisma.refundRequests.create({
      data: {
        id: crypto.randomUUID(),
        eventId: event.id,
        userId: session.userId,
        hostId: event.hostId,
        organizationId: event.organizationId,
        teamId: normalizedTeamId,
        reason: normalizeId(parsed.data.reason) ?? 'team_refund_requested',
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
  for (const id of normalizeIdList(event.userIds)) refundUserIds.add(id);
  for (const id of normalizeIdList(event.freeAgentIds)) refundUserIds.add(id);

  const eventTeamIds = normalizeIdList(event.teamIds);
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
  refundUserIds.delete(event.hostId);

  const targets = Array.from(refundUserIds);
  if (!targets.length) {
    return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
  }

  // Avoid creating duplicate refund requests for the same event/user pair.
  const existing = await prisma.refundRequests.findMany({
    where: {
      eventId: event.id,
      userId: { in: targets },
      teamId: null,
    },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((row) => row.userId));
  const toCreate = targets.filter((id) => !existingSet.has(id));

  if (toCreate.length) {
    await prisma.refundRequests.createMany({
      data: toCreate.map((userId) => ({
        id: crypto.randomUUID(),
        eventId: event.id,
        userId,
        hostId: event.hostId,
        organizationId: event.organizationId,
        reason: 'event_deleted_by_host',
        status: 'WAITING',
        createdAt: now,
        updatedAt: now,
      })),
    });
  }

  return NextResponse.json({ success: true, emailSent: false }, { status: 200 });
}
