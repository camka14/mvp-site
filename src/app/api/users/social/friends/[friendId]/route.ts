import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { removeFriend } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ friendId: string }> }) {
  const session = await requireSession(req);
  const { friendId } = await params;

  try {
    const user = await removeFriend(session.userId, friendId);
    return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
