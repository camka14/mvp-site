import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
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
        user: withLegacyFields(applyNameCaseToUserFields(socialGraph.user)),
        friends: withLegacyList(applyUserPrivacyList(socialGraph.friends, visibilityContext)),
        following: withLegacyList(applyUserPrivacyList(socialGraph.following, visibilityContext)),
        followers: withLegacyList(applyUserPrivacyList(socialGraph.followers, visibilityContext)),
        incomingFriendRequests: withLegacyList(
          applyUserPrivacyList(socialGraph.incomingFriendRequests, visibilityContext),
        ),
        outgoingFriendRequests: withLegacyList(
          applyUserPrivacyList(socialGraph.outgoingFriendRequests, visibilityContext),
        ),
        blocked: withLegacyList(applyUserPrivacyList(socialGraph.blocked, visibilityContext)),
      },
      { status: 200 },
    );
  } catch (error) {
    return toSocialErrorResponse(error);
  }
}
