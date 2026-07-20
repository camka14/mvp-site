import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { acceptTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';
import {
  loadCanonicalTeamById,
  normalizeIdList,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';

export const dynamic = 'force-dynamic';

type TeamStaffRole = 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';

const inviteStaffRoles = (value: unknown): TeamStaffRole[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((entry) => String(entry ?? '').trim().toUpperCase())
    .filter((entry): entry is TeamStaffRole => (
      entry === 'MANAGER' || entry === 'HEAD_COACH' || entry === 'ASSISTANT_COACH'
    ))));
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const now = new Date();
  let invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite || invite.type !== 'TEAM' || !invite.teamId || !['PENDING', 'FAILED'].includes(invite.status ?? '')) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }
  if (!verifyTeamInviteShareLink(invite, {
    version: req.nextUrl.searchParams.get('v'),
    expiresAt: req.nextUrl.searchParams.get('e'),
    signature: req.nextUrl.searchParams.get('s'),
  }, now)) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }

  if (invite.userId && invite.userId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'This invite belongs to another account' }, { status: 403 });
  }

  if (!invite.userId) {
    try {
      invite = await prisma.$transaction(async (tx) => {
        const staffRoles = inviteStaffRoles(invite!.staffTypes);
        const claimed = await tx.invites.updateMany({
          where: { id: invite!.id, userId: null, status: { in: ['PENDING', 'FAILED'] } },
          data: { userId: session.userId, claimedBy: session.userId, status: 'PENDING', updatedAt: now },
        });
        if (claimed.count !== 1) throw new Error('Invite unavailable');

        const team = await loadCanonicalTeamById(invite!.teamId!, tx);
        if (!team) throw new Error('Team not found');
        if (staffRoles.length > 0) {
          await Promise.all(staffRoles.map((role) => tx.teamStaffAssignments.upsert({
            where: {
              teamId_userId_role: {
                teamId: invite!.teamId!,
                userId: session.userId,
                role,
              },
            },
            create: {
              id: `${invite!.teamId!}__${role}__${session.userId}`,
              teamId: invite!.teamId!,
              userId: session.userId,
              role,
              status: 'INVITED',
              createdBy: invite!.createdBy ?? session.userId,
              createdAt: now,
              updatedAt: now,
            },
            update: {
              status: 'INVITED',
              updatedAt: now,
            },
          })));
        } else {
          const activeIds = normalizeIdList((team as any).playerIds);
          const pendingIds = normalizeIdList((team as any).pending);
          const teamSize = Math.max(0, Math.trunc(Number((team as any).teamSize) || 0));
          if (!activeIds.includes(session.userId) && !pendingIds.includes(session.userId) && teamSize > 0 && activeIds.length + pendingIds.length >= teamSize) {
            throw new Error('Team is full');
          }
          await syncCanonicalTeamRoster({
            teamId: invite!.teamId!,
            captainId: (team as any).captainId,
            playerIds: activeIds,
            pendingPlayerIds: Array.from(new Set([...pendingIds, session.userId])),
            managerId: (team as any).managerId,
            headCoachId: (team as any).headCoachId,
            assistantCoachIds: normalizeIdList((team as any).coachIds),
            actingUserId: session.userId,
            now,
            cleanupRemovedPendingInvites: false,
          }, tx);
        }
        return tx.invites.findUnique({ where: { id } });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invite unavailable';
      if (message === 'Team is full') {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (message === 'Team not found') {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message === 'Invite unavailable') {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw error;
    }
  }

  if (!invite) return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  const result = await acceptTeamInviteWithGuardianRules({ invite, session, now });
  return NextResponse.json(result.body, { status: result.status });
}
