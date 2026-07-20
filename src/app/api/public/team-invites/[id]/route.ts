import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';

export const dynamic = 'force-dynamic';

const inviteRole = (staffTypes: unknown): 'PLAYER' | 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' => {
  if (!Array.isArray(staffTypes)) return 'PLAYER';
  const role = staffTypes
    .map((value) => String(value ?? '').trim().toUpperCase())
    .find((value) => ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'].includes(value));
  return (role as 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' | undefined) ?? 'PLAYER';
};

const unavailable = () => NextResponse.json({ available: false }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite || invite.type !== 'TEAM' || !invite.teamId || !['PENDING', 'FAILED'].includes(invite.status ?? '')) {
    return unavailable();
  }
  if (!verifyTeamInviteShareLink(invite, {
    version: req.nextUrl.searchParams.get('v'),
    expiresAt: req.nextUrl.searchParams.get('e'),
    signature: req.nextUrl.searchParams.get('s'),
  })) {
    return unavailable();
  }

  const team = await prisma.canonicalTeams.findUnique({
    where: { id: invite.teamId },
    select: { id: true, name: true, sport: true, division: true, teamSize: true },
  });
  if (!team) return unavailable();

  return NextResponse.json({
    available: true,
    invite: {
      id: invite.id,
      firstName: invite.firstName,
      expiresAt: invite.linkExpiresAt,
      role: inviteRole(invite.staffTypes),
    },
    team,
  });
}
