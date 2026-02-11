import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const uniqueStrings = (values: unknown[]): string[] => {
  return Array.from(new Set(values.map((value) => String(value)).filter(Boolean)));
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.isAdmin && invite.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (invite.type !== 'player' || !invite.teamId || !invite.userId) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  const now = new Date();
  const ok = await prisma.$transaction(async (tx) => {
    const team = await tx.volleyBallTeams.findUnique({ where: { id: invite.teamId as string } });
    if (!team) {
      return false;
    }

    const playerIds = Array.isArray(team.playerIds) ? team.playerIds : [];
    const pending = Array.isArray(team.pending) ? team.pending : [];

    const nextPlayerIds = uniqueStrings([...playerIds, invite.userId]);
    const nextPending = pending.filter((userId) => userId !== invite.userId);

    await tx.volleyBallTeams.update({
      where: { id: invite.teamId as string },
      data: {
        playerIds: nextPlayerIds,
        pending: nextPending,
        updatedAt: now,
      },
    });

    // Keep userData.teamIds consistent with team membership.
    const user = await tx.userData.findUnique({ where: { id: invite.userId as string } });
    if (user) {
      const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
      const nextTeamIds = uniqueStrings([...teamIds, invite.teamId]);
      await tx.userData.update({
        where: { id: invite.userId as string },
        data: {
          teamIds: nextTeamIds,
          updatedAt: now,
        },
      });
    }

    await tx.invites.delete({ where: { id: invite.id } });
    return true;
  });

  if (!ok) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

