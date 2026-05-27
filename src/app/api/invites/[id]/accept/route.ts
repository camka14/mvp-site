import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { acceptTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const inviteType = normalizeInviteType(invite.type);
  if (!inviteType) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  if (inviteType === 'STAFF') {
    if (!session.isAdmin && invite.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.invites.delete({ where: { id: invite.id } });
      if (invite.organizationId && invite.userId) {
        await tx.userData.updateMany({
          where: {
            id: invite.userId,
            homePageOrganizationId: null,
          },
          data: {
            homePageOrganizationId: invite.organizationId,
            updatedAt: now,
          },
        });
      }
    });
    return NextResponse.json({ ok: true, organizationId: invite.organizationId ?? null }, { status: 200 });
  }

  if (inviteType !== 'TEAM' || !invite.teamId || !invite.userId) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  const result = await acceptTeamInviteWithGuardianRules({
    invite,
    session,
    now: new Date(),
  });
  return NextResponse.json(result.body, { status: result.status });
}
