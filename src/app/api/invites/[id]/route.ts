import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
            hostIds: true,
            officialIds: true,
          },
        });
        allowed = await canManageOrganization(session, organization, prisma);
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

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
            updatedAt: new Date(),
          },
        });
      }
    }

    await tx.invites.delete({ where: { id: invite.id } });
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
