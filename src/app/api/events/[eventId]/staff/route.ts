import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { canManageEvent } from '@/server/accessControl';
import {
  EVENT_STAFF_REVISION_CONFLICT_CODE,
  EventStaffInputError,
  EventStaffNotFoundError,
  EventStaffRevisionConflictError,
  eventStaffPutSchema,
  loadEventStaffSnapshot,
  loadLockedEventStaffSnapshot,
  reconcileEventStaffDesiredState,
} from '@/server/events/eventStaffReconciliation';
import { sendInviteEmails } from '@/server/inviteEmails';
import { acquireEventLock } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

class EventStaffForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'EventStaffForbiddenError';
  }
}

const loadAccessEvent = async (client: any, eventId: string) => client.events.findUnique({
  where: { id: eventId },
  select: {
    id: true,
    hostId: true,
    assistantHostIds: true,
    organizationId: true,
    state: true,
  },
});

const toErrorResponse = (error: unknown): Response => {
  if (error instanceof Response) {
    return error;
  }
  if (error instanceof EventStaffNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof EventStaffForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof EventStaffRevisionConflictError) {
    return NextResponse.json({
      error: error.message,
      code: EVENT_STAFF_REVISION_CONFLICT_CODE,
      currentRevision: error.currentRevision,
    }, { status: 409 });
  }
  if (error instanceof EventStaffInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error('Event staff reconciliation failed', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const { eventId } = await params;
    const snapshot = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const event = await loadAccessEvent(tx, eventId);
      if (!event) {
        throw new EventStaffNotFoundError();
      }
      if (!(await canManageEvent(session, event, tx))) {
        throw new EventStaffForbiddenError();
      }
      return loadEventStaffSnapshot(tx, eventId);
    });
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const { eventId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = eventStaffPutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid event staff state',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const event = await loadAccessEvent(tx, eventId);
      if (!event) {
        throw new EventStaffNotFoundError();
      }
      if (!(await canManageEvent(session, event, tx))) {
        throw new EventStaffForbiddenError();
      }
      return reconcileEventStaffDesiredState(
        tx,
        eventId,
        parsed.data,
        session.userId,
      );
    });

    if (result.emailCandidates.length) {
      try {
        await sendInviteEmails(result.emailCandidates, getRequestOrigin(req));
      } catch (error) {
        // Staff membership is already committed. Delivery is retryable and must
        // never turn a complete staff save into a partially persisted one.
        console.error('Event staff invite delivery failed after commit', { eventId, error });
        await prisma.$transaction(async (tx) => {
          await acquireEventLock(tx, eventId);
          await tx.invites.updateMany({
            where: {
              id: { in: result.emailCandidates.map((invite) => invite.id) },
              eventId,
              type: 'STAFF',
              status: 'PENDING',
            },
            data: {
              status: 'FAILED',
              sentAt: null,
              updatedAt: new Date(),
            },
          });
        }).catch((persistError) => {
          console.error('Failed to mark undelivered event staff invites retryable', {
            eventId,
            persistError,
          });
        });
      }
    }

    const snapshot = await loadLockedEventStaffSnapshot(prisma, eventId);
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
