import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import { listActiveChildIdsForParent } from '@/server/teams/teamGuardianInvites';
import {
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import { acquireEventLock } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const getTeamsDelegate = (client: any) => client?.teams;

/**
 * Returns one invitation only to its recipient (or a linked guardian for an
 * active child TEAM invite). This is intentionally narrower than management
 * APIs so a push ID cannot become an invitation-enumeration primitive.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(_req);
  const { id } = await params;
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const inviteeId = invite.userId?.trim() || null;
  const isDirectRecipient = inviteeId === session.userId;
  const isPendingChildTeamInvite = normalizeInviteType(invite.type) === 'TEAM'
    && String(invite.status ?? '').toUpperCase() === 'PENDING'
    && !!inviteeId;
  const childInviteeIds = !session.isAdmin && !isDirectRecipient && isPendingChildTeamInvite
    ? await listActiveChildIdsForParent(prisma, session.userId)
    : [];
  const isLinkedGuardian = !!inviteeId && childInviteeIds.includes(inviteeId);

  // Use the same result for absent and unauthorized rows so a caller cannot
  // probe invitation identifiers from notification payloads.
  if (!session.isAdmin && !isDirectRecipient && !isLinkedGuardian) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ invite: invite }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const eventStaffId = normalizeInviteType(invite.type) === 'STAFF'
    && typeof invite.eventId === 'string'
    && invite.eventId.trim()
    ? invite.eventId.trim()
    : null;
  if (eventStaffId) {
    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventStaffId);
      const lockedInvite = await tx.invites.findUnique({ where: { id } });
      if (
        !lockedInvite
        || normalizeInviteType(lockedInvite.type) !== 'STAFF'
        || lockedInvite.eventId !== eventStaffId
      ) {
        return { status: 404, body: { error: 'Not found' } };
      }

      let allowed = session.isAdmin
        || (lockedInvite.userId && lockedInvite.userId === session.userId)
        || (lockedInvite.createdBy && lockedInvite.createdBy === session.userId);
      if (!allowed) {
        const event = await tx.events.findUnique({
          where: { id: eventStaffId },
          select: {
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
          },
        });
        allowed = await canManageEvent(session, event, tx);
      }
      if (!allowed) {
        return { status: 403, body: { error: 'Forbidden' } };
      }

      await tx.invites.delete({ where: { id: lockedInvite.id } });
      return { status: 200, body: { deleted: true } };
    });

    return NextResponse.json(result.body, { status: result.status });
  }

  if (!session.isAdmin) {
    let allowed = (invite.userId && invite.userId === session.userId)
      || (invite.createdBy && invite.createdBy === session.userId);
    if (!allowed && normalizeInviteType(invite.type) === 'STAFF') {
      if (invite.eventId) {
        const event = await prisma.events.findUnique({
          where: { id: invite.eventId },
          select: {
            hostId: true,
            assistantHostIds: true,
            organizationId: true,
          },
        });
        allowed = await canManageEvent(session, event, prisma);
      } else if (invite.organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: invite.organizationId },
          select: {
            id: true,
            ownerId: true,
          },
        });
        allowed = await canManageOrganization(session, organization, prisma);
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (normalizeInviteType(invite.type) === 'TEAM' && invite.teamId && invite.userId) {
      const teamsDelegate = getTeamsDelegate(tx);
      const team = await teamsDelegate?.findUnique({ where: { id: invite.teamId } });
      if (team && Array.isArray(team.pending) && team.pending.includes(invite.userId)) {
        const pending = Array.isArray(team.pending) ? team.pending : [];
        const nextPending = pending.filter((userId: string) => userId !== invite.userId);
        await teamsDelegate.update({
            where: { id: invite.teamId },
            data: {
              pending: nextPending,
              updatedAt: now,
            },
          });
      }
      await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);
      await removeCanonicalPendingInvitee(tx, invite, session.userId, now);
    }

    await tx.invites.delete({ where: { id: invite.id } });
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
