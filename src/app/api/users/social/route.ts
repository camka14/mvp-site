import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { getSocialGraphForUser } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);

  try {
    const socialGraph = await getSocialGraphForUser(session.userId);
    return NextResponse.json(
      {
        user: withLegacyFields(socialGraph.user),
        friends: withLegacyList(socialGraph.friends),
        following: withLegacyList(socialGraph.following),
        followers: withLegacyList(socialGraph.followers),
        incomingFriendRequests: withLegacyList(socialGraph.incomingFriendRequests),
        outgoingFriendRequests: withLegacyList(socialGraph.outgoingFriendRequests),
      },
      { status: 200 },
    );
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
