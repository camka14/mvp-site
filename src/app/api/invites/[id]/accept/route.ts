import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { loadCanonicalTeamById, syncCanonicalTeamRoster } from '@/server/teams/teamMembership';
import { acceptTeamInviteEventSyncs } from '@/server/teams/teamInviteEventSync';

export const dynamic = 'force-dynamic';

const uniqueStrings = (values: unknown[]): string[] => Array.from(
  new Set(values.map((value) => String(value)).filter(Boolean)),
);

const getTeamsDelegate = (client: any) => client?.teams ?? client?.volleyBallTeams;

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

  const inviteType = normalizeInviteType(invite.type);
  if (!inviteType) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  if (inviteType === 'STAFF') {
    await prisma.invites.delete({ where: { id: invite.id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (inviteType !== 'TEAM' || !invite.teamId || !invite.userId) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  const now = new Date();
  const ok = await prisma.$transaction(async (tx) => {
    const team = await loadCanonicalTeamById(invite.teamId as string, tx);
    if (!team) {
      return false;
    }

    const pending = Array.isArray((team as any).pending) ? (team as any).pending : [];
    const isPlayerInvite = pending.includes(invite.userId as string);

    if (isPlayerInvite) {
      await syncCanonicalTeamRoster({
        teamId: invite.teamId as string,
        captainId: (team as any).captainId,
        playerIds: uniqueStrings([...(Array.isArray((team as any).playerIds) ? (team as any).playerIds : []), invite.userId as string]),
        pendingPlayerIds: pending.filter((userId: string) => userId !== invite.userId),
        managerId: (team as any).managerId,
        headCoachId: (team as any).headCoachId,
        assistantCoachIds: Array.isArray((team as any).coachIds) ? (team as any).coachIds : [],
        actingUserId: session.userId,
        now,
      }, tx);
    }

    await syncTeamChatInTx(tx, invite.teamId as string, {
      previousMemberIds: getTeamChatBaseMemberIds(team),
    });
    await acceptTeamInviteEventSyncs(tx, invite, now);

    await tx.invites.delete({ where: { id: invite.id } });
    return true;
  });

  if (!ok) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
