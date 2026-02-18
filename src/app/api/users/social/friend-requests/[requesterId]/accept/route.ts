import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { acceptFriendRequest } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

export async function POST(req: NextRequest, { params }: { params: Promise<{ requesterId: string }> }) {
  const session = await requireSession(req);
  const { requesterId } = await params;

  try {
    const user = await acceptFriendRequest(session.userId, requesterId);
    return NextResponse.json({ user: withLegacyFields(user) }, { status: 200 });
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
