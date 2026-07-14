import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { clearBlockReports } from '@/server/moderation';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';
import { withDerivedCanonicalTeamIds } from '@/server/teams/teamMembership';

const removeId = (value: string[] | null | undefined, id: string): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
    .filter((entry) => entry !== id.trim())
);

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ targetUserId: string }> },
) {
  const session = await requireSession(req);
  const { targetUserId } = await params;
  const normalizedTargetUserId = targetUserId.trim();
  if (!normalizedTargetUserId) {
    return NextResponse.json({ error: 'Target user id is required.' }, { status: 400 });
  }

  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      const actor = await tx.userData.findUnique({ where: { id: session.userId } });
      if (!actor) {
        throw new Response('User not found.', { status: 404 });
      }

      await clearBlockReports(tx, actor.id, normalizedTargetUserId);
      const updatedActor = await tx.userData.update({
        where: { id: actor.id },
        data: {
          blockedUserIds: removeId(actor.blockedUserIds, normalizedTargetUserId),
          updatedAt: new Date(),
        },
      });
      const [actorWithDerivedTeamIds] = await withDerivedCanonicalTeamIds([updatedActor], tx);
      return actorWithDerivedTeamIds;
    });

    return NextResponse.json(
      { user: applyNameCaseToUserFields(updatedUser) },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return toSocialErrorResponse(error);
  }
}
