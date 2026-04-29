import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import {
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';

export const dynamic = 'force-dynamic';

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

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (normalizeInviteType(invite.type) === 'TEAM' && invite.teamId && invite.userId) {
      await rollbackTeamInviteEventSyncs(tx, invite, 'DECLINED', now);
      await removeCanonicalPendingInvitee(tx, invite, session.userId, now);
    }

    await tx.invites.update({
      where: { id },
      data: {
        status: 'DECLINED',
        updatedAt: now,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
