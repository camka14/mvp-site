import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

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
    const allowed = (invite.userId && invite.userId === session.userId)
      || (invite.createdBy && invite.createdBy === session.userId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  await prisma.$transaction(async (tx) => {
    // If a team invite is deleted (declined/uninvited), remove the user from the team's pending list
    // so they can't accept an invite that no longer exists.
    if (invite.type === 'player' && invite.teamId && invite.userId) {
      const teamsDelegate = getTeamsDelegate(tx);
      const team = await teamsDelegate?.findUnique({ where: { id: invite.teamId } });
      if (team) {
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
