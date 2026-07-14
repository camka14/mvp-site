import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { getSocialGraphForUser } from '@/server/socialGraph';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';
import { applyUserPrivacyList, createVisibilityContext } from '@/server/userPrivacy';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);

  try {
    const socialGraph = await getSocialGraphForUser(session.userId);
    const visibilityContext = await createVisibilityContext(prisma, {
      viewerId: session.userId,
      isAdmin: session.isAdmin,
    });
    return NextResponse.json(
      {
        user: applyNameCaseToUserFields(socialGraph.user),
        friends: applyUserPrivacyList(socialGraph.friends, visibilityContext),
        following: applyUserPrivacyList(socialGraph.following, visibilityContext),
        followers: applyUserPrivacyList(socialGraph.followers, visibilityContext),
        incomingFriendRequests: applyUserPrivacyList(socialGraph.incomingFriendRequests, visibilityContext),
        outgoingFriendRequests: applyUserPrivacyList(socialGraph.outgoingFriendRequests, visibilityContext),
        blocked: applyUserPrivacyList(socialGraph.blocked, visibilityContext),
      },
      { status: 200 },
    );
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
