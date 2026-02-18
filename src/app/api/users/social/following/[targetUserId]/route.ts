import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { unfollowUser } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ targetUserId: string }> }) {
  const session = await requireSession(req);
  const { targetUserId } = await params;

  try {
    const user = await unfollowUser(session.userId, targetUserId);
    return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
