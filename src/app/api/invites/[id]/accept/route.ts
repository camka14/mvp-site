import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';

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
    const teamsDelegate = getTeamsDelegate(tx);
    const team = await teamsDelegate?.findUnique({ where: { id: invite.teamId as string } });
    if (!team) {
      return false;
    }

    const pending = Array.isArray(team.pending) ? team.pending : [];
    const isPlayerInvite = pending.includes(invite.userId as string);
    const profileTeamIds = [invite.teamId as string];
    const chatSyncTeamIds = [invite.teamId as string];
    const previousMemberIdsByTeamId = new Map<string, string[]>([
      [invite.teamId as string, getTeamChatBaseMemberIds(team)],
    ]);

    if (isPlayerInvite) {
      await teamsDelegate.update({
        where: { id: invite.teamId as string },
        data: {
          playerIds: uniqueStrings([...(Array.isArray(team.playerIds) ? team.playerIds : []), invite.userId]),
          pending: pending.filter((userId: string) => userId !== invite.userId),
          updatedAt: now,
        },
      });

      const childTeams = await teamsDelegate.findMany({
        where: { parentTeamId: invite.teamId as string },
        select: {
          id: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
          playerIds: true,
        },
      });
      const childTeamIds = childTeams.map((childTeam: { id: string }) => childTeam.id);
      const activeEvents = childTeamIds.length
        ? await tx.events.findMany({
          where: {
            end: { gt: now },
            teamIds: { hasSome: childTeamIds },
          },
          select: { teamIds: true },
        })
        : [];
      const activeChildTeamIdSet = new Set(
        activeEvents.flatMap((event) => (Array.isArray(event.teamIds) ? event.teamIds : [])),
      );

      for (const childTeam of childTeams) {
        if (!activeChildTeamIdSet.has(childTeam.id)) {
          continue;
        }
        chatSyncTeamIds.push(childTeam.id);
        previousMemberIdsByTeamId.set(childTeam.id, getTeamChatBaseMemberIds(childTeam));
        await teamsDelegate.update({
          where: { id: childTeam.id },
          data: {
            playerIds: uniqueStrings([...(Array.isArray(childTeam.playerIds) ? childTeam.playerIds : []), invite.userId]),
            updatedAt: now,
          },
        });
      }

      const user = await tx.userData.findUnique({
        where: { id: invite.userId as string },
        select: { teamIds: true },
      });
      if (user) {
        await tx.userData.update({
          where: { id: invite.userId as string },
          data: {
            teamIds: uniqueStrings([...(Array.isArray(user.teamIds) ? user.teamIds : []), ...profileTeamIds]),
            updatedAt: now,
          },
        });
      }
    }

    for (const teamId of Array.from(new Set(chatSyncTeamIds))) {
      await syncTeamChatInTx(tx, teamId, {
        previousMemberIds: previousMemberIdsByTeamId.get(teamId),
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

